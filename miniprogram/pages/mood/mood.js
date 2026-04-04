// pages/mood/mood.js
const api = require('../../utils/api.js')

// 心情评价选项
const RATING_OPTIONS = [
  { value: 'good', label: '很乖', emoji: '😊' },
  { value: 'normal', label: '普通', emoji: '😐' },
  { value: 'naughty', label: '闹腾', emoji: '😫' },
  { value: 'sick', label: '生病', emoji: '🤒' }
]

// 权限等级
const PERMISSION_LEVELS = {
  'viewer': 1,
  'caretaker': 2,
  'guardian': 3
}

Page({
  data: {
    // 宝宝列表
    babies: [],
    allBabies: [],
    currentBabyId: null,
    currentBaby: null,
    
    // 日历数据
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    calendarDays: [],
    
    // 心情数据
    moods: [],
    
    // 活动日志
    activityLogs: [],
    allActivityLogs: [],
    hasMoreLogs: false,
    
    // 弹窗控制
    showBabySelector: false,
    showRatingModal: false,
    showDetailModal: false,
    showActivityModal: false,
    
    // 宝宝选择器
    selectedBabyId: null,
    
    // 评价弹窗
    ratingOptions: RATING_OPTIONS,
    selectedRating: null,
    selectedEmoji: null,
    moodNote: '',
    existingMood: null,
    ratingDate: null,
    canSubmit: false,  // 是否可提交
    
    // 语音录入（微信同声传译插件 WechatSI）
    // 注意：识别管理器实例不可放入 setData（会被序列化破坏，导致 stop/start 失效）
    isRecording: false,
    recordingTime: 0,
    voicePluginReady: false,
    todayHasMood: false,
    selectedBabyIds: [],
    selectedBabySet: {},
    
    // 详情弹窗
    detailMood: null,
    detailDate: null,
    canDeleteMood: false,
    
    // 用户信息
    currentUser: null,
    userPermission: null,
    
    // 加载状态
    loading: false,

    /** 空状态：'' | 'no_family' | 'no_babies' */
    moodEmptyState: ''
  },

  onLoad() {
    this.initRecordManager()
  },

  onShow() {
    this.loadData()
    this.getTabBar().setData({
      selected: 1
    })
  },

  /** 首次选关注：仅一名宝宝时默认选中，避免「确定」灰显且无提示 */
  buildInitialFavoriteSelection(allBabiesList) {
    const list = allBabiesList || []
    if (list.length !== 1) {
      return { ids: [], set: {} }
    }
    const id = list[0]._id
    return { ids: [id], set: { [id]: true } }
  },

  // 微信同声传译插件：语音识别管理器（需在 app.json 声明 WechatSI，并在公众平台添加插件）
  initRecordManager() {
    this._recordRecoManager = null
    try {
      const plugin = requirePlugin('WechatSI')
      const manager = plugin.getRecordRecognitionManager()
      if (!manager || typeof manager.start !== 'function') {
        throw new Error('getRecordRecognitionManager 不可用')
      }
      this._recordRecoManager = manager
      const page = this
      // 与官方文档一致：用属性赋值注册回调（勿把 manager 放进 setData，会序列化失效）
      manager.onStart = function () {
        page.setData({ isRecording: true, recordingTime: 0 })
        page.startRecordingTimer()
      }
      manager.onStop = function (res) {
        page.setData({ isRecording: false })
        page.stopRecordingTimer()
        const raw = res && (res.result != null ? res.result : res.text)
        const text = raw != null ? String(raw).trim() : ''
        if (text) {
          const base = (page.data.moodNote || '').trim()
          const merged = (base ? base + ' ' : '') + text
          page.setData({ moodNote: merged.slice(0, 200) }, () => page.updateCanSubmit())
        } else {
          wx.showToast({ title: '未识别到语音，可手动输入', icon: 'none' })
        }
      }
      manager.onError = function (res) {
        console.error('同声传译识别错误', res)
        page.setData({ isRecording: false })
        page.stopRecordingTimer()
        const msg = (res && (res.msg || res.errMsg)) ? (res.msg || res.errMsg) : '识别失败'
        wx.showToast({ title: msg, icon: 'none' })
      }
      this.setData({ voicePluginReady: true })
    } catch (e) {
      console.warn('微信同声传译插件未就绪', e)
      this._recordRecoManager = null
      this.setData({ voicePluginReady: false })
    }
  },

  // 开始录音计时
  startRecordingTimer() {
    this.recordingTimer = setInterval(() => {
      const { recordingTime } = this.data
      if (recordingTime >= 60) {
        this.stopRecording()
      } else {
        this.setData({ recordingTime: recordingTime + 1 })
      }
    }, 1000)
  },

  // 停止录音计时
  stopRecordingTimer() {
    if (this.recordingTimer) {
      clearInterval(this.recordingTimer)
      this.recordingTimer = null
    }
  },

  // 加载数据
  async loadData() {
    this.setData({ loading: true })
    
    try {
      // 获取当前用户信息
      const app = getApp()
      const currentUser = app.globalData.userInfo
      this.setData({ currentUser })

      const [families, allBabies] = await Promise.all([
        api.getFamilies(),
        api.getBabies()
      ])

      if (families.length === 0) {
        this.setData({
          babies: [],
          allBabies: [],
          moodEmptyState: 'no_family',
          currentBabyId: null,
          currentBaby: null,
          calendarDays: [],
          moods: [],
          showBabySelector: false
        })
        return
      }

      if (allBabies.length === 0) {
        this.setData({
          babies: [],
          allBabies: [],
          moodEmptyState: 'no_babies',
          currentBabyId: null,
          currentBaby: null,
          calendarDays: [],
          moods: [],
          showBabySelector: false
        })
        return
      }

      this.setData({ moodEmptyState: '' })

      // 获取用户关注的宝宝
      const favorites = await api.getUserFavorites()

      const allBabiesMapped = allBabies.map(b => ({
        ...b,
        babyId: b._id
      }))

      // 如果有关注的宝宝，使用关注列表（头像、姓名来自 babies 集合）
      if (favorites.length > 0) {
        const babyIds = favorites.map(f => f.babyId)
        const babies = allBabies.filter(b => babyIds.includes(b._id)).map(b => ({
          babyId: b._id,
          babyName: b.name,
          avatarUrl: b.avatarUrl || '',
          familyId: b.familyId
        }))

        if (babies.length === 0) {
          const initial = this.buildInitialFavoriteSelection(allBabiesMapped)
          this.setData({
            babies: [],
            allBabies: allBabiesMapped,
            showBabySelector: true,
            currentBabyId: null,
            currentBaby: null,
            calendarDays: [],
            moods: [],
            selectedBabyIds: initial.ids,
            selectedBabySet: initial.set
          })
          return
        }

        this.setData({
          babies,
          allBabies: allBabiesMapped
        })

        let nextId = this.data.currentBabyId
        const stillValid = nextId && babies.some(b => b.babyId === nextId)
        if (!stillValid && babies.length > 0) {
          nextId = babies[0].babyId
        }
        if (nextId && babies.length > 0) {
          const pick = babies.find(b => b.babyId === nextId) || babies[0]
          this.setData({
            currentBabyId: pick.babyId,
            currentBaby: pick
          })
          await this.loadBabyData(pick.babyId)
        }
      } else {
        // 首次进入未选关注：弹出选择器（有家庭、有宝宝）
        const initial = this.buildInitialFavoriteSelection(allBabiesMapped)
        this.setData({
          allBabies: allBabiesMapped,
          showBabySelector: true,
          babies: [],
          selectedBabyIds: initial.ids,
          selectedBabySet: initial.set
        })
      }
    } catch (error) {
      console.error('加载数据失败', error)
      wx.showToast({ title: '加载失败', icon: 'none' })
      this.setData({ moodEmptyState: '' })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 加载宝宝相关数据
  async loadBabyData(babyId) {
    try {
      // 获取宝宝信息
      const baby = await api.getBabyById(babyId)
      
      // 获取家庭信息以确定用户权限
      const families = await api.getFamilies()
      const family = families.find(f => f._id === baby.familyId)
      const uid = this.data.currentUser && this.data.currentUser.openid
      const member = family?.members.find(m => m.openid === uid)

      const currentBaby = {
        babyId: baby._id,
        babyName: baby.name,
        avatarUrl: baby.avatarUrl || '',
        familyId: baby.familyId
      }
      const babies = (this.data.babies || []).map(b =>
        b.babyId === babyId ? Object.assign({}, b, { babyName: baby.name, avatarUrl: baby.avatarUrl || '' }) : b
      )

      this.setData({
        currentBaby,
        babies,
        userPermission: member?.permission || 'viewer'
      })
      
      // 加载日历数据
      await this.loadCalendarData()
      
      // 加载活动日志
      await this.loadActivityLogs()
    } catch (error) {
      console.error('加载宝宝数据失败', error)
    }
  },

  // 加载日历数据
  async loadCalendarData() {
    const { currentBabyId, currentYear, currentMonth } = this.data
    if (!currentBabyId) return
    
    try {
      // 获取该月的心情记录
      const moods = await api.getMoodsByMonth(currentBabyId, currentYear, currentMonth)
      
      // 构建日历天数
      const days = this.buildCalendarDays(currentYear, currentMonth, moods)
      
      const t = new Date()
      const todayKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
      const todayHasMood = (moods || []).some(m => m.date === todayKey)

      this.setData({ 
        moods,
        calendarDays: days,
        todayHasMood
      })
    } catch (error) {
      console.error('加载日历数据失败', error)
    }
  },

  // 构建日历天数（周日起始，与表头「日一二…」一致；上月/下年补格须正确滚动年份）
  buildCalendarDays(year, month, moods) {
    const pad2 = (n) => String(n).padStart(2, '0')
    const days = []
    const firstDay = new Date(year, month - 1, 1)
    const daysInMonth = new Date(year, month, 0).getDate()
    const startWeekday = firstDay.getDay()

    const prevMonthLastDay = new Date(year, month - 1, 0).getDate()
    let prevYear = year
    let prevMon = month - 1
    if (prevMon < 1) {
      prevMon = 12
      prevYear = year - 1
    }

    for (let i = startWeekday - 1; i >= 0; i--) {
      const day = prevMonthLastDay - i
      const date = `${prevYear}-${pad2(prevMon)}-${pad2(day)}`
      days.push({
        day,
        date,
        isCurrentMonth: false,
        isToday: false,
        mood: null
      })
    }

    const today = new Date()
    const moodMap = {}
    ;(moods || []).forEach(m => {
      if (m && m.date) {
        moodMap[m.date] = m
      }
    })

    for (let i = 1; i <= daysInMonth; i++) {
      const date = `${year}-${pad2(month)}-${pad2(i)}`
      const isToday =
        today.getFullYear() === year &&
        today.getMonth() + 1 === month &&
        today.getDate() === i

      days.push({
        day: i,
        date,
        isCurrentMonth: true,
        isToday,
        mood: moodMap[date] || null
      })
    }

    let nextYear = year
    let nextMon = month + 1
    if (nextMon > 12) {
      nextMon = 1
      nextYear = year + 1
    }

    const remainingCells = 42 - days.length
    for (let i = 1; i <= remainingCells; i++) {
      const date = `${nextYear}-${pad2(nextMon)}-${pad2(i)}`
      days.push({
        day: i,
        date,
        isCurrentMonth: false,
        isToday: false,
        mood: null
      })
    }

    return days
  },

  // 加载活动日志
  async loadActivityLogs() {
    const { currentBaby } = this.data
    if (!currentBaby) return
    
    try {
      // 获取宝宝相关的活动日志
      const logs = await api.getActivityLogsByBaby(currentBaby.babyId, 1, 20)
      
      // 格式化时间
      const formattedLogs = logs.map(log => ({
        ...log,
        timeStr: this.formatTime(log.createTime)
      }))
      
      // 取前3条用于滚动展示
      this.setData({
        activityLogs: formattedLogs.slice(0, 3),
        allActivityLogs: formattedLogs,
        hasMoreLogs: logs.length >= 20
      })
    } catch (error) {
      console.error('加载活动日志失败', error)
    }
  },

  // 格式化时间
  formatTime(date) {
    const d = new Date(date)
    const now = new Date()
    const diff = now - d
    
    // 小于1小时
    if (diff < 3600000) {
      const minutes = Math.floor(diff / 60000)
      return minutes < 1 ? '刚刚' : `${minutes}分钟前`
    }
    
    // 小于24小时
    if (diff < 86400000) {
      return `${Math.floor(diff / 3600000)}小时前`
    }
    
    // 小于7天
    if (diff < 604800000) {
      return `${Math.floor(diff / 86400000)}天前`
    }
    
    // 显示日期
    return `${d.getMonth() + 1}月${d.getDate()}日`
  },

  // 切换宝宝
  async switchBaby(e) {
    const babyId = e.currentTarget.dataset.babyid
    const baby = this.data.babies.find(b => b.babyId === babyId)
    
    this.setData({ 
      currentBabyId: babyId,
      currentBaby: baby
    })
    
    await this.loadBabyData(babyId)
  },

  // 上一个月
  prevMonth() {
    const { currentYear, currentMonth } = this.data
    if (currentMonth === 1) {
      this.setData({ 
        currentYear: currentYear - 1,
        currentMonth: 12 
      }, () => this.loadCalendarData())
    } else {
      this.setData({ currentMonth: currentMonth - 1 }, () => this.loadCalendarData())
    }
  },

  // 下一个月
  nextMonth() {
    const { currentYear, currentMonth } = this.data
    if (currentMonth === 12) {
      this.setData({ 
        currentYear: currentYear + 1,
        currentMonth: 1 
      }, () => this.loadCalendarData())
    } else {
      this.setData({ currentMonth: currentMonth + 1 }, () => this.loadCalendarData())
    }
  },

  formatDetailMood(mood) {
    if (!mood) return null
    const ratingOption = RATING_OPTIONS.find(r => r.value === mood.rating)
    let noteEntriesList = Array.isArray(mood.noteEntries) ? mood.noteEntries.slice() : []
    if (noteEntriesList.length === 0 && mood.note) {
      noteEntriesList = [{ 
        _id: 'legacy', 
        text: mood.note, 
        isLegacy: true,
        creatorName: mood.creatorName || '用户',
        createTime: mood.createTime
      }]
    }
    // 格式化每条备注的时间
    noteEntriesList = noteEntriesList.map(entry => ({
      ...entry,
      createTimeStr: entry.createTime ? this.formatNoteTime(entry.createTime) : ''
    }))
    return {
      ...mood,
      ratingText: ratingOption ? ratingOption.label : mood.rating,
      emoji: ratingOption ? ratingOption.emoji : mood.emoji,
      noteEntriesList
    }
  },

  // 格式化备注时间
  formatNoteTime(date) {
    const d = new Date(date)
    const month = d.getMonth() + 1
    const day = d.getDate()
    const hour = d.getHours().toString().padStart(2, '0')
    const minute = d.getMinutes().toString().padStart(2, '0')
    return `${month}/${day} ${hour}:${minute}`
  },

  // 点击日期
  onDayTap(e) {
    const date = e.currentTarget.dataset.date
    const cell = (this.data.calendarDays || []).find(d => d.date === date)
    const mood = cell && cell.mood ? cell.mood : null

    if (mood) {
      this.setData({
        showDetailModal: true,
        detailMood: this.formatDetailMood(mood),
        detailDate: date,
        canDeleteMood: this.data.userPermission === 'guardian'
      })
    } else {
      this.openRatingModalForDate(date)
    }
  },

  // 打开评价弹窗
  openRatingModal() {
    const today = new Date()
    const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`
    this.openRatingModalForDate(date)
  },

  // 为指定日期打开评价弹窗
  async openRatingModalForDate(date) {
    const { currentBabyId } = this.data
    
    // 检查是否为未来日期
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const selectedDate = new Date(date)
    selectedDate.setHours(0, 0, 0, 0)
    
    if (selectedDate > today) {
      wx.showToast({
        title: '不能评价未来日期',
        icon: 'none'
      })
      return
    }
    
    try {
      // 检查当天是否已有评价
      const existingMood = await api.getMoodByDate(currentBabyId, date)
      
      this.setData({
        showRatingModal: true,
        ratingDate: date,
        existingMood: existingMood,
        selectedRating: null,
        selectedEmoji: null,
        moodNote: '',  // 新评价时备注为空，由用户自行填写
        canSubmit: false
      })
    } catch (error) {
      console.error('检查心情记录失败', error)
    }
  },

  // 更新提交按钮状态
  updateCanSubmit() {
    const { selectedRating, moodNote, existingMood } = this.data
    const noteTrim = (moodNote || '').trim()
    const prevNote = existingMood ? (existingMood.note || '').trim() : ''
    const hasNewNote = noteTrim && noteTrim !== prevNote
    
    let canSubmit = false
    if (!existingMood) {
      // 首次评价：必须选择评分
      canSubmit = !!selectedRating
    } else {
      // 重新评价：有新评分或新备注即可
      canSubmit = !!selectedRating || hasNewNote
    }
    
    this.setData({ canSubmit })
  },

  // 关闭评价弹窗
  closeRatingModal() {
    this.setData({
      showRatingModal: false,
      selectedRating: null,
      selectedEmoji: null,
      moodNote: '',
      existingMood: null,
      canSubmit: false
    })
  },

  // 选择评价
  selectRating(e) {
    const { value, emoji } = e.currentTarget.dataset
    this.setData({
      selectedRating: value,
      selectedEmoji: emoji
    }, () => this.updateCanSubmit())
  },

  // 输入备注
  onNoteInput(e) {
    this.setData({ moodNote: e.detail.value }, () => this.updateCanSubmit())
  },

  // 切换录音
  toggleRecording() {
    const { isRecording } = this.data
    const manager = this._recordRecoManager

    if (!manager) {
      wx.showToast({ title: '语音插件未就绪，请检查 app.json 与公众平台插件配置', icon: 'none' })
      return
    }

    if (isRecording) {
      this.stopRecording()
    } else {
      this.startRecording()
    }
  },

  // 开始录音
  startRecording() {
    const manager = this._recordRecoManager
    if (!manager || typeof manager.start !== 'function') {
      wx.showToast({ title: '录音不可用', icon: 'none' })
      return
    }

    wx.authorize({
      scope: 'scope.record',
      success: () => {
        const m = this._recordRecoManager
        if (!m || typeof m.start !== 'function') {
          wx.showToast({ title: '录音不可用', icon: 'none' })
          return
        }
        try {
          m.start({
            duration: 60000,
            lang: 'zh_CN'
          })
        } catch (err) {
          console.error('start 录音识别失败', err)
          wx.showToast({ title: '无法开始录音', icon: 'none' })
        }
      },
      fail: () => {
        wx.showModal({
          title: '需要录音权限',
          content: '请在设置中开启录音权限',
          success: (res) => {
            if (res.confirm) {
              wx.openSetting()
            }
          }
        })
      }
    })
  },

  // 停止录音
  stopRecording() {
    const manager = this._recordRecoManager
    if (!manager || typeof manager.stop !== 'function') {
      this.setData({ isRecording: false })
      this.stopRecordingTimer()
      return
    }
    try {
      manager.stop()
    } catch (err) {
      console.error('stop 录音识别失败', err)
      this.setData({ isRecording: false })
      this.stopRecordingTimer()
      wx.showToast({ title: '结束录音失败，请稍后再试', icon: 'none' })
    }
  },

  // 提交评价
  async submitRating() {
    const { 
      currentBabyId, 
      ratingDate, 
      selectedRating, 
      selectedEmoji, 
      moodNote,
      existingMood
    } = this.data
    
    const noteTrim = (moodNote || '').trim()
    const prevNote = existingMood ? (existingMood.note || '').trim() : ''
    const hasNewNote = noteTrim && noteTrim !== prevNote
    
    // 首次评价必须选择评分
    if (!existingMood && !selectedRating) {
      wx.showToast({ title: '请选择评价', icon: 'none' })
      return
    }
    
    // 重新评价时，必须有新评分或新备注
    if (existingMood && !selectedRating && !hasNewNote) {
      wx.showToast({ title: '请选择评分或填写备注', icon: 'none' })
      return
    }
    
    try {
      wx.showLoading({ title: '提交中...' })
      
      const moodData = {
        babyId: currentBabyId,
        date: ratingDate,
        note: moodNote
      }
      
      // 只有选择了评分才传递评分参数
      if (selectedRating && selectedEmoji) {
        moodData.rating = selectedRating
        moodData.emoji = selectedEmoji
      }
      
      await api.addMood(moodData)
      
      wx.hideLoading()
      wx.showToast({ title: existingMood ? '更新成功' : '评价成功', icon: 'success' })
      
      this.closeRatingModal()
      
      // 刷新日历数据
      await this.loadCalendarData()
      // 刷新活动日志
      await this.loadActivityLogs()
    } catch (error) {
      wx.hideLoading()
      console.error('提交评价失败', error)
      wx.showToast({ title: error.message || '提交失败', icon: 'none' })
    }
  },

  // 关闭详情弹窗
  closeDetailModal() {
    this.setData({
      showDetailModal: false,
      detailMood: null,
      detailDate: null
    })
  },

  // 删除心情记录
  async deleteMoodRecord() {
    const { detailMood } = this.data
    
    if (!detailMood) return
    
    try {
      const res = await wx.showModal({
        title: '确认删除',
        content: '确定要删除这条心情记录吗？',
        confirmColor: '#F44336'
      })
      
      if (res.confirm) {
        wx.showLoading({ title: '删除中...' })
        
        await api.deleteMood(detailMood._id)
        
        wx.hideLoading()
        wx.showToast({ title: '删除成功', icon: 'success' })
        
        this.closeDetailModal()
        
        // 刷新日历数据
        await this.loadCalendarData()
        // 刷新活动日志
        await this.loadActivityLogs()
      }
    } catch (error) {
      wx.hideLoading()
      console.error('删除心情记录失败', error)
      wx.showToast({ title: error.message || '删除失败', icon: 'none' })
    }
  },

  // 宝宝选择器 - 多选切换
  selectBaby(e) {
    const babyId = e.currentTarget.dataset.babyid
    const ids = (this.data.selectedBabyIds || []).slice()
    const i = ids.indexOf(babyId)
    if (i >= 0) {
      ids.splice(i, 1)
    } else {
      ids.push(babyId)
    }
    const selectedBabySet = {}
    ids.forEach(function (id) { selectedBabySet[id] = true })
    this.setData({ selectedBabyIds: ids, selectedBabyId: ids.length === 1 ? ids[0] : null, selectedBabySet })
  },

  onConfirmBabySelectionTap() {
    const { selectedBabyIds } = this.data
    if (!selectedBabyIds || selectedBabyIds.length === 0) {
      wx.showToast({ title: '请选择至少一位宝宝', icon: 'none' })
      return
    }
    this.confirmBabySelection()
  },

  // 宝宝选择器 - 确认选择
  async confirmBabySelection() {
    const { selectedBabyIds } = this.data
    
    if (!selectedBabyIds || selectedBabyIds.length === 0) {
      wx.showToast({ title: '请选择至少一位宝宝', icon: 'none' })
      return
    }
    
    try {
      wx.showLoading({ title: '保存中...' })
      
      await api.setUserFavorites(selectedBabyIds)
      
      wx.hideLoading()
      
      this.setData({ 
        showBabySelector: false,
        selectedBabyId: null,
        selectedBabyIds: [],
        selectedBabySet: {}
      })
      
      // 重新加载数据
      await this.loadData()
    } catch (error) {
      wx.hideLoading()
      console.error('保存关注失败', error)
      wx.showToast({ title: error.message || '保存失败', icon: 'none' })
    }
  },

  // 再次打开「关注宝宝」抽屉（可增删关注，与首次选择共用）
  openManageFavorites() {
    const ids = (this.data.babies || []).map(b => b.babyId)
    const selectedBabySet = {}
    ids.forEach(function (id) { selectedBabySet[id] = true })
    this.setData({
      showBabySelector: true,
      selectedBabyIds: ids,
      selectedBabySet,
      selectedBabyId: ids.length === 1 ? ids[0] : null
    })
  },

  // 关闭宝宝选择器
  closeBabySelector() {
    // 如果已经有宝宝，允许关闭
    if (this.data.babies.length > 0) {
      this.setData({ 
        showBabySelector: false,
        selectedBabyId: null,
        selectedBabyIds: [],
        selectedBabySet: {}
      })
    } else {
      wx.showToast({ title: '请先选择宝宝', icon: 'none' })
    }
  },

  async deleteNoteEntry(e) {
    const moodId = e.currentTarget.dataset.moodid
    const entryId = e.currentTarget.dataset.entryid
    if (!moodId || !entryId || entryId === 'legacy') return
    try {
      const res = await wx.showModal({
        title: '删除备注',
        content: '确定删除该条备注？',
        confirmColor: '#F44336'
      })
      if (!res.confirm) return
      wx.showLoading({ title: '删除中...' })
      await api.deleteMoodNote(moodId, entryId)
      wx.hideLoading()
      wx.showToast({ title: '已删除', icon: 'success' })
      const fresh = await api.getMoodByDate(this.data.currentBabyId, this.data.detailDate)
      this.setData({
        detailMood: fresh ? this.formatDetailMood(fresh) : null
      })
      await this.loadCalendarData()
      await this.loadActivityLogs()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' })
    }
  },

  // 显示活动日志详情
  showActivityDetail() {
    this.setData({ showActivityModal: true })
  },

  // 关闭活动日志详情
  closeActivityModal() {
    this.setData({ showActivityModal: false })
  },

  // 加载更多日志
  async loadMoreLogs() {
    const { allActivityLogs, currentBaby } = this.data
    const page = Math.floor(allActivityLogs.length / 20) + 1
    
    try {
      const logs = await api.getActivityLogsByBaby(currentBaby.babyId, page, 20)
      
      if (logs.length === 0) {
        this.setData({ hasMoreLogs: false })
        return
      }
      
      const formattedLogs = logs.map(log => ({
        ...log,
        timeStr: this.formatTime(log.createTime)
      }))
      
      this.setData({
        allActivityLogs: [...allActivityLogs, ...formattedLogs],
        hasMoreLogs: logs.length >= 20
      })
    } catch (error) {
      console.error('加载更多日志失败', error)
    }
  },

  // 阻止事件冒泡
  preventBubble() {
    // 什么都不做，只是阻止冒泡
  }
})
