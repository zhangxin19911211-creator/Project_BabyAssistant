// pages/family/family.js
const api = require('../../utils/api.js')

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
    familyName: '',
    inviteCode: '',
    currentInviteCode: '',
    selectedMember: null,
    selectedFamily: null,
    editFamilyId: null,
    editFamilyName: '',
    editNickname: '',
    editNicknameMember: null
  },

  onShow() {
    this.loadFamilyInfo()
  },

  async loadFamilyInfo() {
    try {
      const families = await api.getFamilies()
      const currentUser = getApp().globalData.userInfo

      this.setData({
        families,
        currentUser
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

  // 点击成员头像
  onMemberAvatarTap(e) {
    const member = e.currentTarget.dataset.member
    const familyId = e.currentTarget.dataset.familyId
    const currentUser = this.data.currentUser

    // 只能修改自己的头像
    if (member.openid !== currentUser.openid) {
      wx.showToast({
        title: '只能修改自己的头像',
        icon: 'none'
      })
      return
    }

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
          const cloudPath = 'avatars/' + Date.now() + '.jpg'
          const uploadResult = await wx.cloud.uploadFile({
            cloudPath: cloudPath,
            filePath: tempFilePath
          })

          const fileID = uploadResult.fileID

          // 更新成员头像
          await api.updateMemberInfo(familyId, null, fileID)

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

  // 点击成员名称
  onMemberNameTap(e) {
    const member = e.currentTarget.dataset.member
    const familyId = e.currentTarget.dataset.familyId
    const currentUser = this.data.currentUser

    // 只能修改自己的用户名
    if (member.openid !== currentUser.openid) {
      wx.showToast({
        title: '只能修改自己的用户名',
        icon: 'none'
      })
      return
    }

    this.setData({
      showEditNicknameModal: true,
      editNicknameMember: member,
      editNickname: member.nickName,
      selectedFamily: familyId
    })
  },

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
    const { editNickname, editNicknameMember, selectedFamily } = this.data

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
      await api.updateMemberInfo(selectedFamily, editNickname.trim(), null)

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
  }
})
