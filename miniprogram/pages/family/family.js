// pages/family/family.js
const api = require('../../utils/api.js')
const safeLog = require('../../utils/safeLog.js')
const { getColorIndexById } = require('../../utils/util.js')
const db = wx.cloud.database()
const _ = db.command

/** 与成员列表展示一致：非 guardian/caretaker 均按围观处理，避免 permission 缺失时邀请页为空 */
function normalizeMemberPermission(p) {
  const v = String(p == null ? '' : p).trim().toLowerCase()
  if (v === 'guardian') return 'guardian'
  if (v === 'caretaker') return 'caretaker'
  if (v === 'viewer') return 'viewer'
  return 'viewer'
}

const INVITE_ROLE_META = {
  guardian: {
    type: 'guardian',
    title: '一级助教',
    desc: '最高权限，可管理宝宝和成员',
    cardClass: 'guardian-card'
  },
  caretaker: {
    type: 'caretaker',
    title: '二级助教',
    desc: '可添加宝宝成长记录',
    cardClass: 'caretaker-card'
  },
  viewer: {
    type: 'viewer',
    title: '围观吃瓜',
    desc: '仅可查看宝宝成长数据',
    cardClass: 'viewer-card'
  }
}

Page({
  data: {
    families: [],
    currentUser: null,
    showInviteModal: false,
    showPermissionModal: false,
    showJoinModal: false,
    showInviteCodeModal: false,
    showCreateModal: false,
    showEditNameModal: false,
    showEditNicknameModal: false,
    showFeedbackModal: false,
    showCreatorLeaveModal: false,
    showDissolveConfirmModal: false,
    familyName: '',
    inviteCode: '',
    currentInviteCode: '',
    selectedMember: null,
    selectedFamily: null,
    editFamilyId: null,
    editFamilyName: '',
    editNickname: '',
    editNicknameMember: null,
    feedbackContent: '',
    feedbackImages: [],
    leavingFamilyId: null,
    hasOtherGuardians: false,
    inviteableRoles: [],
    /** 邀请弹窗用 wx:for 渲染，避免单角色时 button+wx:if 在真机不显示 */
    inviteRoleOptions: []
  },

  onShow() {
    this.loadFamilyInfo()
    this.getTabBar().setData({
      selected: 2
    })
  },

  async loadFamilyInfo() {
    try {
      api.invalidateMoodCaches()
      const families = await api.getFamilies()
      
      // 检查全局用户信息是否存在
      const app = getApp()
      if (!app.globalData.userInfo) {
        // 用户信息未加载，等待登录完成
        safeLog.log('用户信息未加载，跳过加载家庭信息')
        return
      }
      
      // 从 users 集合获取最新的用户信息（包括头像和用户名）
      const db = wx.cloud.database()
      const userResult = await db.collection('users').where({
        openid: app.globalData.userInfo.openid
      }).get()
      
      let currentUser = app.globalData.userInfo
      
      // 如果数据库中有用户信息，使用数据库中的数据
      if (userResult.data.length > 0) {
        const dbUser = userResult.data[0]
        currentUser = {
          ...currentUser,
          nickName: dbUser.nickName || currentUser.nickName,
          avatarUrl: dbUser.avatarUrl || currentUser.avatarUrl,
          userName: dbUser.userName || currentUser.userName
        }
        // 更新全局数据
        getApp().globalData.userInfo = currentUser
      }

      // 收集所有家庭成员的openid，用于批量获取用户信息
      const allMemberOpenids = new Set()
      families.forEach(family => {
        family.members.forEach(member => {
          allMemberOpenids.add(member.openid)
        })
      })

      // 从users集合批量获取所有成员的最新信息
      const membersUserInfo = {}
      if (allMemberOpenids.size > 0) {
        const membersResult = await db.collection('users').where({
          openid: _.in(Array.from(allMemberOpenids))
        }).get()
        
        membersResult.data.forEach(user => {
          membersUserInfo[user.openid] = {
            nickName: user.nickName,
            avatarUrl: user.avatarUrl
          }
        })
      }

      // 构建用户在各家庭中的身份列表，并更新家庭成员信息
      const userFamilyRoles = []
      if (families.length > 0) {
        // 保存当前用户的openid，确保后续使用
        const currentUserOpenid = currentUser.openid
        
        const firstFamily = families[0]
        const userInFamily = firstFamily.members.find(member => member.openid === currentUserOpenid)
        if (userInFamily) {
          currentUser = {
            ...currentUser,
            permission: userInFamily.permission
          }
        }

        // 遍历所有家庭，获取用户在各家庭中的身份，并为每个家庭添加当前用户的权限和颜色索引
        families.forEach(family => {
          // 更新家庭成员信息，从users集合获取最新数据
          family.members = family.members.map(member => {
            const userInfo = membersUserInfo[member.openid]
            return {
              ...member,
              nickName: userInfo?.nickName || member.nickName,
              avatarUrl: userInfo?.avatarUrl || member.avatarUrl
            }
          })

          const member = family.members.find(m => m.openid === currentUserOpenid)
          if (member) {
            const permissionText = member.permission === 'guardian' ? '一级助教' : 
                                  member.permission === 'caretaker' ? '二级助教' : '围观吃瓜'
            userFamilyRoles.push({
              familyId: family._id,
              familyName: family.name,
              permission: member.permission,
              permissionText: permissionText
            })
            // 为家庭对象添加当前用户的权限
            family.currentUserPermission = member.permission
          }
          
          // 基于家庭ID计算颜色索引（无需数据库存储）
          family.colorIndex = getColorIndexById(family._id)
        })
      }

      this.setData({
        families,
        currentUser,
        userFamilyRoles
      })
    } catch (error) {
      console.error('加载家庭信息失败', error)
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      })
    }
  },

  openCreateModal() {
    this.setData({
      showCreateModal: true,
      familyName: ''
    })
  },

  closeCreateModal() {
    this.setData({
      showCreateModal: false,
      familyName: ''
    })
  },

  onFamilyNameInput(e) {
    this.setData({
      familyName: e.detail.value
    })
  },

  async submitCreateForm() {
    const { familyName } = this.data
    
    if (!familyName.trim()) {
      return wx.showToast({ title: '请输入家庭名称', icon: 'none' })
    }
    
    if (familyName.trim().length > 7) {
      return wx.showToast({ title: '家庭名称最多7个字符', icon: 'none' })
    }
    
    try {
      await api.createFamily(familyName.trim())
      wx.showToast({
        title: '创建家庭成功',
        icon: 'success',
        success: () => {
          this.closeCreateModal()
          this.loadFamilyInfo()
        }
      })
    } catch (error) {
      console.error('创建家庭失败', error)
      wx.showToast({
        title: error.message || '创建失败，请重试',
        icon: 'none'
      })
    }
  },

  async leaveFamily(e) {
    const familyId = e.currentTarget.dataset.familyId
    const family = this.data.families.find(f => f._id === familyId)
    
    const isCreator = family.creatorOpenid === this.data.currentUser.openid
    
    if (isCreator) {
      // 掌门人退出：检查是否有其他一级助理
      const otherGuardians = family.members.filter(
        m => m.openid !== this.data.currentUser.openid && m.permission === 'guardian'
      )
      
      // 掌门人退出：显示自定义弹窗
      this.setData({
        showCreatorLeaveModal: true,
        leavingFamilyId: familyId,
        hasOtherGuardians: otherGuardians.length > 0
      })
    } else {
      // 非掌门人：普通退出确认
      wx.showModal({
        title: '确认退出',
        content: '确定要退出该家庭吗？',
        success: async (res) => {
          if (res.confirm) {
            try {
              await api.leaveFamily(familyId)
              wx.showToast({
                title: '退出成功',
                icon: 'success',
                success: () => {
                  this.loadFamilyInfo()
                }
              })
            } catch (error) {
              console.error('退出家庭失败', error)
              wx.showToast({
                title: error.message || '退出失败，请重试',
                icon: 'none'
              })
            }
          }
        }
      })
    }
  },

  closeCreatorLeaveModal() {
    this.setData({
      showCreatorLeaveModal: false,
      leavingFamilyId: null,
      hasOtherGuardians: false
    })
  },

  async confirmLeaveFamily() {
    // 点击"是"，退出家庭（转让掌门人）
    const familyId = this.data.leavingFamilyId
    try {
      await api.leaveFamily(familyId)
      this.setData({
        showCreatorLeaveModal: false,
        leavingFamilyId: null
      })
      wx.showToast({
        title: '退出成功',
        icon: 'success',
        success: () => {
          this.loadFamilyInfo()
        }
      })
    } catch (error) {
      console.error('退出家庭失败', error)
      wx.showToast({
        title: error.message || '退出失败，请重试',
        icon: 'none'
      })
    }
  },

  confirmDissolveFamily() {
    // 点击"解散家庭"，显示确认弹窗
    this.setData({
      showCreatorLeaveModal: false,
      showDissolveConfirmModal: true
    })
  },

  closeDissolveConfirmModal() {
    this.setData({
      showDissolveConfirmModal: false,
      leavingFamilyId: null
    })
  },

  async executeDissolveFamily() {
    // 确认解散家庭
    const familyId = this.data.leavingFamilyId
    try {
      await api.dissolveFamily(familyId)
      this.setData({
        showDissolveConfirmModal: false,
        leavingFamilyId: null
      })
      wx.showToast({
        title: '家庭已解散',
        icon: 'success',
        success: () => {
          this.loadFamilyInfo()
        }
      })
    } catch (error) {
      console.error('解散家庭失败', error)
      wx.showToast({
        title: error.message || '解散失败，请重试',
        icon: 'none'
      })
    }
  },

  openInviteModal(e) {
    const familyId = e.currentTarget.dataset.familyId
    const uid = (this.data.currentUser && this.data.currentUser.openid) || ''
    const family = this.data.families.find(f => String(f._id) === String(familyId))
    if (!family) {
      wx.showToast({ title: '未找到家庭信息', icon: 'none' })
      return
    }
    let userPermission = family.currentUserPermission
    if (uid && (userPermission == null || userPermission === '')) {
      const m = family.members.find(mem => mem.openid === uid)
      userPermission = m ? m.permission : ''
    }

    const perm = normalizeMemberPermission(userPermission)
    let inviteableRoles = []
    if (perm === 'guardian') {
      inviteableRoles = ['guardian', 'caretaker', 'viewer']
    } else if (perm === 'caretaker') {
      inviteableRoles = ['caretaker', 'viewer']
    } else {
      inviteableRoles = ['viewer']
    }

    const inviteRoleOptions = inviteableRoles.map((key) => INVITE_ROLE_META[key])

    this.setData({
      showInviteModal: true,
      selectedFamily: familyId,
      inviteableRoles,
      inviteRoleOptions
    })
  },

  openEditNameModal(e) {
    const familyId = e.currentTarget.dataset.familyId
    const family = this.data.families.find(f => f._id === familyId)
    this.setData({
      showEditNameModal: true,
      editFamilyId: familyId,
      editFamilyName: family.name
    })
  },

  closeEditNameModal() {
    this.setData({
      showEditNameModal: false,
      editFamilyId: null,
      editFamilyName: ''
    })
  },

  onEditFamilyNameInput(e) {
    this.setData({
      editFamilyName: e.detail.value
    })
  },

  async submitEditNameForm() {
    const { editFamilyId, editFamilyName } = this.data
    
    if (!editFamilyName.trim()) {
      return wx.showToast({ title: '请输入家庭名称', icon: 'none' })
    }
    
    if (editFamilyName.trim().length > 7) {
      return wx.showToast({ title: '家庭名称最多7个字符', icon: 'none' })
    }
    
    try {
      await api.updateFamilyName(editFamilyId, editFamilyName.trim())
      wx.showToast({
        title: '修改成功',
        icon: 'success',
        success: () => {
          this.closeEditNameModal()
          this.loadFamilyInfo()
        }
      })
    } catch (error) {
      console.error('修改家庭名称失败', error)
      wx.showToast({
        title: error.message || '修改失败，请重试',
        icon: 'none'
      })
    }
  },

  closeInviteModal() {
    this.setData({
      showInviteModal: false,
      selectedFamily: null,
      inviteRoleOptions: []
    })
  },

  async inviteMember(e) {
    const { memberType } = e.currentTarget.dataset
    const { selectedFamily } = this.data
    try {
      const inviteCode = await api.createInviteCode(selectedFamily, memberType)
      
      this.closeInviteModal()
      
      // 显示自定义弹窗
      this.setData({
        showInviteCodeModal: true,
        currentInviteCode: inviteCode
      })
    } catch (error) {
      console.error('创建邀请码失败', error)
      wx.showToast({
        title: error.message || '创建邀请码失败，请重试',
        icon: 'none'
      })
    }
  },

  closeInviteCodeModal() {
    this.setData({
      showInviteCodeModal: false,
      currentInviteCode: ''
    })
  },

  copyInviteCode() {
    const { currentInviteCode } = this.data
    wx.setClipboardData({
      data: currentInviteCode,
      success: () => {
        wx.showToast({
          title: '邀请码已复制',
          icon: 'success'
        })
      }
    })
  },

  // 页面分享配置
  onShareAppMessage(res) {
    const { currentInviteCode } = this.data
    
    // 如果是从按钮触发的分享
    if (res.from === 'button') {
      // 关闭邀请码弹窗
      this.closeInviteCodeModal()
    }
    
    return {
      title: '邀请您加入家庭',
      path: '/pages/family/family?inviteCode=' + currentInviteCode,
      imageUrl: '../../images/baby-empty.svg'
    }
  },

  // 空函数，用于阻止事件冒泡
  noop() {
    // 什么都不做
  },

  // 点击header头像
  onHeaderAvatarTap() {
    const currentUser = this.data.currentUser
    
    // 选择图片上传
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: async (res) => {
        const tempFilePath = res.tempFiles[0].tempFilePath

        wx.showLoading({ title: '上传中...' })

        try {
          // 上传图片到云存储
          const cloudPath = 'avatars/' + Date.now() + '_' + Math.floor(Math.random() * 10000) + '.jpg'
          const uploadResult = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: tempFilePath
          })

          const fileID = uploadResult.fileID

          // 调用 updateUserInfo 同步更新 users 集合和所有家庭中的成员信息
          await wx.cloud.callFunction({
            name: 'login',
            data: {
              action: 'updateUserInfo',
              avatarUrl: fileID
            }
          })

          // 更新全局用户信息
          getApp().globalData.userInfo.avatarUrl = fileID

          wx.hideLoading()
          wx.showToast({
            title: '头像更新成功',
            icon: 'success'
          })

          this.loadFamilyInfo()
        } catch (error) {
          wx.hideLoading()
          console.error('上传头像失败', error)
          wx.showToast({
            title: '上传头像失败',
            icon: 'none'
          })
        }
      },
      fail: (error) => {
        console.error('选择图片失败', error)
      }
    })
  },

  // 点击header用户名
  onHeaderNameTap() {
    const currentUser = this.data.currentUser
    
    this.setData({
      showEditNicknameModal: true,
      editNicknameMember: currentUser,
      editNickname: currentUser.nickName,
      selectedFamily: this.data.families[0]?._id
    })
  },

  // 点击成员头像


  // 关闭编辑昵称弹窗
  closeEditNicknameModal() {
    this.setData({
      showEditNicknameModal: false,
      editNicknameMember: null,
      editNickname: ''
    })
  },

  // 昵称输入
  onEditNicknameInput(e) {
    this.setData({
      editNickname: e.detail.value
    })
  },

  // 提交修改昵称
  async submitEditNicknameForm() {
    const { editNickname, editNicknameMember } = this.data

    if (!editNickname.trim()) {
      return wx.showToast({
        title: '请输入用户名',
        icon: 'none'
      })
    }

    if (editNickname.trim().length > 7) {
      return wx.showToast({
        title: '用户名最多7个字符',
        icon: 'none'
      })
    }

    try {
      // 调用 updateUserInfo 同步更新 users 集合和所有家庭中的成员信息
      await wx.cloud.callFunction({
        name: 'login',
        data: {
          action: 'updateUserInfo',
          nickName: editNickname.trim()
        }
      })

      // 更新全局用户信息
      getApp().globalData.userInfo.nickName = editNickname.trim()

      wx.showToast({
        title: '用户名修改成功',
        icon: 'success'
      })

      this.closeEditNicknameModal()
      this.loadFamilyInfo()
    } catch (error) {
      console.error('修改用户名失败', error)
      wx.showToast({
        title: error.message || '修改用户名失败',
        icon: 'none'
      })
    }
  },

  openPermissionModal(e) {
    const member = e.currentTarget.dataset.member
    const familyId = e.currentTarget.dataset.familyId
    this.setData({
      showPermissionModal: true,
      selectedMember: member,
      selectedFamily: familyId
    })
  },

  closePermissionModal() {
    this.setData({
      showPermissionModal: false,
      selectedMember: null,
      selectedFamily: null
    })
  },

  async updatePermission(e) {
    const { permission } = e.currentTarget.dataset
    const { selectedMember, selectedFamily } = this.data
    
    try {
      await api.updateMemberPermission(selectedFamily, selectedMember.openid, permission)
      
      wx.showToast({
        title: '权限更新成功',
        icon: 'success'
      })
      this.closePermissionModal()
      this.loadFamilyInfo()
    } catch (error) {
      console.error('更新权限失败', error)
      wx.showToast({
        title: error.message || '更新权限失败，请重试',
        icon: 'none'
      })
    }
  },

  async removeMember(e) {
    const member = e.currentTarget.dataset.member
    const familyId = e.currentTarget.dataset.familyId
    
    wx.showModal({
      title: '确认移除',
      content: `确定要移除 ${member.nickName} 吗？`,
      success: async (res) => {
        if (res.confirm) {
          try {
            await api.removeFamilyMember(familyId, member.openid)
            
            wx.showToast({
              title: '移除成功',
              icon: 'success'
            })
            this.loadFamilyInfo()
          } catch (error) {
            console.error('移除成员失败', error)
            wx.showToast({
              title: error.message || '移除失败，请重试',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  openJoinModal() {
    this.setData({
      showJoinModal: true,
      inviteCode: ''
    })
  },

  closeJoinModal() {
    this.setData({
      showJoinModal: false,
      inviteCode: ''
    })
  },

  onInviteCodeInput(e) {
    this.setData({
      inviteCode: e.detail.value
    })
  },

  async submitJoinForm() {
    const { inviteCode } = this.data
    
    if (!inviteCode.trim()) {
      return wx.showToast({ title: '请输入邀请码', icon: 'none' })
    }
    
    try {
      await api.joinFamily(inviteCode.trim())
      wx.showToast({
        title: '加入家庭成功',
        icon: 'success',
        success: () => {
          this.closeJoinModal()
          this.loadFamilyInfo()
        }
      })
    } catch (error) {
      console.error('加入家庭失败', error)
      wx.showToast({
        title: error.message || '加入失败，请重试',
        icon: 'none'
      })
    }
  },

  // 打开反馈弹窗
  openFeedbackModal() {
    this.setData({
      showFeedbackModal: true,
      feedbackContent: '',
      feedbackImages: []
    })
  },

  // 关闭反馈弹窗
  closeFeedbackModal() {
    this.setData({
      showFeedbackModal: false,
      feedbackContent: '',
      feedbackImages: []
    })
  },

  // 处理反馈内容输入
  onFeedbackContentInput(e) {
    this.setData({
      feedbackContent: e.detail.value
    })
  },

  // 选择反馈图片
  chooseFeedbackImage() {
    const { feedbackImages } = this.data
    
    if (feedbackImages.length >= 3) {
      return wx.showToast({ title: '最多上传3张图片', icon: 'none' })
    }

    wx.chooseMedia({
      count: 3 - feedbackImages.length,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      success: (res) => {
        const newImages = res.tempFiles.map(file => file.tempFilePath)
        this.setData({
          feedbackImages: [...feedbackImages, ...newImages]
        })
      },
      fail: (error) => {
        console.error('选择图片失败', error)
      }
    })
  },

  // 删除反馈图片
  deleteFeedbackImage(e) {
    const index = e.currentTarget.dataset.index
    const { feedbackImages } = this.data
    
    feedbackImages.splice(index, 1)
    this.setData({
      feedbackImages
    })
  },

  // 提交反馈
  async submitFeedback() {
    const { feedbackContent, feedbackImages } = this.data
    
    if (!feedbackContent.trim()) {
      return wx.showToast({ title: '请输入反馈内容', icon: 'none' })
    }

    wx.showLoading({ title: '提交中...' })

    try {
      const maxBytes = 2 * 1024 * 1024
      const uploadedImages = []
      const fs = wx.getFileSystemManager()
      for (const image of feedbackImages) {
        const fileInfo = await new Promise((resolve, reject) => {
          fs.getFileInfo({
            filePath: image,
            success: resolve,
            fail: reject
          })
        })
        if (fileInfo.size > maxBytes) {
          wx.hideLoading()
          wx.showToast({ title: '单张图片不超过2MB', icon: 'none' })
          return
        }
        const cloudPath =
          'feedback/' + Date.now() + '_' + Math.floor(Math.random() * 10000) + '.jpg'
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath,
          filePath: image
        })
        uploadedImages.push(uploadResult.fileID)
      }

      const submit = await api.submitFeedback(feedbackContent.trim(), uploadedImages)
      const emailOk = !!submit.emailOk
      const emailTip = submit.emailMessage || ''

      wx.hideLoading()
      if (emailOk) {
        wx.showToast({
          title: '反馈提交成功',
          icon: 'success',
          success: () => {
            this.closeFeedbackModal()
          }
        })
      } else {
        wx.showModal({
          title: '反馈已保存',
          content:
            '您的反馈已记录，但邮件通知未成功（' +
            (emailTip || '请检查云函数与环境变量配置') +
            '）。如需紧急联系请通过其他渠道告知开发者。',
          showCancel: false,
          confirmText: '知道了',
          success: () => {
            this.closeFeedbackModal()
          }
        })
      }
    } catch (error) {
      wx.hideLoading()
      console.error('提交反馈失败', error)
      wx.showToast({
        title: (error && error.message) || '提交失败，请重试',
        icon: 'none'
      })
    }
  }
})
