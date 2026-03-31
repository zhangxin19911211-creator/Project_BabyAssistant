// pages/baby-add/baby-add.js
const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

Page({
  data: {
    formData: {
      familyId: '',
      familyName: '',
      name: '',
      gender: 'male',
      birthDate: '',
      birthHeight: '',
      birthWeight: ''
    },
    familyOptions: [],
    currentDate: util.formatTime(new Date()).replace(/\//g, '-'),
    isSubmitting: false // 防止重复提交
  },

  async onLoad() {
    // 检查权限并加载家庭列表
    await this.checkAddBabyPermission()
  },

  async checkAddBabyPermission() {
    try {
      const families = await api.getFamilies()
      
      // 筛选出用户是一级助教 (guardian) 的家庭
      const guardianFamilies = families.filter(f => {
        const member = f.members.find(m => m.openid === getApp().globalData.userInfo.openid)
        return member && member.permission === 'guardian'
      })
      
      if (guardianFamilies.length === 0) {
        wx.showToast({ title: '只有一级助教才能添加宝宝', icon: 'none' })
        setTimeout(() => wx.navigateBack(), 1500)
        return
      }
      
      // 只显示用户是一级助教的家庭
      const familyOptions = guardianFamilies.map(f => ({
        _id: f._id,
        name: f.name
      }))
      
      this.setData({ familyOptions })
    } catch (error) {
      console.error('检查权限失败', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
      setTimeout(() => wx.navigateBack(), 1500)
    }
  },

  onFamilyChange(e) {
    const index = e.detail.value
    const selectedFamily = this.data.familyOptions[index]
    this.setData({
      'formData.familyId': selectedFamily._id,
      'formData.familyName': selectedFamily.name
    })
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({
      [`formData.${field}`]: e.detail.value
    })
  },

  onGenderChange(e) {
    this.setData({
      'formData.gender': e.detail.value
    })
  },

  onDateChange(e) {
    this.setData({
      'formData.birthDate': e.detail.value
    })
  },

  async submitForm() {
    // 防止重复提交
    if (this.data.isSubmitting) {
      return
    }
    
    const { familyId, name, gender, birthDate, birthHeight, birthWeight } = this.data.formData

    if (!familyId) {
      return wx.showToast({ title: '请选择所属家庭', icon: 'none' })
    }
    if (!name.trim()) {
      return wx.showToast({ title: '请输入宝宝姓名', icon: 'none' })
    }
    if (!birthDate) {
      return wx.showToast({ title: '请选择出生日期', icon: 'none' })
    }
    if (!birthHeight || isNaN(birthHeight) || birthHeight <= 0) {
      return wx.showToast({ title: '请输入正确的出生身高', icon: 'none' })
    }
    if (!birthWeight || isNaN(birthWeight) || birthWeight <= 0) {
      return wx.showToast({ title: '请输入正确的出生体重', icon: 'none' })
    }

    try {
      this.setData({ isSubmitting: true })
      
      await api.addBaby({
        familyId: familyId,
        name: name.trim(),
        gender,
        birthDate: birthDate.replace(/-/g, '/'),
        birthHeight: parseFloat(birthHeight),
        birthWeight: parseFloat(birthWeight)
      })
      
      wx.showToast({
        title: '添加成功',
        icon: 'success',
        success: () => {
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        }
      })
    } catch (e) {
      wx.showToast({
        title: e.message || '添加失败',
        icon: 'none'
      })
    } finally {
      this.setData({ isSubmitting: false })
    }
  }
})
