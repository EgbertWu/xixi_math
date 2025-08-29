// 云函数：login
// 获取用户openid，用于用户身份识别

const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

/**
 * 云函数入口函数
 * 获取用户的openid等微信身份信息
 * @param {Object} event - 事件参数
 * @param {Object} context - 上下文
 * @returns {Object} 包含openid等用户身份信息
 */
exports.main = async (event, context) => {
  try {
    // 获取微信调用上下文
    const wxContext = cloud.getWXContext()
    
    // 返回用户身份信息
    return {
      success: true,
      openid: wxContext.OPENID,
      appid: wxContext.APPID,
      unionid: wxContext.UNIONID,
      timestamp: new Date().toISOString()
    }
    
  } catch (error) {
    console.error('获取用户openid失败:', error)
    
    return {
      success: false,
      error: error.message,
      timestamp: new Date().toISOString()
    }
  }
}