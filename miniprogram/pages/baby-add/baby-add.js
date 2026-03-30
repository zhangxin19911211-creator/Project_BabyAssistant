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
    currentDate: util.formatTime(new Date()).replace(/\//g, '-')
  },

  onLoad() {
    this.loadFamilies()
  },

  async loadFamilies() {
    try {
      const families = await api.getFamilies()
      const familyOptions = families.map(f => ({
        _id: f._id,
        name: f.name
      }))
      this.setData({
        familyOptions
      })
    } catch (error) {
      console.error('加载家庭列表失败', error)
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
    }
  }
})
