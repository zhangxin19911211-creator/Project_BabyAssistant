// pages/index/index.js
const api = require('../../utils/api.js')
const util = require('../../utils/util.js')
const { getColorIndexById } = require('../../utils/util.js')

Page({
  data: {
    babies: [],
    families: [],
    canAddBaby: false, // 是否可以添加宝宝
    availableSlots: 0, // 所有guardian家庭还能添加的宝宝总数
    hasFamily: false, // 是否有家庭
    isGuardian: false, // 是否是一级助教
    sortMode: false, // 首页宝宝拖拽排序（排序模式下列表在 scroll-view 内滚动，避免整页锁死）
    sortDragBabyId: '',
    sortDragItemStyle: '',
    /** 下次点击「年龄排序」：true=从大到小，false=从小到大（loadBabies 后重置为 true） */
    ageNextSortDesc: true,
    /** 当前年龄排序：null=未操作过，'desc'=从大到小，'asc'=从小到大（用于按钮 ↑↓） */
    ageSortDirection: null
  },

  onShow() {
    if (!this.data.sortMode) {
      this.loadBabies()
    }
    this.getTabBar().setData({
      selected: 0
    })
  },

  /** 下拉强制拉最新（loadBabies 内已会先失效缓存） */
  async onPullDownRefresh() {
    if (this.data.sortMode) {
      wx.stopPullDownRefresh()
      return
    }
    try {
      await this.loadBabies()
    } finally {
      wx.stopPullDownRefresh()
    }
  },

  async loadBabies() {
    try {
      api.invalidateMoodCaches()
      // 并行获取宝宝列表和家庭列表，减少等待时间
      const [babiesData, families] = await Promise.all([
        api.getBabies(),
        api.getFamilies()
      ])
      
      const familyMap = {}
      const familyColorMap = {}
      
      // 为每个家庭分配固定颜色（基于家庭ID哈希计算，无需数据库存储）
      families.forEach(function(f) {
        familyMap[f._id] = f.name
        // 使用ID哈希计算颜色索引，确保同一家庭始终显示相同颜色
        familyColorMap[f._id] = getColorIndexById(f._id)
      })
      
      // 批量获取所有宝宝的最新记录（单次云函数调用，避免 N+1）
      const latestRecordMap = await api.getLatestRecordsByBabyIds(
        babiesData.map(baby => baby._id)
      )
      
      // Process data for display
      const formattedBabies = babiesData.map((baby) => {
        const ageObj = util.calculateAge(baby.birthDate)
        const ageStr = util.formatAgeString(ageObj)
        const familyColorIndex = familyColorMap[baby.familyId] !== undefined ? familyColorMap[baby.familyId] : getColorIndexById(baby.familyId)
        
        return Object.assign({}, baby, {
          ageStr: ageStr,
          latestRecord: latestRecordMap[baby._id] || null,
          familyName: familyMap[baby.familyId] || '未知家庭',
          familyColorIndex: familyColorIndex
        })
      })
      
      this.setData({
        babies: formattedBabies,
        families: families,
        ageNextSortDesc: true,
        ageSortDirection: null,
        ...this.calculateCanAddBaby(formattedBabies, families)
      })
    } catch (error) {
      console.error('加载宝宝信息失败', error)
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      })
    }
  },

  /**
   * 计算用户是否可以添加宝宝
   * 按家庭独立检查：只要至少有一个guardian家庭的宝宝数<3，按钮就显示
   */
  calculateCanAddBaby(babies, families) {
    // 安全检查：确保用户已登录
    const app = getApp()
    if (!app.globalData || !app.globalData.userInfo || !app.globalData.userInfo.openid) {
      return { canAddBaby: false, availableSlots: 0, hasFamily: false, isGuardian: false }
    }
    
    const userOpenid = app.globalData.userInfo.openid
    
    // 检查是否有家庭
    const hasFamily = families.length > 0
    
    if (!hasFamily) {
      return { canAddBaby: false, availableSlots: 0, hasFamily: false, isGuardian: false }
    }
    
    // 找出用户是一级助教的家庭
    const guardianFamilies = families.filter(f => {
      const member = f.members.find(m => m.openid === userOpenid)
      return member && member.permission === 'guardian'
    })
    
    // 检查是否是一级助教
    const isGuardian = guardianFamilies.length > 0
    
    if (!isGuardian) {
      return { canAddBaby: false, availableSlots: 0, hasFamily: true, isGuardian: false }
    }
    
    const countByFamilyId = {}
    for (let i = 0; i < babies.length; i++) {
      const fid = babies[i].familyId
      if (fid) {
        countByFamilyId[fid] = (countByFamilyId[fid] || 0) + 1
      }
    }

    // 按家庭独立检查：计算所有guardian家庭还能添加的宝宝总数
    let canAddBaby = false
    let availableSlots = 0

    for (const family of guardianFamilies) {
      const babyCountInFamily = countByFamilyId[family._id] || 0
      const slotsInFamily = 3 - babyCountInFamily
      if (slotsInFamily > 0) {
        availableSlots += slotsInFamily
        canAddBaby = true
      }
    }
    
    return {
      canAddBaby: canAddBaby,
      availableSlots: availableSlots,
      hasFamily: true,
      isGuardian: true
    }
  },

  async goToAddBaby() {
    if (this.data.sortMode) {
      return
    }
    // 如果数据还没加载完成，先加载
    if (!this.data.families || this.data.families.length === 0) {
      await this.loadBabies()
    }
    
    // 直接使用 families.length 判断，避免异步加载导致的状态不一致
    const families = this.data.families || []
    
    // 情况1：没有家庭
    if (families.length === 0) {
      wx.showToast({
        title: '请先加入家庭或新建家庭',
        icon: 'none'
      })
      return
    }
    
    // 情况2：有家庭但不是一级助教
    if (!this.data.isGuardian) {
      wx.showToast({
        title: '只有一级助教才可以添加宝宝',
        icon: 'none'
      })
      return
    }
    
    // 情况3：是一级助教但所有家庭宝宝数量已达上限
    if (!this.data.canAddBaby) {
      wx.showToast({
        title: '您的家庭宝宝数量已达上限',
        icon: 'none'
      })
      return
    }
    
    wx.navigateTo({
      url: '/pages/baby-add/baby-add'
    })
  },

  goToDetail(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/baby-detail/baby-detail?id=${id}`
    })
  },

  onBabyCardTap(e) {
    if (this.data.sortMode) {
      return
    }
    this.goToDetail(e)
  },

  enterSortMode() {
    if (this.data.babies.length < 2) {
      return
    }
    this._clearSortDragVisual()
    this.setData({ sortMode: true })
  },

  /** 按出生日期排序：年龄从大到小=出生早的在前；再点一次从小到大=出生晚的在前 */
  onAgeSortTap() {
    if (this.data.sortMode) {
      return
    }
    const desc = this.data.ageNextSortDesc
    const babies = this.data.babies.slice()
    babies.sort((a, b) => {
      const ta = this._birthDateTs(a.birthDate)
      const tb = this._birthDateTs(b.birthDate)
      if (ta !== tb) {
        return desc ? ta - tb : tb - ta
      }
      return String(a._id).localeCompare(String(b._id))
    })
    this.setData({
      babies,
      ageNextSortDesc: !desc,
      ageSortDirection: desc ? 'desc' : 'asc',
      ...this.calculateCanAddBaby(babies, this.data.families || [])
    })
    wx.showToast({
      title: desc ? '已按年龄从大到小' : '已按年龄从小到大',
      icon: 'none'
    })
  },

  _birthDateTs(birthDate) {
    if (!birthDate) {
      return 0
    }
    const t = new Date(birthDate).getTime()
    return isNaN(t) ? 0 : t
  },

  async finishSortMode() {
    const ids = (this.data.babies || []).map((b) => b._id)
    if (ids.length < 2) {
      this._clearSortDragVisual()
      this.setData({ sortMode: false })
      return
    }
    wx.showLoading({ title: '保存中', mask: true })
    let savedOk = false
    try {
      await api.setHomeBabyOrder(ids)
      this._clearSortDragVisual()
      this.setData({ sortMode: false })
      savedOk = true
    } catch (err) {
      console.error('保存排序失败', err)
      wx.showToast({
        title: (err && err.message) || '保存失败',
        icon: 'none'
      })
    } finally {
      wx.hideLoading()
    }
    if (savedOk) {
      wx.showToast({ title: '已保存', icon: 'success' })
    }
  },

  _clearSortDragVisual() {
    this._dragStartClientY = undefined
    this._lastSortDragStep = undefined
    this._sortDragStartRect = null
    this.setData({
      sortDragBabyId: '',
      sortDragItemStyle: ''
    })
  },

  onSortTouchStart(e) {
    if (!this.data.sortMode) {
      return
    }
    const index = e.currentTarget.dataset.index
    const babies = this.data.babies
    const baby = babies[index]
    if (!baby) {
      return
    }
    this._dragStartClientY = e.touches[0].clientY
    this._lastSortDragStep = null
    this._sortDragStartRect = null
    const q = wx.createSelectorQuery().in(this)
    q.selectAll('#sort-list .baby-card-wrap').boundingClientRect()
    q.exec((res) => {
      const cards = res[0]
      if (cards && cards[index]) {
        const r = cards[index]
        this._sortDragStartRect = {
          top: r.top,
          left: r.left,
          right: r.right,
          bottom: r.bottom,
          width: r.width,
          height: r.height
        }
      }
    })
    this.setData({
      sortDragBabyId: baby._id,
      sortDragItemStyle:
        'transform:translate3d(0,0,0) scale(1.02);z-index:60;position:relative;'
    })
  },

  onSortTouchMove(e) {
    if (!this.data.sortMode || !this.data.sortDragBabyId) {
      return
    }
    if (this._dragStartClientY === undefined) {
      return
    }
    const deltaY = e.touches[0].clientY - this._dragStartClientY
    const stepped = Math.round(deltaY)
    if (this._lastSortDragStep === stepped) {
      return
    }
    this._lastSortDragStep = stepped
    this.setData({
      sortDragItemStyle:
        'transform:translate3d(0,' +
        stepped +
        'px,0) scale(1.02);z-index:60;position:relative;'
    })
  },

  onSortTouchEnd(e) {
    if (!this.data.sortMode) {
      this._clearSortDragVisual()
      return
    }
    const babyId = this.data.sortDragBabyId
    if (!babyId) {
      this._clearSortDragVisual()
      return
    }
    const touch = e.changedTouches && e.changedTouches[0]
    if (!touch) {
      this._clearSortDragVisual()
      return
    }
    const y = touch.clientY
    const query = wx.createSelectorQuery().in(this)
    query.selectAll('#sort-list .baby-card-wrap').boundingClientRect()
    query.exec((res) => {
      if (!this.data.sortMode) {
        this._clearSortDragVisual()
        return
      }
      let cards = res[0]
      if (!cards || !cards.length) {
        this._clearSortDragVisual()
        return
      }
      const babies = this.data.babies.slice()
      const fromIndex = babies.findIndex((b) => b._id === babyId)
      if (fromIndex < 0) {
        this._clearSortDragVisual()
        return
      }
      // 拖拽中的行在部分机型上 getBoundingClientRect 会随 transform 变化，
      // 用按下时保存的静态 rect 替换，才能用触点 Y 正确算出插入位置
      cards = cards.slice()
      if (this._sortDragStartRect) {
        cards[fromIndex] = this._sortDragStartRect
      }
      const toIndex = this._fingerYToInsertIndex(y, cards)
      if (toIndex === fromIndex) {
        this._clearSortDragVisual()
        return
      }
      const row = babies.splice(fromIndex, 1)[0]
      babies.splice(toIndex, 0, row)
      this.setData({
        babies,
        sortDragBabyId: '',
        sortDragItemStyle: ''
      })
    })
  },

  /**
   * 根据触点 Y 与各行几何（已修正拖拽行 rect）得到目标下标：落在第 i 与 i+1 行之间的缝隙之下则插入到 i+1。
   */
  _fingerYToInsertIndex(y, rects) {
    const n = rects.length
    if (n <= 1) {
      return 0
    }
    let target = 0
    for (let i = 0; i < n - 1; i++) {
      const mid = (rects[i].bottom + rects[i + 1].top) / 2
      if (y >= mid) {
        target = i + 1
      }
    }
    return target
  },

  async deleteBaby(e) {
    if (this.data.sortMode) {
      return
    }
    const id = e.currentTarget.dataset.id
    try {
      const hasPermission = await api.checkPermission(id, 'guardian')
      if (!hasPermission) {
        wx.showToast({
          title: '只有一级助教才可以删除宝宝',
          icon: 'none'
        })
        return
      }
      
      wx.showModal({
        title: '确认删除',
        content: '删除后宝宝的所有记录都将丢失，不可恢复',
        success: async (res) => {
          if (res.confirm) {
            try {
              await api.deleteBaby(id)
              // 本地就地更新列表，避免整页重载
              const babies = (this.data.babies || []).filter(baby => baby._id !== id)
              this.setData({
                babies,
                ...this.calculateCanAddBaby(babies, this.data.families || [])
              })
              wx.showToast({
                title: '删除成功',
                icon: 'success'
              })
            } catch (error) {
              console.error('删除宝宝失败', error)
              wx.showToast({
                title: '删除失败，请重试',
                icon: 'none'
              })
            }
          }
        }
      })
    } catch (error) {
      console.error('检查权限失败', error)
      wx.showToast({
        title: '检查权限失败',
        icon: 'none'
      })
    }
  }
})
