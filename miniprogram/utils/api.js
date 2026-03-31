const { calculateAge, formatAgeString } = require('./util.js')
const db = wx.cloud.database()
const _ = db.command

// ===== 缓存管理模块 =====
const CACHE_CONFIG = {
  families: { key: 'cache_families', ttl: 5 * 60 * 1000 }, // 5 分钟
  babies: { key: 'cache_babies', ttl: 5 * 60 * 1000 }
}

// 设置缓存
const setCache = (key, data) => {
  try {
    wx.setStorageSync(key, {
      data: data,
      timestamp: Date.now()
    })
  } catch (e) {
    console.warn('设置缓存失败', e)
  }
}

// 获取缓存
const getCache = (key, ttl) => {
  try {
    const cached = wx.getStorageSync(key)
    if (cached && cached.timestamp) {
      const isExpired = Date.now() - cached.timestamp > ttl
      if (!isExpired) {
        return cached.data
      }
    }
  } catch (e) {
    console.warn('读取缓存失败', e)
  }
  return null
}

// 清除缓存
const clearCache = (key) => {
  try {
    wx.removeStorageSync(key)
  } catch (e) {
    console.warn('清除缓存失败', e)
  }
}

// ===== 登录验证模块 =====
// 获取当前用户信息
const getCurrentUser = () => {
  const app = getApp()
  return app.globalData.userInfo || {
    openid: wx.getStorageSync('openid')
  }
}

// 等待登录完成（带超时机制）
const waitForLogin = () => {
  return new Promise((resolve, reject) => {
    const app = getApp()
    const startTime = Date.now()
    const maxWaitTime = 5000 // 最大等待时间 5 秒
    
    const checkLogin = () => {
      const currentTime = Date.now()
      if (currentTime - startTime > maxWaitTime) {
        reject(new Error('登录超时'))
        return
      }
      
      if (app.globalData.userInfo && app.globalData.userInfo.openid) {
        resolve(app.globalData.userInfo)
      } else {
        setTimeout(checkLogin, 100)
      }
    }
    
    if (app.globalData.userInfo && app.globalData.userInfo.openid) {
      resolve(app.globalData.userInfo)
    } else {
      app.login()
      setTimeout(checkLogin, 100)
    }
  })
}

// 统一的登录检查装饰器
const ensureLogin = async () => {
  let user = getCurrentUser()
  if (!user || !user.openid) {
    user = await waitForLogin()
  }
  return user
}

// 获取用户的宝宝列表
const getBabies = async () => {
  try {
    // 尝试从缓存读取
    const cached = getCache(CACHE_CONFIG.babies.key, CACHE_CONFIG.babies.ttl)
    if (cached) {
      return cached
    }
    
    await ensureLogin()
    
    // 使用云函数获取宝宝列表（绕过数据库权限限制）
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getBabies'
      }
    })
    
    if (result.result && result.result.success) {
      const babies = result.result.babies || []
      // 写入缓存
      setCache(CACHE_CONFIG.babies.key, babies)
      return babies
    } else {
      console.error('获取宝宝列表失败', result.result?.error)
      return []
    }
  } catch (error) {
    console.error('获取宝宝列表失败', error)
    return []
  }
}

// 根据ID获取宝宝信息
const getBabyById = async (id) => {
  try {
    // 获取当前用户信息
    let user = getCurrentUser()
    if (!user || !user.openid) {
      try {
        // 等待登录完成
        user = await waitForLogin()
      } catch (loginError) {
        console.error('登录失败', loginError)
        return null
      }
    }
    
    // 使用云函数获取宝宝信息，绕过数据库权限限制
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getBabyById',
        babyId: id
      }
    })
    
    if (result.result && result.result.success) {
      return result.result.baby
    } else {
      console.error('获取宝宝信息失败', result.result?.error)
      return null
    }
  } catch (error) {
    console.error('获取宝宝信息失败', error)
    return null
  }
}

// 根据ID获取记录信息
const getRecordById = async (id) => {
  try {
    // 获取当前用户信息
    let user = getCurrentUser()
    if (!user || !user.openid) {
      try {
        // 等待登录完成
        user = await waitForLogin()
      } catch (loginError) {
        console.error('登录失败', loginError)
        return null
      }
    }
    
    // 使用云函数获取记录信息，绕过数据库权限限制
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getRecordById',
        recordId: id
      }
    })
    
    if (result.result && result.result.success) {
      return result.result.record
    } else {
      console.error('获取记录信息失败', result.result?.error)
      return null
    }
  } catch (error) {
    console.error('获取记录信息失败', error)
    return null
  }
}

// 添加宝宝
const addBaby = async (babyInfo) => {
  try {
    await ensureLogin()
    
    // 先确定有效的 familyId（传入的或默认的第一个家庭）
    let familyId = babyInfo.familyId
    if (!familyId) {
      try {
        const families = await getFamilies()
        if (families.length > 0) {
          familyId = families[0]._id
        }
      } catch (error) {
        console.error('获取家庭信息失败', error)
      }
    }
    
    // 如果仍没有 familyId，抛出错误
    if (!familyId) {
      throw new Error('请选择所属家庭')
    }
    
    // 检查宝宝数量限制（按家庭过滤）
    const babies = await getBabies()
    const babiesInFamily = babies.filter(b => b.familyId === familyId)
    if (babiesInFamily.length >= 3) {
      throw new Error('该家庭最多只能添加 3 个宝宝')
    }
    
    const user = getCurrentUser()
    const newBaby = Object.assign({}, babyInfo, {
      openid: user.openid,
      familyId: familyId,
      createTime: new Date()
    })
    
    const result = await db.collection('babies').add({
      data: newBaby
    })
    
    newBaby._id = result._id
    
    // 创建出生记录
    if (babyInfo.birthHeight && babyInfo.birthWeight) {
      await addRecord({
        babyId: newBaby._id,
        height: parseFloat(babyInfo.birthHeight),
        weight: parseFloat(babyInfo.birthWeight),
        recordDate: babyInfo.birthDate
      }, true)
    }
    
    // 清除缓存，确保下次获取最新数据
    clearCache(CACHE_CONFIG.babies.key)
    clearCache(CACHE_CONFIG.families.key)
    
    return newBaby
  } catch (error) {
    console.error('添加宝宝失败', error)
    throw error
  }
}

// 删除宝宝
const deleteBaby = async (id) => {
  try {
    await ensureLogin()
    
    // 使用云函数确保事务性
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'deleteBaby',
        babyId: id
      }
    })
    
    if (result.result && result.result.success) {
      // 清除缓存
      clearCache(CACHE_CONFIG.babies.key)
      return result.result
    } else {
      throw new Error(result.result?.error || '删除失败')
    }
  } catch (error) {
    console.error('删除宝宝失败', error)
    throw error
  }
}

// 获取所有记录
const getRecords = async () => {
  try {
    // 先获取用户的所有宝宝ID
    const babies = await getBabies()
    const babyIds = babies.map(baby => baby._id)
    
    if (babyIds.length === 0) {
      return []
    }
    
    const result = await db.collection('records').where({
      babyId: _.in(babyIds)
    }).get()
    
    return result.data || []
  } catch (error) {
    console.error('获取记录失败', error)
    return []
  }
}

// 根据宝宝ID获取记录
const getRecordsByBabyId = async (babyId) => {
  try {
    // 使用云函数获取宝宝记录，绕过数据库权限限制
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getRecordsByBabyId',
        babyId: babyId
      }
    })
    
    if (result.result && result.result.success) {
      return result.result.records || []
    } else {
      console.error('获取宝宝记录失败', result.result?.error)
      return []
    }
  } catch (error) {
    console.error('获取宝宝记录失败', error)
    return []
  }
}

// 获取最新记录
const getLatestRecord = async (babyId) => {
  try {
    const records = await getRecordsByBabyId(babyId)
    return records[0] || null
  } catch (error) {
    console.error('获取最新记录失败', error)
    return null
  }
}

// 添加记录
const addRecord = async (recordInfo, isBirth = false) => {
  try {
    let user = getCurrentUser()
    if (!user || !user.openid) {
      user = await waitForLogin()
    }
    
    const baby = await getBabyById(recordInfo.babyId)
    if (!baby) {
      throw new Error('宝宝不存在')
    }
    
    // 检查用户权限（二级助教和一级助教可以添加记录）
    const families = await getFamilies()
    const family = families.find(f => f._id === baby.familyId)
    if (!family) {
      throw new Error('无权限为此宝宝添加记录')
    }
    
    const currentMember = family.members.find(m => m.openid === user.openid)
    if (!currentMember || currentMember.permission === 'viewer') {
      throw new Error('只有二级助教和一级助教才可以添加记录')
    }
    
    let ageInMonths = 0
    if (!isBirth) {
      const ageObj = calculateAge(baby.birthDate, recordInfo.recordDate)
      ageInMonths = ageObj.years * 12 + ageObj.months + (ageObj.days >= 15 ? 0.5 : 0)
    }
    
    const newRecord = Object.assign({}, recordInfo, {
      ageInMonths: ageInMonths,
      openid: user.openid,
      createTime: new Date()
    })
    
    const result = await db.collection('records').add({
      data: newRecord
    })
    
    newRecord._id = result._id
    return newRecord
  } catch (error) {
    console.error('添加记录失败', error)
    throw error
  }
}

// 删除记录
const deleteRecord = async (id) => {
  try {
    let user = getCurrentUser()
    if (!user || !user.openid) {
      user = await waitForLogin()
    }
    
    // 使用云函数删除记录（绕过数据库权限限制）
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'deleteRecord',
        recordId: id
      }
    })
    
    if (result.result && result.result.success) {
      return result.result
    } else {
      throw new Error(result.result?.error || '删除记录失败')
    }
  } catch (error) {
    console.error('删除记录失败', error)
    throw error
  }
}

// 更新宝宝头像
const updateBabyAvatar = async (id, avatarUrl) => {
  try {
    // 获取当前用户信息
    let user = getCurrentUser()
    if (!user || !user.openid) {
      // 等待登录完成
      user = await waitForLogin()
    }
    
    // 验证宝宝是否存在且用户有权限
    const baby = await getBabyById(id)
    if (!baby) {
      throw new Error('宝宝不存在')
    }
    
    // 检查用户权限
    const hasPermission = await checkPermission(id, 'guardian')
    if (!hasPermission) {
      throw new Error('只有一级助教才可以更新宝宝头像')
    }
    
    await db.collection('babies').doc(id).update({
      data: {
        avatarUrl: avatarUrl
      }
    })
    
    // 清除宝宝列表缓存，确保首页能看到更新后的头像
    clearCache(CACHE_CONFIG.babies.key)
  } catch (error) {
    console.error('更新头像失败', error)
    throw error
  }
}

// 更新宝宝姓名
const updateBabyName = async (id, name) => {
  try {
    // 验证姓名长度
    if (!name || name.trim().length === 0) {
      throw new Error('宝宝姓名不能为空')
    }
    if (name.trim().length > 7) {
      throw new Error('宝宝姓名最多7个字符')
    }
    
    // 使用云函数更新宝宝姓名，绕过数据库权限限制
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'updateBabyName',
        babyId: id,
        name: name.trim()
      }
    })
    
    if (result.result && result.result.success) {
      // 清除宝宝列表缓存，确保所有用户能看到更新后的宝宝姓名
      clearCache(CACHE_CONFIG.babies.key)
      return result.result
    } else {
      throw new Error(result.result?.error || '更新宝宝姓名失败')
    }
  } catch (error) {
    console.error('更新宝宝姓名失败', error)
    throw error
  }
}

// 获取用户的所有家庭
const getFamilies = async () => {
  try {
    // 尝试从缓存读取
    const cached = getCache(CACHE_CONFIG.families.key, CACHE_CONFIG.families.ttl)
    if (cached) {
      return cached
    }
    
    await ensureLogin()
    
    // 使用云函数获取家庭列表（绕过数据库权限限制）
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getFamilies'
      }
    })
    
    if (result.result && result.result.success) {
      const families = result.result.families || []
      // 写入缓存
      setCache(CACHE_CONFIG.families.key, families)
      return families
    } else {
      throw new Error(result.result?.error || '获取家庭信息失败')
    }
  } catch (error) {
    console.error('获取家庭信息失败', error)
    throw error
  }
}

// 获取单个家庭信息
const getFamilyById = async (familyId) => {
  try {
    // 使用云函数获取家庭信息，绕过数据库权限限制
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getFamilyById',
        familyId: familyId
      }
    })
    
    if (result.result && result.result.success) {
      return result.result.family
    } else {
      throw new Error(result.result?.error || '获取家庭信息失败')
    }
  } catch (error) {
    console.error('获取家庭信息失败', error)
    throw error
  }
}

// 获取当前家庭（兼容旧代码）
const getFamily = async () => {
  try {
    const families = await getFamilies()
    return families[0] || null
  } catch (error) {
    console.error('获取家庭信息失败', error)
    return null
  }
}

// 创建家庭
const createFamily = async (familyName) => {
  try {
    await ensureLogin()
    const user = getCurrentUser()
    
    // 使用云函数创建家庭（绕过数据库权限限制）
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'createFamily',
        familyName: familyName || '我的家庭',
        userInfo: {
          openid: user.openid,
          nickName: user.nickName || '用户',
          avatarUrl: user.avatarUrl || ''
        }
      }
    })
    
    if (result.result && result.result.success) {
      // 清除缓存
      clearCache(CACHE_CONFIG.families.key)
      return result.result.family
    } else {
      throw new Error(result.result?.error || '创建家庭失败')
    }
  } catch (error) {
    console.error('创建家庭失败', error)
    throw error
  }
}

// 创建邀请码
const createInviteCode = async (familyId, memberType) => {
  try {
    let user = getCurrentUser()
    if (!user || !user.openid) {
      // 等待登录完成
      user = await waitForLogin()
    }
    
    if (!familyId || !memberType) {
      throw new Error('缺少必要参数')
    }
    
    // 使用云函数创建邀请码，绕过数据库权限限制
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'createInviteCode',
        familyId: familyId,
        memberType: memberType
      }
    })
    
    if (result.result && result.result.success) {
      return result.result.inviteCode
    } else {
      throw new Error(result.result?.error || '创建邀请码失败')
    }
  } catch (error) {
    console.error('创建邀请码失败', error)
    throw error
  }
}

// 加入家庭
const joinFamily = async (inviteCode) => {
  try {
    let user = getCurrentUser()
    if (!user || !user.openid) {
      // 等待登录完成
      user = await waitForLogin()
    }
    
    // 检查用户加入的家庭数量
    const joinedFamilies = await db.collection('families').where({
      'members.openid': user.openid
    }).get()
    
    if (joinedFamilies.data.length >= 3) {
      throw new Error('最多只能加入3个家庭')
    }
    
    // 准备成员信息，使用用户的实际用户名和头像
    let nickName = user.nickName || user.userInfo?.nickName || '用户'
    let avatarUrl = user.avatarUrl || user.userInfo?.avatarUrl || ''
    
    // 尝试从本地存储中获取用户信息
    try {
      const storageInfo = wx.getStorageSync('userInfo')
      if (storageInfo) {
        nickName = storageInfo.nickName || nickName
        avatarUrl = storageInfo.avatarUrl || avatarUrl
      }
    } catch (e) {
      console.error('获取本地存储用户信息失败', e)
    }
    
    const memberInfo = {
      openid: user.openid,
      nickName: nickName,
      avatarUrl: avatarUrl,
      joinTime: new Date()
    }
    
    // 使用云函数加入家庭（绕过数据库权限限制）
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'joinFamily',
        inviteCode: inviteCode,
        memberInfo: memberInfo
      }
    })
    
    if (result.result && result.result.success) {
      // 清除缓存，确保页面刷新时获取最新数据
      clearCache(CACHE_CONFIG.families.key)
      clearCache(CACHE_CONFIG.babies.key)
      return true
    } else {
      throw new Error(result.result?.error || '加入家庭失败')
    }
  } catch (error) {
    console.error('加入家庭失败', error)
    throw error
  }
}

// 退出家庭
const leaveFamily = async (familyId) => {
  try {
    await ensureLogin()
    
    // 使用云函数退出家庭（绕过数据库权限限制）
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'leaveFamily',
        familyId: familyId
      }
    })
    
    if (result.result && result.result.success) {
      // 清除缓存
      clearCache(CACHE_CONFIG.families.key)
      clearCache(CACHE_CONFIG.babies.key)
      return true
    } else {
      throw new Error(result.result?.error || '退出家庭失败')
    }
  } catch (error) {
    console.error('退出家庭失败', error)
    throw error
  }
}

// 更新成员信息（头像和用户名）
const updateMemberInfo = async (familyId, nickName, avatarUrl) => {
  try {
    let user = getCurrentUser()
    if (!user || !user.openid) {
      // 等待登录完成
      user = await waitForLogin()
    }
    
    // 使用云函数更新成员信息（绕过数据库权限限制）
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'updateMemberInfo',
        familyId: familyId,
        nickName: nickName,
        avatarUrl: avatarUrl
      }
    })
    
    if (result.result && result.result.success) {
      return true
    } else {
      throw new Error(result.result?.error || '更新成员信息失败')
    }
  } catch (error) {
    console.error('更新成员信息失败', error)
    throw error
  }
}

// 更新家庭名称
const updateFamilyName = async (familyId, newName) => {
  try {
    let user = getCurrentUser()
    if (!user || !user.openid) {
      // 等待登录完成
      user = await waitForLogin()
    }
    
    // 使用云函数更新家庭名称（绕过数据库权限限制）
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'updateFamilyName',
        familyId: familyId,
        newName: newName,
        openid: user.openid
      }
    })
    
    if (result.result && result.result.success) {
      // 清除家庭列表缓存，确保小程序能看到更新后的家庭名称
      clearCache(CACHE_CONFIG.families.key)
      return true
    } else {
      throw new Error(result.result?.error || '更新家庭名称失败')
    }
  } catch (error) {
    console.error('更新家庭名称失败', error)
    throw error
  }
}

// 更新成员权限
const updateMemberPermission = async (familyId, memberOpenid, permission) => {
  try {
    let user = getCurrentUser()
    if (!user || !user.openid) {
      // 等待登录完成
      user = await waitForLogin()
    }
    
    // 使用云函数更新成员权限（绕过数据库权限限制）
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'updateMemberPermission',
        familyId: familyId,
        memberOpenid: memberOpenid,
        permission: permission,
        openid: user.openid
      }
    })
    
    if (result.result && result.result.success) {
      return true
    } else {
      throw new Error(result.result?.error || '更新成员权限失败')
    }
    
    return true
  } catch (error) {
    console.error('更新成员权限失败', error)
    throw error
  }
}

// 移除家庭成员
const removeFamilyMember = async (familyId, memberOpenid) => {
  try {
    let user = getCurrentUser()
    if (!user || !user.openid) {
      // 等待登录完成
      user = await waitForLogin()
    }
    
    // 使用云函数移除家庭成员（绕过数据库权限限制）
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'removeFamilyMember',
        familyId: familyId,
        memberOpenid: memberOpenid,
        openid: user.openid
      }
    })
    
    if (result.result && result.result.success) {
      return true
    } else {
      throw new Error(result.result?.error || '移除家庭成员失败')
    }
  } catch (error) {
    console.error('移除家庭成员失败', error)
    throw error
  }
}

// 检查用户权限
const checkPermission = async (babyId, requiredPermission) => {
  try {
    let user = getCurrentUser()
    if (!user || !user.openid) {
      // 等待登录完成
      user = await waitForLogin()
    }
    
    // 获取所有家庭
    const families = await getFamilies()
    
    if (babyId) {
      // 获取宝宝信息，找到所属家庭
      const baby = await getBabyById(babyId)
      if (!baby || !baby.familyId) {
        throw new Error('宝宝不存在')
      }
      
      // 找到宝宝所属的家庭
      const family = families.find(f => f._id === baby.familyId)
      if (!family) {
        throw new Error('家庭不存在')
      }
      
      // 找到当前用户在该家庭中的权限
      const currentMember = family.members.find(member => member.openid === user.openid)
      if (!currentMember) {
        throw new Error('您不是该家庭成员')
      }
      
      // 检查权限
      const permissionLevels = {
        'viewer': 1,
        'caretaker': 2,
        'guardian': 3
      }
      
      const userPermissionLevel = permissionLevels[currentMember.permission]
      const requiredPermissionLevel = permissionLevels[requiredPermission]
      
      return userPermissionLevel >= requiredPermissionLevel
    } else {
      // 如果没有提供 babyId，检查用户是否在任何家庭中具有所需权限
      const permissionLevels = {
        'viewer': 1,
        'caretaker': 2,
        'guardian': 3
      }
      
      const requiredPermissionLevel = permissionLevels[requiredPermission]
      
      // 检查用户在任何家庭中的权限
      for (const family of families) {
        const currentMember = family.members.find(member => member.openid === user.openid)
        if (currentMember) {
          const userPermissionLevel = permissionLevels[currentMember.permission]
          if (userPermissionLevel >= requiredPermissionLevel) {
            return true
          }
        }
      }
      
      // 用户在所有家庭中都没有所需权限
      return false
    }
  } catch (error) {
    console.error('检查权限失败', error)
    return false
  }
}

module.exports = {
  getBabies,
  getBabyById,
  getRecordById,
  addBaby,
  deleteBaby,
  updateBabyAvatar,
  updateBabyName,
  getRecordsByBabyId,
  getLatestRecord,
  addRecord,
  deleteRecord,
  getFamily,
  getFamilies,
  getFamilyById,
  createFamily,
  createInviteCode,
  joinFamily,
  leaveFamily,
  updateMemberInfo,
  updateFamilyName,
  updateMemberPermission,
  removeFamilyMember,
  checkPermission,
  clearCache
}
