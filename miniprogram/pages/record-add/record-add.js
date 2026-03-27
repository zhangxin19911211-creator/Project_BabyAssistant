// pages/record-add/record-add.js
const api = require('../../utils/api.js')
const util = require('../../utils/util.js')

Page({
  data: {
    babyId: '',
    baby: null,
    formData: {
      height: '',
      weight: '',
      recordDate: ''
    },
    currentDate: util.formatTime(new Date()).replace(/\//g, '-'),
    calculatedAge: ''
  },

  async onLoad(options) {
    if (options.babyId) {
      try {
        const baby = await api.getBabyById(options.babyId)
        const today = util.formatTime(new Date()).replace(/\//g, '-')
        
        this.setData({
          babyId: options.babyId,
          baby: baby,
          'formData.recordDate': today
        })
        
        this.updateCalculatedAge(today)
      } catch (error) {
        console.error('获取宝宝信息失败', error)
        wx.showToast({
          title: '加载失败，请重试',
          icon: 'none'
        })
      }
    }
  },

  onInput(e) {
    const field = e.currentTarget.dataset.field
    this.setData({
      [`formData.${field}`]: e.detail.value
    })
  },

  onDateChange(e) {
    const newDate = e.detail.value
    this.setData({
      'formData.recordDate': newDate
    })
    this.updateCalculatedAge(newDate)
  },

  updateCalculatedAge(dateStr) {
    if (!this.data.baby) return
    const ageObj = util.calculateAge(this.data.baby.birthDate, dateStr.replace(/-/g, '/'))
    
    // Don't show negative age
    if (ageObj.years < 0 || (ageObj.years === 0 && ageObj.months < 0)) {
      this.setData({ calculatedAge: '录入时间不能早于出生日期' })
      return
    }
    
    this.setData({
      calculatedAge: util.formatAgeString(ageObj)
    })
  },

  async submitForm() {
    const { height, weight, recordDate } = this.data.formData

    if (!height || isNaN(height) || height <= 0) {
      return wx.showToast({ title: '请输入正确的身高', icon: 'none' })
    }
    if (!weight || isNaN(weight) || weight <= 0) {
      return wx.showToast({ title: '请输入正确的体重', icon: 'none' })
    }
    if (!recordDate) {
      return wx.showToast({ title: '请选择录入时间', icon: 'none' })
    }
    
    if (this.data.calculatedAge === '录入时间不能早于出生日期') {
      return wx.showToast({ title: '录入时间不能早于出生日期', icon: 'none' })
    }

    try {
      await api.addRecord({
        babyId: this.data.babyId,
        height: parseFloat(height),
        weight: parseFloat(weight),
        recordDate: recordDate.replace(/-/g, '/')
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
