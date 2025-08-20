// 云函数：reportService
// 生成和获取学习报告

const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 云函数入口函数
 * @param {Object} event - 事件参数
 * @param {string} event.action - 操作类型（generate/get）
 * @param {string} event.sessionId - 会话ID
 * @param {string} event.openid - 用户openid
 * @param {string} event.timestamp - 时间戳（可选）
 */
exports.main = async (event, context) => {
  console.log('reportService 云函数开始执行', event)
  
  try {
    const { action, sessionId, openid, timestamp } = event
    
    // 参数验证
    if (!action || !sessionId || !openid) {
      return createErrorResponse('缺少必要参数', 'MISSING_PARAMS')
    }
    
    // 根据操作类型执行不同逻辑
    if (action === 'generate') {
      return await generateReport(sessionId, openid, timestamp)
    } else if (action === 'get') {
      return await getReport(sessionId, openid)
    } else {
      return createErrorResponse('无效的操作类型', 'INVALID_ACTION')
    }
    
  } catch (error) {
    console.error('reportService 云函数执行失败:', error)
    return createErrorResponse(error.message || '服务器内部错误', 'INTERNAL_ERROR')
  }
}

/**
 * 生成学习报告
 * @param {string} sessionId - 会话ID
 * @param {string} openid - 用户openid
 * @param {string} timestamp - 时间戳
 * @returns {Object} 生成结果
 */
async function generateReport(sessionId, openid, timestamp) {
  console.log('生成学习报告...')
  
  try {
    // 查询会话数据
    const sessionResult = await db.collection('learning_sessions')
      .where({
        sessionId: sessionId,
        openid: openid
      })
      .get()
    
    if (sessionResult.data.length === 0) {
      return createErrorResponse('会话不存在', 'SESSION_NOT_FOUND')
    }
    
    const sessionData = sessionResult.data[0]
    
    // 生成报告数据
    const reportData = await generateReportData(sessionData)
    
    // 保存报告到数据库
    const reportDoc = {
      sessionId: sessionId,
      openid: openid,
      reportData: reportData,
      timestamp: timestamp || new Date().toISOString(),
      createdAt: new Date()
    }
    
    const saveResult = await db.collection('learning_reports').add({
      data: reportDoc
    })
    
    // 记录用户行为
    await recordUserBehavior(openid, 'report_generated', {
      sessionId: sessionId,
      reportId: saveResult._id,
      score: reportData.performance?.score || 0
    })
    
    console.log('学习报告生成成功')
    
    return {
      success: true,
      data: {
        reportId: saveResult._id,
        reportData: reportData
      }
    }
    
  } catch (error) {
    console.error('生成学习报告失败:', error)
    throw error
  }
}

/**
 * 获取学习报告
 * @param {string} sessionId - 会话ID
 * @param {string} openid - 用户openid
 * @returns {Object} 获取结果
 */
async function getReport(sessionId, openid) {
  console.log('获取报告数据...')
  
  try {
    // 查询报告数据
    const reportResult = await db.collection('learning_reports')
      .where({
        sessionId: sessionId,
        openid: openid
      })
      .get()
    
    if (reportResult.data.length === 0) {
      // 如果没有找到报告，尝试查找会话数据并返回基本信息
      const sessionResult = await db.collection('learning_sessions')
        .where({
          sessionId: sessionId,
          openid: openid
        })
        .get()
      
      if (sessionResult.data.length === 0) {
        return createErrorResponse('未找到相关学习数据', 'DATA_NOT_FOUND')
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
    console.error('获取报告失败:', error)
    throw error
  }
}

/**
 * 记录用户行为
 * @param {string} openid - 用户openid
 * @param {string} action - 行为类型
 * @param {Object} data - 行为数据
 */
async function recordUserBehavior(openid, action, data) {
  try {
    await db.collection('user_behaviors').add({
      data: {
        openid: openid,
        action: action,
        data: data,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('记录用户行为失败:', error)
    // 不影响主流程
  }
}

/**
 * 创建错误响应
 * @param {string} message - 错误消息
 * @param {string} code - 错误代码
 * @returns {Object} 错误响应
 */
function createErrorResponse(message, code) {
  return {
    success: false,
    error: message,
    code: code
  }
}