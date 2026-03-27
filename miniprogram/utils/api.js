const { calculateAge, formatAgeString } = require('./util.js')
const db = wx.cloud.database()
const _ = db.command

// 获取当前用户信息
const getCurrentUser = () => {
  const app = getApp()
  return app.globalData.userInfo || {
    openid: wx.getStorageSync('openid')
  }
}

// 等待登录完成
const waitForLogin = () => {
  return new Promise((resolve, reject) => {
    const app = getApp()
    const startTime = Date.now()
    const maxWaitTime = 5000 // 最大等待时间5秒
    
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

// 获取用户的宝宝列表
const getBabies = async () => {
  try {
    let user = getCurrentUser()
    if (!user || !user.openid) {
      try {
        // 等待登录完成
        user = await waitForLogin()
      } catch (loginError) {
        console.error('登录失败', loginError)
        return []
      }
    }
    
    const result = await db.collection('babies').where({ openid: user.openid }).get()
    
    return result.data || []
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
    
    const result = await db.collection('babies').doc(id).get()
    // 验证宝宝是否属于当前用户
    if (result.data && result.data.openid !== user.openid) {
      return null
    }
    return result.data
  } catch (error) {
    console.error('获取宝宝信息失败', error)
    return null
  }
}

// 添加宝宝
const addBaby = async (babyInfo) => {
  try {
    let user = getCurrentUser()
    if (!user || !user.openid) {
      // 等待登录完成
      user = await waitForLogin()
    }
    
    // 检查宝宝数量限制
    const babies = await getBabies()
    if (babies.length >= 4) {
      throw new Error('最多只能添加4个宝宝')
    }
    
    const newBaby = {
      ...babyInfo,
      openid: user.openid,
      createTime: new Date()
    }
    
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
    
    return newBaby
  } catch (error) {
    console.error('添加宝宝失败', error)
    throw error
  }
}

// 删除宝宝
const deleteBaby = async (id) => {
  try {
    // 获取当前用户信息
    let user = getCurrentUser()
    if (!user || !user.openid) {
      // 等待登录完成
      user = await waitForLogin()
    }
    
    // 验证宝宝是否存在且属于当前用户
    const baby = await db.collection('babies').doc(id).get()
    if (!baby.data || baby.data.openid !== user.openid) {
      throw new Error('无权限删除此宝宝信息')
    }
    
    // 使用云函数确保事务性
    const result = await wx.cloud.callFunction({
      name: 'login',
      data: {
        action: 'deleteBaby',
        babyId: id
      }
    })
    
    if (result.result && result.result.success) {
      return result.result
    } else {
      throw new Error('删除失败')
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
    const result = await db.collection('records').where({
      babyId: babyId
    }).orderBy('recordDate', 'desc').get()
    
    return result.data || []
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
    const baby = await getBabyById(recordInfo.babyId)
    if (!baby) {
      throw new Error('宝宝不存在')
    }
    
    let ageInMonths = 0
    if (!isBirth) {
      const ageObj = calculateAge(baby.birthDate, recordInfo.recordDate)
      ageInMonths = ageObj.years * 12 + ageObj.months + (ageObj.days >= 15 ? 0.5 : 0)
    }
    
    const newRecord = {
      ...recordInfo,
      ageInMonths,
      createTime: new Date()
    }
    
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
    await db.collection('records').doc(id).remove()
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
    
    // 验证宝宝是否存在且属于当前用户
    const baby = await db.collection('babies').doc(id).get()
    if (!baby.data || baby.data.openid !== user.openid) {
      throw new Error('无权限更新此宝宝信息')
    }
    
    await db.collection('babies').doc(id).update({
      data: {
        avatarUrl: avatarUrl
      }
    })
  } catch (error) {
    console.error('更新头像失败', error)
    throw error
  }
}

module.exports = {
  getBabies,
  getBabyById,
  addBaby,
  deleteBaby,
  updateBabyAvatar,
  getRecordsByBabyId,
  getLatestRecord,
  addRecord,
  deleteRecord
}
