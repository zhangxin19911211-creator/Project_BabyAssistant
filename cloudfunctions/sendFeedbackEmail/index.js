// 云函数入口文件
const cloud = require('wx-server-sdk')

cloud.init({  env: cloud.DYNAMIC_CURRENT_ENV })

// 云函数入口函数
exports.main = async (event, context) => {
  try {
    // 从触发器事件中获取反馈数据
    const { data } = event
    
    console.log('收到反馈数据:', data)
    
    // 简单返回成功，暂时不发送邮件
    return { success: true, message: '反馈已收到' }
  } catch (error) {
    console.error('处理反馈失败:', error)
    return { success: false, message: '处理反馈失败', error: error.message }
  }
}
