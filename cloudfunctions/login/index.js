// 云函数入口文件
const cloud = require('wx-server-sdk')
const crypto = require('crypto')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command
const VALID_MEMBER_TYPES = ['viewer', 'caretaker', 'guardian']

function isValidPermission(permission) {
  return VALID_MEMBER_TYPES.includes(permission)
}

/** 与小程序成员展示一致：非 guardian/caretaker 按围观处理，避免旧数据缺 permission 无法邀请 */
function normalizeMemberPermissionForInvite(p) {
  const v = String(p == null ? '' : p).trim().toLowerCase()
  if (v === 'guardian') return 'guardian'
  if (v === 'caretaker') return 'caretaker'
  if (v === 'viewer') return 'viewer'
  return 'viewer'
}

function calculateAgeInMonths(birthDate, recordDate) {
  const birth = new Date(birthDate)
  const current = new Date(recordDate)
  let years = current.getFullYear() - birth.getFullYear()
  let months = current.getMonth() - birth.getMonth()
  let days = current.getDate() - birth.getDate()

  if (days < 0) {
    months -= 1
    days += new Date(current.getFullYear(), current.getMonth(), 0).getDate()
  }
  if (months < 0) {
    years -= 1
    months += 12
  }

  const monthValue = years * 12 + months
  return monthValue + (days >= 15 ? 0.5 : 0)
}

function generateSecureInviteCode(length = 8) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code = ''
  while (code.length < length) {
    const bytes = crypto.randomBytes(length)
    for (let i = 0; i < bytes.length && code.length < length; i++) {
      code += chars[bytes[i] % chars.length]
    }
  }
  return code
}

// 生成随机7位字符用户名（字母+数字）
function generateRandomUserName() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < 7; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

// 生成随机昵称（中文，用于展示）
function generateRandomNickName() {
  const adjectives = ['快乐', '可爱', '聪明', '活泼', '乖巧', '甜蜜', '阳光', '温柔', '勇敢', '机灵']
  const nouns = ['小熊', '小兔', '小鹿', '小猫', '小鱼', '小鸟', '小象', '小狐', '小虎', '小龙']
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const noun = nouns[Math.floor(Math.random() * nouns.length)]
  const num = Math.floor(Math.random() * 100)
  return adj + noun + num
}

// 默认头像URL（使用系统内置头像）
const DEFAULT_AVATAR_URL = ''

/** 删除宝宝上传的云存储头像（cloud://），忽略 http(s) 与空值 */
async function deleteBabyCloudAvatarIfAny(avatarUrl) {
  const u =
    avatarUrl != null && typeof avatarUrl === 'string'
      ? avatarUrl.trim()
      : String(avatarUrl || '').trim()
  if (!u || !u.startsWith('cloud://')) {
    return
  }
  try {
    await cloud.deleteFile({ fileList: [u] })
  } catch (e) {
    console.warn(
      '[deleteBabyCloudAvatarIfAny]',
      u.length > 72 ? u.slice(0, 72) + '…' : u,
      (e && e.message) || e
    )
  }
}

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { code, action, babyId, familyId, memberInfo, inviteCodeId, nickName, avatarUrl, inviteCode, memberType } = event
  
  try {
    // 处理获取用户家庭列表的操作
    if (action === 'getFamilies') {
      const openid = wxContext.OPENID
      
      // 查询用户所在的所有家庭
      const result = await db.collection('families').where({
        'members.openid': openid
      }).get()
      
      // 排序：用户创建的家庭排在最前面，然后按创建时间排序
      const sortedFamilies = result.data.sort((a, b) => {
        // 首先比较是否是创建者
        const isCreatorA = a.creatorOpenid === openid
        const isCreatorB = b.creatorOpenid === openid
        if (isCreatorA && !isCreatorB) return -1
        if (!isCreatorA && isCreatorB) return 1
        // 如果都是或都不是创建者，按创建时间排序
        return new Date(b.createTime) - new Date(a.createTime)
      })
      
      return { success: true, families: sortedFamilies }
    }
    
    // 处理获取用户宝宝列表的操作
    if (action === 'getBabies') {
      const openid = wxContext.OPENID
      
      // 查询用户所在的所有家庭
      const familiesResult = await db.collection('families').where({
        'members.openid': openid
      }).get()
      
      if (familiesResult.data.length === 0) {
        return { success: true, babies: [] }
      }
      
      // 排序家庭：用户创建的家庭排在最前面，然后按创建时间排序
      const sortedFamilies = familiesResult.data.sort((a, b) => {
        const isCreatorA = a.creatorOpenid === openid
        const isCreatorB = b.creatorOpenid === openid
        if (isCreatorA && !isCreatorB) return -1
        if (!isCreatorA && isCreatorB) return 1
        return new Date(b.createTime) - new Date(a.createTime)
      })
      
      // 获取排序后的家庭ID
      const familyIds = sortedFamilies.map(f => f._id)
      
      // 查询所有属于这些家庭的宝宝
      const babiesResult = await db.collection('babies').where({
        familyId: _.in(familyIds)
      }).get()
      
      // 根据家庭顺序排序宝宝
      const sortedBabies = babiesResult.data.sort((a, b) => {
        const familyIndexA = familyIds.indexOf(a.familyId)
        const familyIndexB = familyIds.indexOf(b.familyId)
        if (familyIndexA !== familyIndexB) {
          return familyIndexA - familyIndexB
        }
        // 同一家庭的宝宝按创建时间排序
        return new Date(b.createTime) - new Date(a.createTime)
      })
      
      return { success: true, babies: sortedBabies || [] }
    }

    // 批量获取宝宝最新记录，减少客户端 N+1 请求
    if (action === 'getLatestRecordsByBabyIds' && Array.isArray(event.babyIds)) {
      const openid = wxContext.OPENID
      const babyIds = Array.from(new Set(event.babyIds.filter(Boolean))).slice(0, 100)
      if (babyIds.length === 0) {
        return { success: true, latestRecordMap: {} }
      }

      // 仅允许查询当前用户可访问家庭内的宝宝
      const familiesResult = await db.collection('families').where({
        'members.openid': openid
      }).get()
      const allowedFamilyIds = familiesResult.data.map(f => f._id)
      if (allowedFamilyIds.length === 0) {
        return { success: true, latestRecordMap: {} }
      }

      const babiesResult = await db.collection('babies').where({
        _id: _.in(babyIds),
        familyId: _.in(allowedFamilyIds)
      }).limit(100).get()
      const validBabyIds = babiesResult.data.map(b => b._id)
      if (validBabyIds.length === 0) {
        return { success: true, latestRecordMap: {} }
      }

      const latestRecordMap = {}
      const pageSize = 100
      let skip = 0

      // 分页拉取按时间倒序记录，直到拿到每个宝宝的最新一条，避免默认条数限制导致漏数据
      while (Object.keys(latestRecordMap).length < validBabyIds.length) {
        const recordsResult = await db.collection('records').where({
          babyId: _.in(validBabyIds)
        }).orderBy('recordDate', 'desc').skip(skip).limit(pageSize).get()

        const pageRecords = recordsResult.data || []
        if (pageRecords.length === 0) {
          break
        }

        pageRecords.forEach(record => {
          if (!latestRecordMap[record.babyId]) {
            latestRecordMap[record.babyId] = record
          }
        })

        skip += pageRecords.length
        if (pageRecords.length < pageSize) {
          break
        }
      }

      return { success: true, latestRecordMap }
    }
    
    // 处理创建家庭的操作
    if (action === 'createFamily' && event.familyName && event.userInfo) {
      const openid = wxContext.OPENID
      const { familyName, userInfo } = event
      
      // 验证家庭名称长度
      if (familyName.trim().length > 7) {
        throw new Error('家庭名称最多7个字符')
      }
      
      // 检查用户是否已经作为原始创建者创建过家庭
      const createdFamilies = await db.collection('families').where({
        originalCreatorOpenid: openid
      }).get()
      
      if (createdFamilies.data.length > 0) {
        throw new Error('每个用户最多只能创建一个家庭')
      }
      
      // 检查用户加入的家庭数量
      const joinedFamilies = await db.collection('families').where({
        'members.openid': openid
      }).get()
      
      if (joinedFamilies.data.length >= 3) {
        throw new Error('最多只能加入3个家庭')
      }
      
      // 创建新家庭
      const newFamily = {
        name: familyName,
        creatorOpenid: openid,  // 现任掌门人
        originalCreatorOpenid: openid,  // 原始创建者（不变）
        members: [{
          openid: openid,
          nickName: userInfo.nickName || '用户',
          avatarUrl: userInfo.avatarUrl || '',
          permission: 'guardian',
          joinTime: new Date()
        }],
        createTime: new Date()
      }
      
      const createResult = await db.collection('families').add({
        data: newFamily
      })
      
      newFamily._id = createResult._id
      return { success: true, family: newFamily }
    }
    
    // 处理更新家庭名称的操作
    if (action === 'updateFamilyName' && event.familyId && event.newName) {
      const openid = wxContext.OPENID
      const { familyId, newName } = event
      const trimmedName = newName.trim()
      
      // 验证家庭名称长度
      if (!trimmedName) {
        throw new Error('家庭名称不能为空')
      }
      if (trimmedName.length > 7) {
        throw new Error('家庭名称最多7个字符')
      }
      
      // 获取家庭信息
      const familyResult = await db.collection('families').doc(familyId).get()
      const family = familyResult.data
      
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      // 验证当前用户是否为一级助教
      const currentMember = family.members.find(member => member.openid === openid)
      if (!currentMember || currentMember.permission !== 'guardian') {
        throw new Error('只有一级助教才可以修改家庭名称')
      }
      
      // 更新家庭名称
      await db.collection('families').doc(familyId).update({
        data: {
          name: trimmedName
        }
      })
      
      return { success: true }
    }
    
    // 处理更新成员权限的操作
    if (action === 'updateMemberPermission' && event.familyId && event.memberOpenid && event.permission) {
      const openid = wxContext.OPENID
      const { familyId, memberOpenid, permission } = event
      if (!isValidPermission(permission)) {
        throw new Error('无效的权限类型')
      }
      
      // 获取家庭信息
      const familyResult = await db.collection('families').doc(familyId).get()
      const family = familyResult.data
      
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      // 验证当前用户是否为一级助教
      const currentMember = family.members.find(member => member.openid === openid)
      if (!currentMember || currentMember.permission !== 'guardian') {
        throw new Error('只有一级助教才可以修改权限')
      }
      
      // 找到要更新的成员（使用openid查找）
      const memberIndex = family.members.findIndex(member => member.openid === memberOpenid)
      if (memberIndex === -1) {
        throw new Error('成员不存在')
      }
      
      // 不允许修改掌门人的权限
      if (family.members[memberIndex].openid === family.creatorOpenid) {
        throw new Error('不能修改掌门人的权限')
      }
      
      // 更新成员权限
      family.members[memberIndex].permission = permission
      
      await db.collection('families').doc(familyId).update({
        data: {
          members: family.members
        }
      })
      
      return { success: true }
    }
    
    // 处理移除家庭成员的操作
    if (action === 'removeFamilyMember' && event.familyId && event.memberOpenid) {
      const openid = wxContext.OPENID
      const { familyId, memberOpenid } = event
      
      // 获取家庭信息
      const familyResult = await db.collection('families').doc(familyId).get()
      const family = familyResult.data
      
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      // 验证当前用户是否为一级助教
      const currentMember = family.members.find(member => member.openid === openid)
      if (!currentMember || currentMember.permission !== 'guardian') {
        throw new Error('只有一级助教才可以移除成员')
      }
      
      // 找到要移除的成员（使用openid查找）
      const memberIndex = family.members.findIndex(member => member.openid === memberOpenid)
      if (memberIndex === -1) {
        throw new Error('成员不存在')
      }
      
      // 不允许移除掌门人
      if (family.members[memberIndex].openid === family.creatorOpenid) {
        throw new Error('不能移除掌门人')
      }
      
      // 移除成员
      family.members.splice(memberIndex, 1)
      
      await db.collection('families').doc(familyId).update({
        data: {
          members: family.members
        }
      })
      
      return { success: true }
    }
    
    // 处理加入家庭的操作
    if (action === 'joinFamily' && inviteCode && memberInfo) {
      const openid = wxContext.OPENID

      // 检查用户加入的家庭数量
      const joinedFamilies = await db.collection('families').where({
        'members.openid': openid
      }).get()
      if (joinedFamilies.data.length >= 3) {
        throw new Error('最多只能加入3个家庭')
      }

      // 获取用户的微信信息
      let userNickName = memberInfo.nickName
      let userAvatarUrl = memberInfo.avatarUrl
      
      try {
        // 首先检查用户是否已经在其他家庭中有自定义的用户名和头像
        const userFamilies = await db.collection('families').where({
          'members.openid': openid
        }).get()
        
        // 标记是否找到用户名
        let foundNickName = false
        
        for (const family of userFamilies.data) {
          const existingMember = family.members.find(member => member.openid === openid)
          if (existingMember) {
            // 检查用户名，不要求有头像
            if (existingMember.nickName) {
              userNickName = existingMember.nickName
              foundNickName = true
            }
            // 检查头像
            if (existingMember.avatarUrl) {
              userAvatarUrl = existingMember.avatarUrl
            }
          }
        }
        
        // 如果还没有找到用户名，尝试从用户信息中获取
        if (!foundNickName) {
          const userResult = await db.collection('users').where({
            openid: openid
          }).get()
          
          if (userResult.data.length > 0 && userResult.data[0].userInfo) {
            if (userResult.data[0].userInfo.nickName) {
              userNickName = userResult.data[0].userInfo.nickName
            }
            if (userResult.data[0].userInfo.avatarUrl) {
              userAvatarUrl = userResult.data[0].userInfo.avatarUrl
            }
          }
        }
      } catch (userError) {
        console.warn('获取用户信息失败', userError)
      }
      
      const normalizedCode = String(inviteCode).trim().toUpperCase()
      let joinedFamilyId = null
      await db.runTransaction(async transaction => {
        // 查找邀请码并验证有效性
        const inviteCodeResult = await transaction.collection('inviteCodes').where({
          code: normalizedCode,
          expireTime: _.gt(new Date()),
          used: _.neq(true)
        }).get()
        if (inviteCodeResult.data.length === 0) {
          throw new Error('邀请码无效或已过期')
        }
        const inviteCodeData = inviteCodeResult.data[0]
        const targetFamilyId = inviteCodeData.familyId
        joinedFamilyId = targetFamilyId
        const targetMemberType = inviteCodeData.memberType
        if (!isValidPermission(targetMemberType)) {
          throw new Error('邀请码权限无效')
        }

        const familyResult = await transaction.collection('families').doc(targetFamilyId).get()
        const family = familyResult.data
        if (!family) {
          throw new Error('家庭不存在')
        }
        if (family.members.some(member => member.openid === openid)) {
          throw new Error('您已经是该家庭的成员')
        }

        const finalMemberInfo = {
          openid: openid,
          nickName: userNickName,
          avatarUrl: userAvatarUrl,
          permission: targetMemberType,
          joinTime: new Date()
        }

        await transaction.collection('inviteCodes').doc(inviteCodeData._id).update({
          data: {
            used: true,
            usedBy: openid,
            usedTime: new Date()
          }
        })

        await transaction.collection('families').doc(targetFamilyId).update({
          data: {
            members: _.push(finalMemberInfo)
          }
        })
      })

      const babiesInFamily = await db.collection('babies').where({
        familyId: joinedFamilyId
      }).get()
      const opName = userNickName || '用户'
      const now = new Date()
      for (const b of babiesInFamily.data || []) {
        await db.collection('activityLogs').add({
          data: {
            familyId: joinedFamilyId,
            babyId: b._id,
            type: 'family',
            action: 'join',
            description: `${opName}加入了家庭`,
            operatorOpenid: openid,
            operatorName: opName,
            createTime: now
          }
        })
      }
      
      return { success: true }
    }
    
    // 处理退出家庭的操作
    if (action === 'leaveFamily' && familyId) {
      const openid = wxContext.OPENID
      
      // 获取家庭信息
      const familyResult = await db.collection('families').doc(familyId).get()
      const family = familyResult.data
      
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      // 检查用户是否在家庭中
      const memberIndex = family.members.findIndex(member => member.openid === openid)
      if (memberIndex === -1) {
        throw new Error('您不是该家庭的成员')
      }
      
      const leaver = family.members[memberIndex]
      const leaverName = (leaver && leaver.nickName) || '用户'
      const logTime = new Date()

      // 如果是掌门人，转让给其他一级助理
      if (family.creatorOpenid === openid) {
        // 查找其他一级助理
        const otherGuardians = family.members.filter(
          m => m.openid !== openid && m.permission === 'guardian'
        )
        
        if (otherGuardians.length > 0) {
          // 随机选择一个一级助理作为新掌门人
          const randomIndex = Math.floor(Math.random() * otherGuardians.length)
          const newCreator = otherGuardians[randomIndex]
          
          // 更新家庭的掌门人
          family.creatorOpenid = newCreator.openid
          
          // 移除当前用户
          family.members.splice(memberIndex, 1)
          
          // 记录活动日志
          const babies = await db.collection('babies').where({
            familyId: familyId
          }).get()
          for (const baby of babies.data) {
            await db.collection('activityLogs').add({
              data: {
                familyId: familyId,
                babyId: baby._id,
                type: 'family',
                action: 'transfer',
                description: `${leaverName}将掌门人转让给${newCreator.nickName || '用户'}并退出家庭`,
                operatorOpenid: openid,
                operatorName: leaverName,
                createTime: logTime
              }
            })
          }
          
          await db.collection('families').doc(familyId).update({
            data: {
              creatorOpenid: newCreator.openid,
              members: family.members
            }
          })
        } else {
          // 没有一级助理，需要前端处理（显示错误或引导解散）
          throw new Error('家庭中没有其他一级助理可接任掌门人，请解散家庭或先指定一级助理')
        }
      } else {
        // 非掌门人退出：仅移除成员
        const babies = await db.collection('babies').where({
          familyId: familyId
        }).get()
        for (const baby of babies.data) {
          await db.collection('activityLogs').add({
            data: {
              familyId: familyId,
              babyId: baby._id,
              type: 'family',
              action: 'leave',
              description: `${leaverName}离开了家庭`,
              operatorOpenid: openid,
              operatorName: leaverName,
              createTime: logTime
            }
          })
        }
        family.members.splice(memberIndex, 1)
        await db.collection('families').doc(familyId).update({
          data: {
            members: family.members
          }
        })
      }
      
      return { success: true }
    }
    
    // 处理解散家庭的操作
    if (action === 'dissolveFamily' && familyId) {
      const openid = wxContext.OPENID
      
      // 获取家庭信息
      const familyResult = await db.collection('families').doc(familyId).get()
      const family = familyResult.data
      
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      // 检查是否是掌门人
      if (family.creatorOpenid !== openid) {
        throw new Error('只有掌门人可以解散家庭')
      }
      
      const leaver = family.members.find(m => m.openid === openid)
      const leaverName = (leaver && leaver.nickName) || '用户'
      const logTime = new Date()
      
      // 获取所有宝宝
      const babies = await db.collection('babies').where({
        familyId: familyId
      }).get()
      
      const babyIds = babies.data.map(b => b._id)
      
      // 删除家庭相关的活动日志
      await db.collection('activityLogs').where({
        familyId: familyId
      }).remove()
      
      // 删除家庭相关的邀请码
      await db.collection('inviteCodes').where({
        familyId: familyId
      }).remove()
      
      // 删除家庭相关的用户收藏
      if (babyIds.length > 0) {
        await db.collection('userFavorites').where({
          babyId: _.in(babyIds)
        }).remove()
      }
      
      // 删除相关宝宝的心情记录
      for (const baby of babies.data) {
        await db.collection('moods').where({
          babyId: baby._id
        }).remove()
        await db.collection('records').where({
          babyId: baby._id
        }).remove()
        await db.collection('babies').doc(baby._id).remove()
        await deleteBabyCloudAvatarIfAny(baby.avatarUrl)
      }
      
      // 最后删除家庭
      await db.collection('families').doc(familyId).remove()
      
      return { success: true }
    }
    
    // 处理更新成员信息的操作（仅能更新自己的信息）
    if (action === 'updateMemberInfo' && familyId) {
      const openid = wxContext.OPENID
      const { nickName, avatarUrl } = event
      
      // 获取家庭信息
      const familyResult = await db.collection('families').doc(familyId).get()
      const family = familyResult.data
      
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      // 检查用户是否在家庭中
      const memberIndex = family.members.findIndex(member => member.openid === openid)
      if (memberIndex === -1) {
        throw new Error('您不是该家庭的成员')
      }
      
      // 只能更新自己的信息
      if (nickName !== undefined && nickName !== null) {
        family.members[memberIndex].nickName = nickName
      }
      if (avatarUrl !== undefined && avatarUrl !== null) {
        family.members[memberIndex].avatarUrl = avatarUrl
      }
      
      await db.collection('families').doc(familyId).update({
        data: {
          members: family.members
        }
      })
      
      // 同步更新用户在其他家庭中的信息
      if (nickName !== undefined && nickName !== null) {
        // 查询用户所在的所有其他家庭
        const otherFamilies = await db.collection('families').where({
          _id: _.neq(familyId), // 排除当前家庭
          'members.openid': openid // 用户是成员
        }).get()
        
        // 更新用户在其他家庭中的昵称
        for (const otherFamily of otherFamilies.data) {
          const otherMemberIndex = otherFamily.members.findIndex(member => member.openid === openid)
          if (otherMemberIndex !== -1) {
            otherFamily.members[otherMemberIndex].nickName = nickName
            await db.collection('families').doc(otherFamily._id).update({
              data: {
                members: otherFamily.members
              }
            })
          }
        }
        
        // 更新 users 集合中的用户昵称
        try {
          const userResult = await db.collection('users').where({ openid: openid }).get()
          if (userResult.data.length > 0) {
            await db.collection('users').doc(userResult.data[0]._id).update({
              data: {
                nickName: nickName,
                'userInfo.nickName': nickName
              }
            })
          } else {
            // 如果用户不存在于 users 集合，创建新记录
            await db.collection('users').add({
              data: {
                openid: openid,
                nickName: nickName,
                userInfo: {
                  nickName: nickName
                },
                createTime: new Date(),
                lastLoginTime: new Date()
              }
            })
          }
        } catch (userError) {
          console.warn('更新用户信息失败', userError)
        }
      }
      
      // 更新 users 集合中的用户头像
      if (avatarUrl !== undefined && avatarUrl !== null) {
        try {
          const userResult = await db.collection('users').where({ openid: openid }).get()
          if (userResult.data.length > 0) {
            await db.collection('users').doc(userResult.data[0]._id).update({
              data: {
                avatarUrl: avatarUrl,
                'userInfo.avatarUrl': avatarUrl
              }
            })
          } else {
            // 如果用户不存在于 users 集合，创建新记录
            await db.collection('users').add({
              data: {
                openid: openid,
                avatarUrl: avatarUrl,
                userInfo: {
                  avatarUrl: avatarUrl
                },
                createTime: new Date(),
                lastLoginTime: new Date()
              }
            })
          }
        } catch (userError) {
          console.warn('更新用户头像失败', userError)
        }
      }
      
      return { success: true }
    }
    
    // 处理删除宝宝的操作
    if (action === 'deleteBaby' && babyId) {
      let avatarForCleanup = null

      // 使用事务确保原子性操作
      const result = await db.runTransaction(async transaction => {
        // 验证宝宝是否存在
        const baby = await transaction.collection('babies').doc(babyId).get()
        if (!baby.data) {
          throw new Error('宝宝不存在')
        }

        // 验证用户是否有权限删除此宝宝（用户必须是宝宝所属家庭的一级助教）
        const family = await transaction.collection('families').doc(baby.data.familyId).get()
        if (!family.data || !family.data.members.some(member => member.openid === wxContext.OPENID && member.permission === 'guardian')) {
          throw new Error('只有一级助教才可以删除宝宝')
        }

        avatarForCleanup = baby.data.avatarUrl

        // 删除宝宝信息
        await transaction.collection('babies').doc(babyId).remove()

        // 删除相关记录
        await transaction.collection('records').where({
          babyId: babyId
        }).remove()

        return { success: true }
      })

      // 仅在事务提交成功后删云存储头像（失败则整个 main 抛错，不会执行到这里）
      await deleteBabyCloudAvatarIfAny(avatarForCleanup)
      return result
    }
    
    // 处理删除记录的操作
    if (action === 'deleteRecord' && event.recordId) {
      const openid = wxContext.OPENID
      const recordId = event.recordId
      
      // 查询记录信息
      const recordResult = await db.collection('records').doc(recordId).get()
      const record = recordResult.data
      
      if (!record) {
        throw new Error('记录不存在')
      }
      
      // 查询宝宝信息
      const babyResult = await db.collection('babies').doc(record.babyId).get()
      const baby = babyResult.data
      
      if (!baby) {
        throw new Error('宝宝不存在')
      }
      
      // 查询家庭信息
      const familyResult = await db.collection('families').doc(baby.familyId).get()
      const family = familyResult.data
      
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      // 检查用户权限
      const currentMember = family.members.find(member => member.openid === openid)
      if (!currentMember) {
        throw new Error('无权限删除此记录')
      }
      
      // 一级助教可以删除任何记录，二级助教只能删除自己录入的记录
      if (currentMember.permission === 'guardian' || (currentMember.permission === 'caretaker' && record.openid === openid)) {
        await db.collection('records').doc(recordId).remove()
        return { success: true }
      } else {
        throw new Error('无权限删除此记录')
      }
    }
    
    // 处理获取宝宝信息的操作
    if (action === 'getBabyById' && babyId) {
      const openid = wxContext.OPENID
      
      // 查询宝宝信息
      const babyResult = await db.collection('babies').doc(babyId).get()
      const baby = babyResult.data
      
      if (!baby) {
        throw new Error('宝宝不存在')
      }
      
      // 验证用户是否有权限查看此宝宝（用户必须是宝宝所属家庭的成员）
      const familyResult = await db.collection('families').doc(baby.familyId).get()
      const family = familyResult.data
      
      if (!family || !family.members.some(member => member.openid === openid)) {
        throw new Error('无权限查看此宝宝信息')
      }
      
      return { success: true, baby: baby }
    }
    
    // 提交用户反馈（写库 + 邮件通知；校验/限流集中在云函数）
    if (action === 'submitFeedback') {
      const openid = wxContext.OPENID
      const content = String(event.content != null ? event.content : '').trim()
      const imageFileIds = Array.isArray(event.imageFileIds) ? event.imageFileIds : []

      if (!content) {
        throw new Error('反馈内容不能为空')
      }
      if (content.length > 2000) {
        throw new Error('反馈内容过长')
      }
      if (imageFileIds.length > 3) {
        throw new Error('最多上传3张图片')
      }
      for (const fid of imageFileIds) {
        const s = String(fid || '')
        if (!s.startsWith('cloud://')) {
          throw new Error('无效的图片文件')
        }
        if (!s.includes('/feedback/')) {
          throw new Error('无效的图片路径')
        }
      }

      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
      const recentCount = await db.collection('feedback').where({
        openid: openid,
        createTime: _.gte(oneHourAgo)
      }).count()
      if (recentCount.total >= 5) {
        throw new Error('提交过于频繁，请稍后再试')
      }

      const feedbackData = {
        content,
        images: imageFileIds,
        openid,
        createTime: new Date()
      }
      const addRes = await db.collection('feedback').add({ data: feedbackData })
      const docId = addRes._id

      let emailOk = false
      let emailMessage = ''
      try {
        const invokeRes = await cloud.callFunction({
          name: 'sendFeedbackEmail',
          data: {
            data: {
              ...feedbackData,
              _id: docId
            }
          }
        })
        const r = invokeRes && invokeRes.result ? invokeRes.result : invokeRes
        emailOk = !!(r && r.success)
        if (r && !emailOk) {
          emailMessage = r.message || r.error || ''
        }
      } catch (emailErr) {
        console.warn('sendFeedbackEmail 调用失败', emailErr)
        emailMessage = emailErr.message || '邮件通知请求失败'
      }

      return {
        success: true,
        feedbackId: docId,
        emailOk,
        emailMessage
      }
    }

    // 处理获取宝宝记录的操作
    if (action === 'getRecordsByBabyId' && babyId) {
      const openid = wxContext.OPENID
      
      // 查询宝宝信息，验证宝宝存在且用户有权限查看
      const babyResult = await db.collection('babies').doc(babyId).get()
      const baby = babyResult.data
      
      if (!baby) {
        throw new Error('宝宝不存在')
      }
      
      // 验证用户是否有权限查看此宝宝的记录（用户必须是宝宝所属家庭的成员）
      const familyResult = await db.collection('families').doc(baby.familyId).get()
      const family = familyResult.data
      
      if (!family || !family.members.some(member => member.openid === openid)) {
        throw new Error('无权限查看此宝宝记录')
      }

      const page = Math.max(1, parseInt(event.recordsPage, 10) || 1)
      const rawSize = parseInt(event.recordsPageSize, 10) || 200
      const pageSize = Math.min(200, Math.max(1, rawSize))
      const skip = (page - 1) * pageSize

      const recordsResult = await db.collection('records').where({
        babyId: babyId
      }).orderBy('recordDate', 'desc').skip(skip).limit(pageSize + 1).get()

      const rows = recordsResult.data || []
      const hasMore = rows.length > pageSize
      const records = hasMore ? rows.slice(0, pageSize) : rows

      return { success: true, records, hasMore }
    }
    
    // 处理获取单个记录的操作
    if (action === 'getRecordById' && event.recordId) {
      const openid = wxContext.OPENID
      const recordId = event.recordId
      
      // 查询记录信息
      const recordResult = await db.collection('records').doc(recordId).get()
      const record = recordResult.data
      
      if (!record) {
        throw new Error('记录不存在')
      }
      
      // 验证用户是否有权限查看此记录（用户必须是宝宝所属家庭的成员）
      const babyResult = await db.collection('babies').doc(record.babyId).get()
      const baby = babyResult.data
      
      if (!baby) {
        throw new Error('宝宝不存在')
      }
      
      const familyResult = await db.collection('families').doc(baby.familyId).get()
      const family = familyResult.data
      
      if (!family || !family.members.some(member => member.openid === openid)) {
        throw new Error('无权限查看此记录')
      }
      
      return { success: true, record: record }
    }

    // 处理添加宝宝的操作
    if (action === 'addBaby' && event.babyInfo) {
      const openid = wxContext.OPENID
      const { babyInfo } = event

      const babyName = String(babyInfo.name || '').trim()
      const familyIdForBaby = babyInfo.familyId
      if (!familyIdForBaby) {
        throw new Error('请选择所属家庭')
      }
      if (!babyName) {
        throw new Error('宝宝姓名不能为空')
      }
      if (babyName.length > 7) {
        throw new Error('宝宝姓名最多7个字符')
      }

      const familyResult = await db.collection('families').doc(familyIdForBaby).get()
      const family = familyResult.data
      if (!family) {
        throw new Error('家庭不存在')
      }
      const currentMember = family.members.find(m => m.openid === openid)
      if (!currentMember || currentMember.permission !== 'guardian') {
        throw new Error('只有一级助教才可以添加宝宝')
      }

      const babiesResult = await db.collection('babies').where({ familyId: familyIdForBaby }).get()
      if (babiesResult.data.length >= 3) {
        throw new Error('该家庭最多只能添加 3 个宝宝')
      }

      const newBaby = {
        familyId: familyIdForBaby,
        openid: openid,
        name: babyName,
        gender: babyInfo.gender || 'male',
        birthDate: babyInfo.birthDate,
        avatarUrl: babyInfo.avatarUrl || '',
        createTime: new Date()
      }
      const result = await db.collection('babies').add({ data: newBaby })
      return { success: true, baby: Object.assign({}, newBaby, { _id: result._id }) }
    }

    // 处理添加记录的操作
    if (action === 'addRecord' && event.recordInfo) {
      const openid = wxContext.OPENID
      const { recordInfo } = event
      const { babyId: targetBabyId, height, weight, recordDate, isBirth } = recordInfo
      if (!targetBabyId) {
        throw new Error('缺少宝宝信息')
      }
      if (!height || !weight || !recordDate) {
        throw new Error('请填写完整的记录信息')
      }

      const babyResult = await db.collection('babies').doc(targetBabyId).get()
      const baby = babyResult.data
      if (!baby) {
        throw new Error('宝宝不存在')
      }

      const familyResult = await db.collection('families').doc(baby.familyId).get()
      const family = familyResult.data
      const currentMember = family && family.members.find(m => m.openid === openid)
      if (!currentMember || currentMember.permission === 'viewer') {
        throw new Error('只有二级助教和一级助教才可以添加记录')
      }

      const parsedHeight = parseFloat(height)
      const parsedWeight = parseFloat(weight)
      if (!(parsedHeight > 0 && parsedWeight > 0)) {
        throw new Error('身高和体重必须大于0')
      }

      const ageInMonths = isBirth ? 0 : calculateAgeInMonths(baby.birthDate, recordDate)
      const newRecord = {
        babyId: targetBabyId,
        height: parsedHeight,
        weight: parsedWeight,
        recordDate: recordDate,
        ageInMonths: ageInMonths,
        openid: openid,
        createTime: new Date()
      }
      const result = await db.collection('records').add({ data: newRecord })
      const recordActor = currentMember.nickName || '用户'
      await db.collection('activityLogs').add({
        data: {
          familyId: baby.familyId,
          babyId: targetBabyId,
          type: 'record',
          action: 'add',
          description: `${recordActor}为${baby.name}添加了成长记录（身高${parsedHeight}cm，体重${parsedWeight}kg）`,
          operatorOpenid: openid,
          operatorName: recordActor,
          createTime: new Date()
        }
      })
      return { success: true, record: Object.assign({}, newRecord, { _id: result._id }) }
    }
    
    // 处理获取单个家庭信息的操作
    if (action === 'getFamilyById' && familyId) {
      const openid = wxContext.OPENID
      
      // 查询家庭信息
      const familyResult = await db.collection('families').doc(familyId).get()
      const family = familyResult.data
      
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      // 验证用户是否是该家庭成员
      if (!family.members.some(member => member.openid === openid)) {
        throw new Error('您不是该家庭成员')
      }
      
      return { success: true, family: family }
    }
    
    // 处理创建邀请码的操作
    if (action === 'createInviteCode' && familyId && memberType) {
      const openid = wxContext.OPENID
      if (!isValidPermission(memberType)) {
        throw new Error('无效的成员类型')
      }
      
      // 查询家庭信息
      const familyResult = await db.collection('families').doc(familyId).get()
      const family = familyResult.data
      
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      // 验证当前用户权限及邀请权限
      const currentMember = family.members.find(member => member.openid === openid)
      if (!currentMember) {
        throw new Error('您不是该家庭成员')
      }
      
      // 权限检查：围观吃瓜只能邀请围观吃瓜，二级助教可邀请二级及以下，一级助教可邀请全部
      const userPermission = normalizeMemberPermissionForInvite(currentMember.permission)
      const invitePermission = memberType
      
      if (userPermission === 'viewer') {
        // 围观吃瓜只能邀请围观吃瓜
        if (invitePermission !== 'viewer') {
          throw new Error('围观吃瓜只能邀请围观吃瓜')
        }
      } else if (userPermission === 'caretaker') {
        // 二级助教可邀请二级助教和围观吃瓜
        if (invitePermission === 'guardian') {
          throw new Error('二级助教不能邀请一级助教')
        }
      } else if (userPermission === 'guardian') {
        // 一级助教可以邀请所有角色，无需限制
      } else {
        throw new Error('无效的权限')
      }

      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000)
      const recentInviteCount = await db.collection('inviteCodes').where({
        creatorOpenid: openid,
        createTime: _.gte(tenMinAgo)
      }).count()
      if (recentInviteCount.total >= 20) {
        throw new Error('生成邀请码过于频繁，请稍后再试')
      }
      
      // 生成邀请码（安全随机 + 冲突重试）
      let inviteCode = ''
      let created = false
      for (let i = 0; i < 5; i++) {
        const candidate = generateSecureInviteCode(8)
        const exists = await db.collection('inviteCodes').where({
          code: candidate,
          expireTime: _.gt(new Date())
        }).get()
        if (exists.data.length === 0) {
          inviteCode = candidate
          created = true
          break
        }
      }
      if (!created) {
        throw new Error('邀请码生成失败，请稍后重试')
      }
      
      // 保存邀请码到数据库
      await db.collection('inviteCodes').add({
        data: {
          code: inviteCode,
          familyId: familyId,
          memberType: memberType,
          creatorOpenid: openid,
          used: false,
          createTime: new Date(),
          expireTime: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12小时过期
        }
      })

      // 异步清理过期邀请码（不阻塞主业务返回）
      db.collection('inviteCodes').where({
        expireTime: _.lt(new Date())
      }).remove().catch(err => {
        console.warn('清理过期邀请码失败', err)
      })

      return { success: true, inviteCode: inviteCode }
    }
    
    // 处理更新宝宝姓名的操作
    if (action === 'updateBabyName' && babyId && event.name !== undefined) {
      const openid = wxContext.OPENID
      const { name } = event
      
      // 验证姓名长度
      if (!name || name.trim().length === 0) {
        throw new Error('宝宝姓名不能为空')
      }
      if (name.trim().length > 7) {
        throw new Error('宝宝姓名最多7个字符')
      }
      
      // 查询宝宝信息
      const babyResult = await db.collection('babies').doc(babyId).get()
      const baby = babyResult.data
      
      if (!baby) {
        throw new Error('宝宝不存在')
      }
      
      // 验证用户是否有权限修改（用户必须是宝宝所属家庭的一级助教）
      const familyResult = await db.collection('families').doc(baby.familyId).get()
      const family = familyResult.data
      
      if (!family || !family.members.some(member => member.openid === openid && member.permission === 'guardian')) {
        throw new Error('只有一级助教才可以修改宝宝姓名')
      }
      
      // 更新宝宝姓名
      await db.collection('babies').doc(babyId).update({
        data: {
          name: name.trim()
        }
      })
      
      return { success: true }
    }

    // 更新宝宝头像（须走云函数写入 babies，客户端直连 DB 常被安全规则拒绝）
    // 仅用 action 匹配：babyId/头像字段用 event 显式读取，避免顶层解构遗漏或假值导致未进分支
    if (action === 'updateBabyAvatar') {
      const openid = wxContext.OPENID
      const bid = event.babyId != null ? event.babyId : babyId
      const fid = event.avatarUrl != null ? event.avatarUrl : (event.fileID != null ? event.fileID : avatarUrl)
      if (bid == null || bid === '') {
        throw new Error('缺少宝宝 ID')
      }
      if (fid == null || (typeof fid === 'string' && !fid.trim())) {
        throw new Error('缺少头像文件地址')
      }
      const url = String(fid).trim()

      const babyResult = await db.collection('babies').doc(bid).get()
      const baby = babyResult.data
      if (!baby) {
        throw new Error('宝宝不存在')
      }

      const familyResult = await db.collection('families').doc(baby.familyId).get()
      const family = familyResult.data
      if (!family || !family.members.some(member => member.openid === openid && member.permission === 'guardian')) {
        throw new Error('只有一级助教才可以更新宝宝头像')
      }

      const previousAvatar = baby.avatarUrl != null ? String(baby.avatarUrl).trim() : ''

      await db.collection('babies').doc(bid).update({
        data: {
          avatarUrl: url
        }
      })

      if (
        previousAvatar &&
        previousAvatar.startsWith('cloud://') &&
        previousAvatar !== url
      ) {
        await deleteBabyCloudAvatarIfAny(previousAvatar)
      }

      return { success: true }
    }
    
    // 处理清理过期邀请码的操作
    if (action === 'cleanExpiredInviteCodes') {
      const openid = wxContext.OPENID
      
      // 查询并删除已过期的邀请码
      const expiredCodes = await db.collection('inviteCodes').where({
        expireTime: _.lt(new Date())
      }).get()
      
      let deletedCount = 0
      for (const code of expiredCodes.data) {
        try {
          await db.collection('inviteCodes').doc(code._id).remove()
          deletedCount++
        } catch (deleteError) {
          console.warn('删除过期邀请码失败', deleteError)
        }
      }
      
      return { success: true, deletedCount: deletedCount }
    }
    
    // 处理更新用户信息的操作（直接更新 users 集合，并同步到所有家庭成员）
    if (action === 'updateUserInfo') {
      const openid = wxContext.OPENID
      const { nickName, avatarUrl } = event
      
      try {
        // 更新 users 集合中的用户信息
        const userResult = await db.collection('users').where({ openid: openid }).get()
        if (userResult.data.length > 0) {
          const updateData = { lastLoginTime: new Date() }
          if (nickName !== undefined && nickName !== null) {
            updateData.nickName = nickName
            updateData['userInfo.nickName'] = nickName
          }
          if (avatarUrl !== undefined && avatarUrl !== null) {
            updateData.avatarUrl = avatarUrl
            updateData['userInfo.avatarUrl'] = avatarUrl
          }
          
          await db.collection('users').doc(userResult.data[0]._id).update({
            data: updateData
          })
        } else {
          // 如果用户不存在于 users 集合，创建新记录
          const createData = {
            openid: openid,
            createTime: new Date(),
            lastLoginTime: new Date(),
            avatarUrl: DEFAULT_AVATAR_URL
          }
          if (nickName !== undefined && nickName !== null) {
            createData.nickName = nickName
            createData.userInfo = { nickName: nickName }
          }
          if (avatarUrl !== undefined && avatarUrl !== null) {
            createData.avatarUrl = avatarUrl
            if (!createData.userInfo) createData.userInfo = {}
            createData.userInfo.avatarUrl = avatarUrl
          }
          
          await db.collection('users').add({ data: createData })
        }
        
        // 同步更新所有家庭中的成员信息
        if (nickName !== undefined || avatarUrl !== undefined) {
          const allFamilies = await db.collection('families').where({
            'members.openid': openid
          }).get()
          
          for (const family of allFamilies.data) {
            const memberIndex = family.members.findIndex(m => m.openid === openid)
            if (memberIndex !== -1) {
              if (nickName !== undefined && nickName !== null) {
                family.members[memberIndex].nickName = nickName
              }
              if (avatarUrl !== undefined && avatarUrl !== null) {
                family.members[memberIndex].avatarUrl = avatarUrl
              }
              await db.collection('families').doc(family._id).update({
                data: { members: family.members }
              })
            }
          }
        }
        
        return { success: true }
      } catch (error) {
        console.error('更新用户信息失败', error)
        return { success: false, error: error.message }
      }
    }
    
    // 处理登录操作（依赖 callFunction 上下文中的 OPENID，与是否建索引无关）
    if (code) {
      if (!wxContext.OPENID) {
        return {
          success: false,
          error: '云函数未获取到 OPENID，请使用小程序端「预览/真机」调用，勿仅用无登录态的云端调试',
        }
      }
      // 检查用户是否已存在
      const userResult = await db.collection('users').where({
        openid: wxContext.OPENID
      }).get()
      
      let userInfo
      if (userResult.data.length > 0) {
        // 用户已存在
        userInfo = userResult.data[0]
        // 确保老用户也有 avatarUrl 字段
        if (!userInfo.avatarUrl) {
          await db.collection('users').doc(userInfo._id).update({
            data: {
              avatarUrl: DEFAULT_AVATAR_URL,
              lastLoginTime: new Date()
            }
          })
          userInfo.avatarUrl = DEFAULT_AVATAR_URL
        } else {
          // 更新最后登录时间
          await db.collection('users').doc(userInfo._id).update({
            data: {
              lastLoginTime: new Date()
            }
          })
        }
      } else {
        // 创建新用户 - 分配随机7位用户名和默认头像
        const randomUserName = generateRandomUserName()
        const newUser = {
          openid: wxContext.OPENID,
          userName: randomUserName,  // 7位随机字符用户名
          nickName: generateRandomNickName(),  // 中文昵称用于展示
          avatarUrl: DEFAULT_AVATAR_URL,  // 默认头像
          createTime: new Date(),
          lastLoginTime: new Date()
        }
        const addResult = await db.collection('users').add({
          data: newUser
        })
        userInfo = {
          ...newUser,
          _id: addResult._id
        }
      }
      
      return {
        success: true,
        userInfo
      }
    }
    
    // ========== Mood 心情评价相关操作 ==========
    
    // 获取宝宝某月的心情记录
    if (action === 'getMoodsByMonth' && event.babyId != null && event.year != null && event.month != null) {
      const openid = wxContext.OPENID
      const babyId = event.babyId
      const year = Number(event.year)
      const month = Number(event.month)

      if (!Number.isFinite(year) || !Number.isFinite(month) || month < 1 || month > 12) {
        throw new Error('年份或月份无效')
      }

      // 验证用户是否有权限查看该宝宝
      const babyResult = await db.collection('babies').doc(babyId).get()
      const baby = babyResult.data
      if (!baby) {
        throw new Error('宝宝不存在')
      }
      
      const familyResult = await db.collection('families').doc(baby.familyId).get()
      const family = familyResult.data
      if (!family || !family.members.some(member => member.openid === openid)) {
        throw new Error('无权限查看此宝宝的心情记录')
      }
      
      // 构建月份查询条件
      const startDate = `${year}-${String(month).padStart(2, '0')}-01`
      const endDate = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`
      
      const moodsResult = await db.collection('moods').where({
        babyId: babyId,
        date: _.gte(startDate).and(_.lt(endDate))
      }).orderBy('date', 'asc').get()
      
      return { success: true, moods: moodsResult.data || [] }
    }
    
    // 获取某天的心情记录
    if (action === 'getMoodByDate' && event.babyId && event.date) {
      const openid = wxContext.OPENID
      const { babyId, date } = event
      
      // 验证用户是否有权限查看该宝宝
      const babyResult = await db.collection('babies').doc(babyId).get()
      const baby = babyResult.data
      if (!baby) {
        throw new Error('宝宝不存在')
      }
      
      const familyResult = await db.collection('families').doc(baby.familyId).get()
      const family = familyResult.data
      if (!family || !family.members.some(member => member.openid === openid)) {
        throw new Error('无权限查看此宝宝的心情记录')
      }
      
      const moodResult = await db.collection('moods').where({
        babyId: babyId,
        date: date
      }).get()
      
      return { success: true, mood: moodResult.data[0] || null }
    }
    
    // 添加心情评价
    if (action === 'addMood' && event.moodInfo) {
      const openid = wxContext.OPENID
      const { moodInfo } = event
      const { babyId, date, rating, emoji, note } = moodInfo
      
      if (!babyId || !date) {
        throw new Error('缺少必要参数')
      }
      
      // 验证用户是否有权限评价该宝宝
      const babyResult = await db.collection('babies').doc(babyId).get()
      const baby = babyResult.data
      if (!baby) {
        throw new Error('宝宝不存在')
      }
      
      const familyResult = await db.collection('families').doc(baby.familyId).get()
      const family = familyResult.data
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      const currentMember = family.members.find(member => member.openid === openid)
      if (!currentMember) {
        throw new Error('您不是该家庭成员')
      }
      
      // 检查当天是否已有评价
      const existingMoodResult = await db.collection('moods').where({
        babyId: babyId,
        date: date
      }).get()
      
      if (existingMoodResult.data.length > 0) {
        // 更新现有评价（所有家庭成员都可以重新评价或只添加备注）
        const existingMood = existingMoodResult.data[0]
        
        const noteTrim = (note || '').trim()
        const prevNote = (existingMood.note || '').trim()
        
        // 判断是否有新评分或新备注
        const hasNewRating = rating && emoji
        const hasNewNote = noteTrim && noteTrim !== prevNote
        
        if (!hasNewRating && !hasNewNote) {
          throw new Error('请选择评分或填写备注')
        }
        
        const updatePayload = {
          creatorOpenid: openid,
          creatorName: currentMember.nickName || '用户',
          creatorPermission: currentMember.permission,
          updateTime: new Date()
        }
        
        // 如果有新评分，更新评分
        if (hasNewRating) {
          updatePayload.rating = rating
          updatePayload.emoji = emoji
        }
        
        if (hasNewNote) {
          let entries = Array.isArray(existingMood.noteEntries) ? existingMood.noteEntries.slice() : []
          if (entries.length === 0 && prevNote) {
            entries.push({
              _id: `n_legacy_${existingMood._id || 'm'}`,
              text: prevNote,
              creatorOpenid: existingMood.creatorOpenid || '',
              creatorName: existingMood.creatorName || '用户',
              createTime: existingMood.updateTime || existingMood.createTime || new Date()
            })
          }
          entries.push({
            _id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            text: noteTrim,
            creatorOpenid: openid,
            creatorName: currentMember.nickName || '用户',
            createTime: new Date()
          })
          updatePayload.note = noteTrim
          updatePayload.noteEntries = entries
        } else {
          updatePayload.note = prevNote || noteTrim || ''
        }
        
        await db.collection('moods').doc(existingMood._id).update({
          data: updatePayload
        })
        
        // 添加活动日志
        let logDescription = ''
        if (hasNewRating && hasNewNote) {
          logDescription = `${currentMember.nickName || '用户'}修改了${baby.name}的心情评价为${emoji}并新增备注`
        } else if (hasNewRating) {
          logDescription = `${currentMember.nickName || '用户'}修改了${baby.name}的心情评价为${emoji}`
        } else if (hasNewNote) {
          logDescription = `${currentMember.nickName || '用户'}为${baby.name}新增备注`
        }
        
        await db.collection('activityLogs').add({
          data: {
            familyId: baby.familyId,
            babyId: babyId,
            type: 'mood',
            action: 'update',
            description: logDescription,
            operatorOpenid: openid,
            operatorName: currentMember.nickName || '用户',
            createTime: new Date()
          }
        })
        
        return { success: true, moodId: existingMood._id, updated: true }
      } else {
        const noteTrimNew = (note || '').trim()
        const noteEntriesNew = noteTrimNew
          ? [{
            _id: `n_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
            text: noteTrimNew,
            creatorOpenid: openid,
            creatorName: currentMember.nickName || '用户',
            createTime: new Date()
          }]
          : []
        
        // 判断是仅备注还是完整评价
        const hasRating = rating && emoji
        
        // 创建新评价
        const newMood = {
          babyId: babyId,
          familyId: baby.familyId,
          date: date,
          rating: rating || '',
          emoji: emoji || '',
          note: noteTrimNew,
          noteEntries: noteEntriesNew,
          creatorOpenid: openid,
          creatorName: currentMember.nickName || '用户',
          creatorPermission: currentMember.permission,
          createTime: new Date(),
          updateTime: new Date()
        }
        
        const result = await db.collection('moods').add({ data: newMood })
        
        // 添加活动日志
        let addLogDescription = ''
        if (hasRating) {
          addLogDescription = `${currentMember.nickName || '用户'}为${baby.name}评价了${emoji}`
        } else {
          addLogDescription = `${currentMember.nickName || '用户'}为${baby.name}新增备注`
        }
        
        await db.collection('activityLogs').add({
          data: {
            familyId: baby.familyId,
            babyId: babyId,
            type: 'mood',
            action: 'add',
            description: addLogDescription,
            operatorOpenid: openid,
            operatorName: currentMember.nickName || '用户',
            createTime: new Date()
          }
        })
        
        return { success: true, moodId: result._id, updated: false }
      }
    }
    
    // 删除心情记录
    if (action === 'deleteMood' && event.moodId) {
      const openid = wxContext.OPENID
      const { moodId } = event
      
      // 获取心情记录
      const moodResult = await db.collection('moods').doc(moodId).get()
      const mood = moodResult.data
      
      if (!mood) {
        throw new Error('心情记录不存在')
      }
      
      // 验证用户是否有权限删除（只有一级助教可以删除）
      const familyResult = await db.collection('families').doc(mood.familyId).get()
      const family = familyResult.data
      
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      const currentMember = family.members.find(member => member.openid === openid)
      if (!currentMember || currentMember.permission !== 'guardian') {
        throw new Error('只有一级助教才可以删除心情记录')
      }
      
      const babyDocResult = await db.collection('babies').doc(mood.babyId).get()
      const babyForLog = babyDocResult.data
      const babyLabel = (babyForLog && babyForLog.name) ? babyForLog.name : '宝宝'
      await db.collection('activityLogs').add({
        data: {
          familyId: mood.familyId,
          babyId: mood.babyId,
          type: 'mood',
          action: 'delete',
          description: `${currentMember.nickName || '用户'}删除了${babyLabel}在${mood.date}的心情记录`,
          operatorOpenid: openid,
          operatorName: currentMember.nickName || '用户',
          createTime: new Date()
        }
      })
      
      await db.collection('moods').doc(moodId).remove()
      
      return { success: true }
    }
    
    // 删除心情单日备注条目（仅一级助教）
    if (action === 'deleteMoodNote' && event.moodId && event.entryId) {
      const openid = wxContext.OPENID
      const { moodId, entryId } = event
      
      const moodRow = await db.collection('moods').doc(moodId).get()
      const moodDoc = moodRow.data
      if (!moodDoc) {
        throw new Error('心情记录不存在')
      }
      
      const famResult = await db.collection('families').doc(moodDoc.familyId).get()
      const fam = famResult.data
      if (!fam) {
        throw new Error('家庭不存在')
      }
      const mem = fam.members.find(m => m.openid === openid)
      if (!mem || mem.permission !== 'guardian') {
        throw new Error('只有一级助教才可以删除备注')
      }
      
      const entries = (moodDoc.noteEntries || []).filter(e => e._id !== entryId)
      const lastText = entries.length ? entries[entries.length - 1].text : ''
      await db.collection('moods').doc(moodId).update({
        data: {
          noteEntries: entries,
          note: lastText,
          updateTime: new Date()
        }
      })
      
      return { success: true }
    }
    
    // ========== UserFavorites 用户关注相关操作 ==========
    
    // 获取用户关注的宝宝列表
    if (action === 'getUserFavorites') {
      const openid = wxContext.OPENID
      
      const favoritesResult = await db.collection('userFavorites').where({
        openid: openid
      }).get()
      
      return { success: true, favorites: favoritesResult.data || [] }
    }
    
    // 添加或更新用户关注的宝宝
    if (action === 'setUserFavorite' && event.babyId) {
      const openid = wxContext.OPENID
      const { babyId } = event
      
      // 验证宝宝是否存在且用户有权限查看
      const babyResult = await db.collection('babies').doc(babyId).get()
      const baby = babyResult.data
      if (!baby) {
        throw new Error('宝宝不存在')
      }
      
      const familyResult = await db.collection('families').doc(baby.familyId).get()
      const family = familyResult.data
      if (!family || !family.members.some(member => member.openid === openid)) {
        throw new Error('无权限关注此宝宝')
      }
      
      // 检查是否已存在
      const existingResult = await db.collection('userFavorites').where({
        openid: openid,
        babyId: babyId
      }).get()
      
      if (existingResult.data.length > 0) {
        // 更新现有记录
        await db.collection('userFavorites').doc(existingResult.data[0]._id).update({
          data: {
            babyName: baby.name,
            familyId: baby.familyId,
            updateTime: new Date()
          }
        })
        return { success: true, favoriteId: existingResult.data[0]._id }
      } else {
        // 创建新记录
        const result = await db.collection('userFavorites').add({
          data: {
            openid: openid,
            babyId: babyId,
            babyName: baby.name,
            familyId: baby.familyId,
            createTime: new Date()
          }
        })
        return { success: true, favoriteId: result._id }
      }
    }
    
    // ========== ActivityLogs 活动日志相关操作 ==========
    
    // 获取活动日志
    if (action === 'getActivityLogs' && event.familyId) {
      const openid = wxContext.OPENID
      const { familyId, page = 1, pageSize = 20 } = event
      
      // 验证用户是否是该家庭成员
      const familyResult = await db.collection('families').doc(familyId).get()
      const family = familyResult.data
      
      if (!family || !family.members.some(member => member.openid === openid)) {
        throw new Error('无权限查看此家庭的活动日志')
      }
      
      const skip = (page - 1) * pageSize
      
      const logsResult = await db.collection('activityLogs').where({
        familyId: familyId
      }).orderBy('createTime', 'desc').skip(skip).limit(pageSize).get()
      
      return { success: true, logs: logsResult.data || [] }
    }
    
    // 获取某宝宝相关的活动日志
    if (action === 'getActivityLogsByBaby' && event.babyId) {
      const openid = wxContext.OPENID
      const { babyId, page = 1, pageSize = 20 } = event
      
      // 验证用户是否有权限查看该宝宝
      const babyResult = await db.collection('babies').doc(babyId).get()
      const baby = babyResult.data
      if (!baby) {
        throw new Error('宝宝不存在')
      }
      
      const familyResult = await db.collection('families').doc(baby.familyId).get()
      const family = familyResult.data
      if (!family || !family.members.some(member => member.openid === openid)) {
        throw new Error('无权限查看此宝宝的活动日志')
      }
      
      const skip = (page - 1) * pageSize
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      
      const logsResult = await db.collection('activityLogs').where({
        babyId: babyId,
        createTime: _.gte(thirtyDaysAgo)
      }).orderBy('createTime', 'desc').skip(skip).limit(pageSize).get()
      
      return { success: true, logs: logsResult.data || [] }
    }

    // 心情备注录音转文字（替代微信同声传译插件：需在此接入腾讯云/百度等 ASR）
    if (action === 'transcribeMoodNoteAudio' && event.fileID) {
      const openid = wxContext.OPENID
      if (!openid) {
        throw new Error('未登录')
      }
      // const file = await cloud.downloadFile({ fileID: event.fileID })
      // 将 file.fileContent 送入语音识别 API，成功则 return { success: true, text: '...', transcribeAvailable: true }
      return {
        success: true,
        text: '',
        transcribeAvailable: false
      }
    }
    
    return {
      success: false,
      error: '缺少必要参数'
    }
  } catch (error) {
    console.error('操作失败', error)
    return {
      success: false,
      error: error.message
    }
  }
}
