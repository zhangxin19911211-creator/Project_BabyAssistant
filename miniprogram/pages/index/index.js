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
    isGuardian: false // 是否是一级助教
  },

  onShow() {
    this.loadBabies()
  },

  async loadBabies() {
    try {
      // 清除缓存，确保获取最新数据
      api.clearCache('cache_babies')
      api.clearCache('cache_families')
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
      
      // 批量获取所有宝宝的最新记录（并行请求）
      const latestRecords = await Promise.all(
        babiesData.map(baby => api.getLatestRecord(baby._id))
      )
      
      // Process data for display
      const formattedBabies = babiesData.map((baby, index) => {
        const ageObj = util.calculateAge(baby.birthDate)
        const ageStr = util.formatAgeString(ageObj)
        const familyColorIndex = familyColorMap[baby.familyId] !== undefined ? familyColorMap[baby.familyId] : getColorIndexById(baby.familyId)
        
        return Object.assign({}, baby, {
          ageStr: ageStr,
          latestRecord: latestRecords[index],
          familyName: familyMap[baby.familyId] || '未知家庭',
          familyColorIndex: familyColorIndex
        })
      })
      
      this.setData({
        babies: formattedBabies,
        families: families,
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
    
    // 按家庭独立检查：计算所有guardian家庭还能添加的宝宝总数
    let canAddBaby = false
    let availableSlots = 0
    
    for (const family of guardianFamilies) {
      const babyCountInFamily = babies.filter(b => b.familyId === family._id).length
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

  async deleteBaby(e) {
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
              await this.loadBabies()
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
