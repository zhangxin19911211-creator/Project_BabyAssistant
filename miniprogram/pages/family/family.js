// pages/family/family.js
const api = require('../../utils/api.js')
const db = wx.cloud.database()
const _ = db.command

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
    feedbackImages: []
  },

  onShow() {
    this.loadFamilyInfo()
  },

  async loadFamilyInfo() {
    try {
      // 清除家庭列表缓存，确保获取最新数据
      api.clearCache('cache_families')
      const families = await api.getFamilies()
      // 从 users 集合获取最新的用户信息（包括头像和用户名）
      const db = wx.cloud.database()
      const userResult = await db.collection('users').where({
        openid: getApp().globalData.userInfo.openid
      }).get()
      
      let currentUser = getApp().globalData.userInfo
      
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
        const firstFamily = families[0]
        const userInFamily = firstFamily.members.find(member => member.openid === currentUser.openid)
        if (userInFamily) {
          currentUser = {
            ...currentUser,
            permission: userInFamily.permission
          }
        }

        // 遍历所有家庭，获取用户在各家庭中的身份，并为每个家庭添加当前用户的权限
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

          const member = family.members.find(m => m.openid === currentUser.openid)
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
    
    const confirmContent = isCreator 
      ? '您是家庭创建者，退出家庭将清除所有宝宝数据，确定要退出吗？' 
      : '确定要退出该家庭吗？'
    
    wx.showModal({
      title: '确认退出',
      content: confirmContent,
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
  },

  openInviteModal(e) {
    const familyId = e.currentTarget.dataset.familyId
    this.setData({
      showInviteModal: true,
      selectedFamily: familyId
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
      selectedFamily: null
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
      imageUrl: '../../images/Family.png'
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
      // 上传图片到云存储
      const uploadedImages = []
      for (const image of feedbackImages) {
        const cloudPath = 'feedback/' + Date.now() + '_' + Math.floor(Math.random() * 10000) + '.jpg'
        const uploadResult = await wx.cloud.uploadFile({
          cloudPath: cloudPath,
          filePath: image
        })
        uploadedImages.push(uploadResult.fileID)
      }

      // 构造反馈数据
      const feedbackData = {
        content: feedbackContent.trim(),
        images: uploadedImages,
        openid: getApp().globalData.userInfo.openid,
        createTime: new Date()
      }

      // 保存到数据库
      const db = wx.cloud.database()
      const result = await db.collection('feedback').add({
        data: feedbackData
      })

      // 调用云函数发送邮件
      try {
        await wx.cloud.callFunction({
          name: 'sendFeedbackEmail',
          data: {
            data: {
              ...feedbackData,
              _id: result._id
            }
          }
        })
        console.log('邮件发送请求已提交')
      } catch (emailError) {
        console.error('发送邮件失败', emailError)
        // 邮件发送失败不影响反馈提交
      }

      wx.hideLoading()
      wx.showToast({
        title: '反馈提交成功',
        icon: 'success',
        success: () => {
          this.closeFeedbackModal()
        }
      })
    } catch (error) {
      wx.hideLoading()
      console.error('提交反馈失败', error)
      wx.showToast({
        title: '提交失败，请重试',
        icon: 'none'
      })
    }
  }
})
