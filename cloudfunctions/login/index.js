// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 云函数入口函数
exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { code, action, babyId } = event
  
  try {
    // 处理删除宝宝的操作
    if (action === 'deleteBaby' && babyId) {
      // 使用事务确保原子性操作
      const result = await db.runTransaction(async transaction => {
        // 验证宝宝是否存在且属于当前用户
        const baby = await transaction.collection('babies').doc(babyId).get()
        if (!baby.data || baby.data.openid !== wxContext.OPENID) {
          throw new Error('无权限删除此宝宝信息')
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
