// 云函数：getReportData
// 获取学习报告数据

const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 云函数入口函数
 * @param {Object} event - 事件参数
 * @param {string} event.sessionId - 会话ID
 * @param {string} event.userId - 用户ID
 */
exports.main = async (event, context) => {
  console.log('getReportData 云函数开始执行', event)
  
  try {
    const { sessionId, userId } = event
    
    // 参数验证
    if (!sessionId || !userId) {
      return {
        success: false,
        error: '缺少必要参数',
        code: 'MISSING_PARAMS'
      }
    }
    
    // 查询报告数据
    const reportResult = await db.collection('learning_reports')
      .where({
        sessionId: sessionId,
        userId: userId
      })
      .get()
    
    if (reportResult.data.length === 0) {
      // 如果没有找到报告，尝试查找会话数据并生成简单报告
      const sessionResult = await db.collection('learning_sessions')
        .where({
          sessionId: sessionId,
          userId: userId
        })
        .get()
      
      if (sessionResult.data.length === 0) {
        return {
          success: false,
          error: '未找到相关学习数据',
          code: 'DATA_NOT_FOUND'
        }
      }
      
      // 返回会话数据，前端可以使用它来显示基本信息
      return {
        success: true,
        data: {
          sessionData: sessionResult.data[0],
          reportData: null
        },
        message: '未找到报告数据，但返回了会话数据'
      }
    }
    
    // 返回报告数据
    return {
      success: true,
      data: reportResult.data[0]
    }
    
  } catch (error) {
    console.error('getReportData 云函数执行失败:', error)
    
    return {
      success: false,
      error: error.message || '服务器内部错误',
      code: 'INTERNAL_ERROR'
    }
  }
}