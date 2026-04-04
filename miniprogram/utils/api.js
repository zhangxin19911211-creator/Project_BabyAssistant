const db = wx.cloud.database()
const _ = db.command

// ===== 缓存管理模块 =====
// 说明：缓存仅存本机 Storage，其他设备/模拟器新增数据不会帮你清缓存。
// 首页/心情/家庭等 onShow 会先 invalidateMoodCaches 再请求，避免多开模拟器长时间不一致。
const CACHE_CONFIG = {
  families: { key: 'cache_families', ttl: 90 * 1000 }, // 90s 兜底；主要依赖各页 onShow 主动失效
  babies: { key: 'cache_babies', ttl: 90 * 1000 }
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

/** 心情页等需要最新宝宝头像/家庭列表时调用，避免本地缓存与 babies 库不一致 */
const invalidateMoodCaches = () => {
  clearCache(CACHE_CONFIG.babies.key)
  clearCache(CACHE_CONFIG.families.key)
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
    // 新环境云函数冷启动 + wx.login 链路可能超过 5s，适当放宽容忍
    const maxWaitTime = 15000

    const checkLogin = () => {
      const currentTime = Date.now()
      if (currentTime - startTime > maxWaitTime) {
        reject(new Error('登录超时'))
        return
      }

      const storedOpenid = wx.getStorageSync('openid')
      if (app.globalData.userInfo && app.globalData.userInfo.openid) {
        resolve(app.globalData.userInfo)
      } else if (storedOpenid) {
        resolve({ openid: storedOpenid })
      } else {
        setTimeout(checkLogin, 100)
      }
    }

    if (app.globalData.userInfo && app.globalData.userInfo.openid) {
      resolve(app.globalData.userInfo)
    } else if (wx.getStorageSync('openid')) {
      resolve({ openid: wx.getStorageSync('openid') })
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

    // getBabies 在云函数内使用 wxContext.OPENID，不依赖客户端 globalData.userInfo
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
      const families = await getFamilies()
      if (families.length > 0) {
        familyId = families[0]._id
      }
    }
    if (!familyId) {
      throw new Error('请选择所属家庭')
    }

    const addBabyResult = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'addBaby',
        babyInfo: Object.assign({}, babyInfo, { familyId })
      }
    })

    if (!addBabyResult.result || !addBabyResult.result.success) {
      throw new Error(addBabyResult.result?.error || '添加宝宝失败')
    }

    const newBaby = addBabyResult.result.baby

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

// 根据宝宝ID获取记录；不传 page 时云函数分页拉取并合并；传 page 时返回 { records, hasMore }
const getRecordsByBabyId = async (babyId, options = {}) => {
  const pageSize = Math.min(200, Math.max(1, options.pageSize || 200))
  const isPagedRequest = options.page != null

  const fetchPage = async (page) => {
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getRecordsByBabyId',
        babyId,
        recordsPage: page,
        recordsPageSize: pageSize
      }
    })
    if (result.result && result.result.success) {
      return {
        records: result.result.records || [],
        hasMore: !!result.result.hasMore
      }
    }
    console.error('获取宝宝记录失败', result.result?.error)
    return { records: [], hasMore: false }
  }

  try {
    if (isPagedRequest) {
      return await fetchPage(options.page)
    }
    const all = []
    let page = 1
    let hasMore = true
    const maxPages = 25
    while (hasMore && page <= maxPages) {
      const { records, hasMore: more } = await fetchPage(page)
      all.push(...records)
      hasMore = more
      page += 1
    }
    return all
  } catch (error) {
    console.error('获取宝宝记录失败', error)
    if (isPagedRequest) {
      return { records: [], hasMore: false }
    }
    return []
  }
}

// 获取最新记录
const getLatestRecord = async (babyId) => {
  try {
    const { records } = await getRecordsByBabyId(babyId, { page: 1, pageSize: 1 })
    return (records && records[0]) || null
  } catch (error) {
    console.error('获取最新记录失败', error)
    return null
  }
}

// 批量获取最新记录，返回 { babyId: latestRecord }
const getLatestRecordsByBabyIds = async (babyIds) => {
  try {
    const ids = Array.from(new Set((babyIds || []).filter(Boolean)))
    if (ids.length === 0) {
      return {}
    }
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getLatestRecordsByBabyIds',
        babyIds: ids
      }
    })
    if (result.result && result.result.success) {
      return result.result.latestRecordMap || {}
    }
    console.error('批量获取最新记录失败', result.result?.error)
    return {}
  } catch (error) {
    console.error('批量获取最新记录失败', error)
    return {}
  }
}

// 添加记录
const addRecord = async (recordInfo, isBirth = false) => {
  try {
    await ensureLogin()

    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'addRecord',
        recordInfo: Object.assign({}, recordInfo, { isBirth })
      }
    })

    if (result.result && result.result.success) {
      return result.result.record
    }
    throw new Error(result.result?.error || '添加记录失败')
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

// 更新宝宝头像（云函数写入 babies，与 updateBabyName 一致，避免客户端无写权限）
const updateBabyAvatar = async (id, avatarUrl) => {
  try {
    await ensureLogin()

    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'updateBabyAvatar',
        babyId: id,
        avatarUrl: avatarUrl,
        fileID: avatarUrl
      }
    })

    if (result.result && result.result.success) {
      clearCache(CACHE_CONFIG.babies.key)
      return result.result
    }
    throw new Error(result.result?.error || '更新宝宝头像失败')
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

    // getFamilies 在云函数内使用 OPENID，无需等待客户端登录态写回
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

// 解散家庭
const dissolveFamily = async (familyId) => {
  try {
    await ensureLogin()
    
    // 使用云函数解散家庭
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'dissolveFamily',
        familyId: familyId
      }
    })
    
    if (result.result && result.result.success) {
      // 清除缓存
      clearCache(CACHE_CONFIG.families.key)
      clearCache(CACHE_CONFIG.babies.key)
      return true
    } else {
      throw new Error(result.result?.error || '解散家庭失败')
    }
  } catch (error) {
    console.error('解散家庭失败', error)
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
        newName: newName
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
        permission: permission
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
        memberOpenid: memberOpenid
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

// ========== Mood 心情评价相关接口 ==========

// 获取宝宝某月的心情记录
const getMoodsByMonth = async (babyId, year, month) => {
  try {
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getMoodsByMonth',
        babyId,
        year,
        month
      }
    })
    
    if (result.result && result.result.success) {
      return result.result.moods || []
    } else {
      throw new Error(result.result?.error || '获取心情记录失败')
    }
  } catch (error) {
    console.error('获取心情记录失败', error)
    throw error
  }
}

// 获取某天的心情记录
const getMoodByDate = async (babyId, date) => {
  try {
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getMoodByDate',
        babyId,
        date
      }
    })
    
    if (result.result && result.result.success) {
      return result.result.mood
    } else {
      throw new Error(result.result?.error || '获取心情记录失败')
    }
  } catch (error) {
    console.error('获取心情记录失败', error)
    throw error
  }
}

// 添加或更新心情评价
const addMood = async (moodInfo) => {
  try {
    await ensureLogin()
    
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'addMood',
        moodInfo
      }
    })
    
    if (result.result && result.result.success) {
      return result.result
    } else {
      throw new Error(result.result?.error || '添加心情评价失败')
    }
  } catch (error) {
    console.error('添加心情评价失败', error)
    throw error
  }
}

// 删除心情记录
const deleteMood = async (moodId) => {
  try {
    await ensureLogin()
    
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'deleteMood',
        moodId
      }
    })
    
    if (result.result && result.result.success) {
      return result.result
    } else {
      throw new Error(result.result?.error || '删除心情记录失败')
    }
  } catch (error) {
    console.error('删除心情记录失败', error)
    throw error
  }
}

// 删除心情某日备注条目（仅云函数校验一级助教）
const deleteMoodNote = async (moodId, entryId) => {
  try {
    await ensureLogin()
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'deleteMoodNote',
        moodId,
        entryId
      }
    })
    if (result.result && result.result.success) {
      return result.result
    }
    throw new Error(result.result?.error || '删除备注失败')
  } catch (error) {
    console.error('删除备注失败', error)
    throw error
  }
}

// ========== UserFavorites 用户关注相关接口 ==========

// 获取用户关注的宝宝列表
const getUserFavorites = async () => {
  try {
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getUserFavorites'
      }
    })
    
    if (result.result && result.result.success) {
      return result.result.favorites || []
    } else {
      throw new Error(result.result?.error || '获取关注列表失败')
    }
  } catch (error) {
    console.error('获取关注列表失败', error)
    throw error
  }
}

// 设置用户关注的宝宝
const setUserFavorite = async (babyId) => {
  try {
    await ensureLogin()
    
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'setUserFavorite',
        babyId
      }
    })
    
    if (result.result && result.result.success) {
      return result.result
    } else {
      throw new Error(result.result?.error || '设置关注失败')
    }
  } catch (error) {
    console.error('设置关注失败', error)
    throw error
  }
}

// 批量关注宝宝（首次可多选）；限并发，失败即中止
const setUserFavorites = async (babyIds) => {
  const ids = Array.from(new Set((babyIds || []).filter(Boolean)))
  const concurrency = 4
  for (let i = 0; i < ids.length; i += concurrency) {
    const batch = ids.slice(i, i + concurrency)
    const settled = await Promise.allSettled(batch.map((id) => setUserFavorite(id)))
    for (let j = 0; j < settled.length; j++) {
      if (settled[j].status === 'rejected') {
        throw settled[j].reason
      }
    }
  }
}

// 提交反馈（写库与邮件逻辑在云函数）
const submitFeedback = async (content, imageFileIds) => {
  await ensureLogin()
  const result = await wx.cloud.callFunction({
    name: 'login',
    data: {
      action: 'submitFeedback',
      content,
      imageFileIds: imageFileIds || []
    }
  })
  if (result.result && result.result.success) {
    return result.result
  }
  throw new Error(result.result?.error || '提交反馈失败')
}

// ========== ActivityLogs 活动日志相关接口 ==========

// 获取家庭活动日志
const getActivityLogs = async (familyId, page = 1, pageSize = 20) => {
  try {
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getActivityLogs',
        familyId,
        page,
        pageSize
      }
    })
    
    if (result.result && result.result.success) {
      return result.result.logs || []
    } else {
      throw new Error(result.result?.error || '获取活动日志失败')
    }
  } catch (error) {
    console.error('获取活动日志失败', error)
    throw error
  }
}

// 获取宝宝相关的活动日志
const getActivityLogsByBaby = async (babyId, page = 1, pageSize = 20) => {
  try {
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'getActivityLogsByBaby',
        babyId,
        page,
        pageSize
      }
    })
    
    if (result.result && result.result.success) {
      return result.result.logs || []
    } else {
      throw new Error(result.result?.error || '获取活动日志失败')
    }
  } catch (error) {
    console.error('获取活动日志失败', error)
    throw error
  }
}

module.exports = {
  invalidateMoodCaches,
  getBabies,
  getBabyById,
  getRecordById,
  addBaby,
  deleteBaby,
  updateBabyAvatar,
  updateBabyName,
  getRecordsByBabyId,
  getLatestRecord,
  getLatestRecordsByBabyIds,
  addRecord,
  deleteRecord,
  getFamily,
  getFamilies,
  getFamilyById,
  createFamily,
  createInviteCode,
  joinFamily,
  leaveFamily,
  dissolveFamily,
  updateMemberInfo,
  updateFamilyName,
  updateMemberPermission,
  removeFamilyMember,
  checkPermission,
  clearCache,
  // Mood相关
  getMoodsByMonth,
  getMoodByDate,
  addMood,
  deleteMood,
  deleteMoodNote,
  // UserFavorites相关
  getUserFavorites,
  setUserFavorite,
  setUserFavorites,
  submitFeedback,
  // ActivityLogs相关
  getActivityLogs,
  getActivityLogsByBaby
}
