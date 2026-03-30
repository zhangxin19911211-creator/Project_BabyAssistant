// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

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
    
    // 处理创建家庭的操作
    if (action === 'createFamily' && event.familyName && event.userInfo) {
      const openid = wxContext.OPENID
      const { familyName, userInfo } = event
      
      // 检查用户是否已经创建过家庭
      const createdFamilies = await db.collection('families').where({
        creatorOpenid: openid
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
      
      // 计算新的颜色索引，不占用已有颜色
      const usedColors = joinedFamilies.data.map(f => f.colorIndex || 0)
      let newColorIndex = 0
      while (usedColors.includes(newColorIndex)) {
        newColorIndex = (newColorIndex + 1) % 3
        if (usedColors.length >= 3) break // 如果所有颜色都已使用，则循环使用
      }
      
      // 创建新家庭
      const newFamily = {
        name: familyName,
        creatorOpenid: openid,
        members: [{
          openid: openid,
          nickName: userInfo.nickName || '用户',
          avatarUrl: userInfo.avatarUrl || '',
          permission: 'guardian',
          joinTime: new Date()
        }],
        colorIndex: newColorIndex,
        createTime: new Date()
      }
      
      const createResult = await db.collection('families').add({
        data: newFamily
      })
      
      newFamily._id = createResult._id
      return { success: true, family: newFamily }
    }
    
    // 处理更新家庭名称的操作
    if (action === 'updateFamilyName' && event.familyId && event.newName && event.openid) {
      const { familyId, newName, openid } = event
      
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
          name: newName
        }
      })
      
      return { success: true }
    }
    
    // 处理更新成员权限的操作
    if (action === 'updateMemberPermission' && event.familyId && event.memberOpenid && event.permission && event.openid) {
      const { familyId, memberOpenid, permission, openid } = event
      
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
      
      // 不允许修改创建者的权限
      if (family.members[memberIndex].openid === family.creatorOpenid) {
        throw new Error('不能修改创建者的权限')
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
    if (action === 'removeFamilyMember' && event.familyId && event.memberOpenid && event.openid) {
      const { familyId, memberOpenid, openid } = event
      
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
      
      // 不允许移除创建者
      if (family.members[memberIndex].openid === family.creatorOpenid) {
        throw new Error('不能移除创建者')
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
      
      // 查找邀请码
      const inviteCodeResult = await db.collection('inviteCodes').where({
        code: inviteCode,
        expireTime: _.gt(new Date()),
        used: _.neq(true)  // 只查询未使用的邀请码
      }).get()
      
      if (inviteCodeResult.data.length === 0) {
        throw new Error('邀请码无效或已过期')
      }
      
      const inviteCodeData = inviteCodeResult.data[0]
      const familyId = inviteCodeData.familyId
      const memberType = inviteCodeData.memberType
      
      // 获取家庭信息
      const familyResult = await db.collection('families').doc(familyId).get()
      const family = familyResult.data
      
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      // 检查用户是否已经在家庭中
      if (family.members.some(member => member.openid === openid)) {
        throw new Error('您已经是该家庭的成员')
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
      
      // 准备成员信息
      const finalMemberInfo = {
        openid: openid,
        nickName: userNickName,
        avatarUrl: userAvatarUrl,
        permission: memberType,
        joinTime: new Date()
      }
      
      // 添加用户到家庭
      await db.collection('families').doc(familyId).update({
        data: {
          members: _.push(finalMemberInfo)
        }
      })
      
      // 删除已使用的邀请码
      try {
        await db.collection('inviteCodes').doc(inviteCodeData._id).remove()
      } catch (deleteError) {
        console.warn('删除邀请码失败', deleteError)
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
      
      // 如果是创建者，删除整个家庭
      if (family.creatorOpenid === openid) {
        // 删除家庭
        await db.collection('families').doc(familyId).remove()
        
        // 删除该家庭的所有宝宝数据
        const babies = await db.collection('babies').where({
          familyId: familyId
        }).get()
        
        for (const baby of babies.data) {
          // 删除宝宝的记录
          await db.collection('records').where({
            babyId: baby._id
          }).remove()
          
          // 删除宝宝信息
          await db.collection('babies').doc(baby._id).remove()
        }
      } else {
        // 不是创建者，只是从家庭成员中移除
        family.members.splice(memberIndex, 1)
        
        await db.collection('families').doc(familyId).update({
          data: {
            members: family.members
          }
        })
      }
      
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
      }
      
      return { success: true }
    }
    
    // 处理删除宝宝的操作
    if (action === 'deleteBaby' && babyId) {
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
        
        // 删除宝宝信息
        await transaction.collection('babies').doc(babyId).remove()
        
        // 删除相关记录
        await transaction.collection('records').where({ 
          babyId: babyId 
        }).remove()
        
        return { success: true }
      })
      
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
      
      // 查询宝宝的记录
      const recordsResult = await db.collection('records').where({
        babyId: babyId
      }).orderBy('recordDate', 'desc').get()
      
      return { success: true, records: recordsResult.data || [] }
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
      
      // 查询家庭信息
      const familyResult = await db.collection('families').doc(familyId).get()
      const family = familyResult.data
      
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      // 验证当前用户是否为一级助教或二级助教
      const currentMember = family.members.find(member => member.openid === openid)
      if (!currentMember || (currentMember.permission !== 'guardian' && currentMember.permission !== 'caretaker')) {
        throw new Error('只有一级助教和二级助教可以邀请成员')
      }
      
      // 生成邀请码
      const inviteCode = Math.random().toString(36).substring(2, 10).toUpperCase()
      
      // 保存邀请码到数据库
      await db.collection('inviteCodes').add({
        data: {
          code: inviteCode,
          familyId: familyId,
          memberType: memberType,
          creatorOpenid: openid,
          createTime: new Date(),
          expireTime: new Date(Date.now() + 12 * 60 * 60 * 1000) // 12小时过期
        }
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
    
    // 处理登录操作
    if (code) {
      // 检查用户是否已存在
      const userResult = await db.collection('users').where({
        openid: wxContext.OPENID
      }).get()
      
      let userInfo
      if (userResult.data.length > 0) {
        // 用户已存在
        userInfo = userResult.data[0]
        // 更新最后登录时间
        await db.collection('users').doc(userInfo._id).update({
          data: {
            lastLoginTime: new Date()
          }
        })
      } else {
        // 创建新用户
        const newUser = {
          openid: wxContext.OPENID,
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
