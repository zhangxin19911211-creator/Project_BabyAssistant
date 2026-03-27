// pages/index/index.js
const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

Page({
  data: {
    babies: []
  },

  onShow() {
    this.loadBabies()
  },

  async loadBabies() {
    try {
      const babiesData = await api.getBabies()
      
      // Process data for display
      const formattedBabies = []
      for (const baby of babiesData) {
        const ageObj = util.calculateAge(baby.birthDate)
        const ageStr = util.formatAgeString(ageObj)
        const latestRecord = await api.getLatestRecord(baby._id)
        
        formattedBabies.push({
          ...baby,
          ageStr,
          latestRecord
        })
      }
      
      this.setData({
        babies: formattedBabies
      })
    } catch (error) {
      console.error('加载宝宝信息失败', error)
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      })
    }
  },

  goToAddBaby() {
    if (this.data.babies.length >= 4) {
      wx.showToast({
        title: '最多只能添加4个宝宝',
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
  }
})
