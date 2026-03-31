// pages/index/index.js
const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

Page({
  data: {
    babies: [],
    canAddBaby: false, // 是否可以添加宝宝
    babiesInGuardianFamilies: 0, // 用户作为一级助教的家庭中的宝宝数量
    maxBabies: 3 // 每个家庭最多宝宝数
  },

  onShow() {
    this.loadBabies()
  },

  async loadBabies() {
    try {
      // 并行获取宝宝列表和家庭列表，减少等待时间
      const [babiesData, families] = await Promise.all([
        api.getBabies(),
        api.getFamilies()
      ])
      
      const familyMap = {}
      const familyColorMap = {}
      
      // 为每个家庭分配固定颜色（基于家庭 ID 的哈希）
      families.forEach(function(f, index) {
        familyMap[f._id] = f.name
        // 使用简单的哈希算法，确保相同家庭总是获得相同颜色
        let hash = 0
        for (let i = 0; i < f._id.length; i++) {
          hash = ((hash << 5) - hash) + f._id.charCodeAt(i)
          hash = hash & hash // Convert to 32bit integer
        }
        const colorIndex = Math.abs(hash) % 3 // 映射到 0-2
        familyColorMap[f._id] = colorIndex
      })
      
      // 批量获取所有宝宝的最新记录（并行请求）
      const latestRecords = await Promise.all(
        babiesData.map(baby => api.getLatestRecord(baby._id))
      )
      
      // Process data for display
      const formattedBabies = babiesData.map((baby, index) => {
        const ageObj = util.calculateAge(baby.birthDate)
        const ageStr = util.formatAgeString(ageObj)
        const familyColorIndex = familyColorMap[baby.familyId] || 0
        
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
   */
  calculateCanAddBaby(babies, families) {
    const userOpenid = getApp().globalData.userInfo.openid
    
    // 找出用户是一级助教的家庭
    const guardianFamilies = families.filter(f => {
      const member = f.members.find(m => m.openid === userOpenid)
      return member && member.permission === 'guardian'
    })
    
    if (guardianFamilies.length === 0) {
      return { canAddBaby: false, babiesInGuardianFamilies: 0 }
    }
    
    // 计算这些家庭中的宝宝总数
    const guardianFamilyIds = guardianFamilies.map(f => f._id)
    const babiesCount = babies.filter(baby => 
      guardianFamilyIds.includes(baby.familyId)
    ).length
    
    return {
      canAddBaby: babiesCount < this.data.maxBabies,
      babiesInGuardianFamilies: babiesCount
    }
  },

  async goToAddBaby() {
    try {
      // 检查用户是否有家庭
      const families = await api.getFamilies()
      if (families.length === 0) {
        wx.showToast({
          title: '请先新建家庭',
          icon: 'none'
        })
        return
      }
        
      // 检查用户是否是某个家庭的一级助教
      const userOpenid = getApp().globalData.userInfo.openid
      const isGuardian = families.some(f => {
        const member = f.members.find(m => m.openid === userOpenid)
        return member && member.permission === 'guardian'
      })
        
      if (!isGuardian) {
        wx.showToast({
          title: '只有一级助教才可以添加宝宝',
          icon: 'none'
        })
        return
      }
        
      // 检查该用户作为一级助教的家庭是否已经有 3 个宝宝
      const guardianFamilies = families.filter(f => {
        const member = f.members.find(m => m.openid === userOpenid)
        return member && member.permission === 'guardian'
      })
        
      const guardianFamilyIds = guardianFamilies.map(f => f._id)
      const babiesInGuardianFamilies = this.data.babies.filter(baby => 
        guardianFamilyIds.includes(baby.familyId)
      )
        
      if (babiesInGuardianFamilies.length >= 3) {
        wx.showToast({
          title: '您的家庭最多只能添加 3 个宝宝',
          icon: 'none'
        })
        return
      }
        
      wx.navigateTo({
        url: '/pages/baby-add/baby-add'
      })
    } catch (error) {
      console.error('检查权限失败', error)
      wx.showToast({
        title: '检查权限失败',
        icon: 'none'
      })
    }
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
