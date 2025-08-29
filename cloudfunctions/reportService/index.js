// 云函数：reportService
// 生成用户综合学习报告
// 修改原因：删除单个会话报告逻辑，只保留用户综合报告功能

const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 云函数入口函数
 * 修改原因：删除generate和get action，只保留generateUserReport功能
 * @param {Object} event - 事件参数
 * @param {string} event.action - 操作类型（只支持generateUserReport）
 * @param {Object} event.data - 请求数据
 * @param {string} event.data.openid - 用户openid
 * @param {string} event.data.timestamp - 时间戳（可选）
 */
exports.main = async (event, context) => {
  console.log('reportService 云函数开始执行', event)
  
  try {
    const { action, data } = event
    
    // 参数验证 - 修改原因：简化参数结构，只支持综合报告生成
    if (!action || !data || !data.openid) {
      return createErrorResponse('缺少必要参数', 'MISSING_PARAMS')
    }
    
    // 只支持生成用户综合报告
    if (action === 'generateUserReport') {
      return await generateUserReport(data.openid, data.timestamp)
    } else {
      return createErrorResponse('无效的操作类型，只支持generateUserReport', 'INVALID_ACTION')
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

/**
 * 生成用户综合学习报告
 * 修改原因：新增功能，根据用户的learning_history生成综合解题报告
 * @param {string} openid - 用户openid
 * @param {string} timestamp - 时间戳
 * @returns {Object} 生成结果
 */
async function generateUserReport(openid, timestamp) {
  console.log('生成用户综合学习报告...', openid)
  
  try {
    // 查询用户的学习历史数据
    const historyResult = await db.collection('learning_history')
      .where({ openid: openid })
      .get()
    
    if (historyResult.data.length === 0) {
      return createErrorResponse('未找到学习历史数据', 'NO_HISTORY_DATA')
    }
    
    const historyData = historyResult.data[0]
    const sessions = historyData.sessions || []
    
    if (sessions.length === 0) {
      return createErrorResponse('暂无学习记录', 'NO_SESSIONS')
    }
    
    // 生成综合报告数据
    const reportData = await generateUserReportData(sessions, openid)
    
    // 保存报告到数据库
    const reportDoc = {
      openid: openid,
      reportType: 'user_comprehensive',
      reportData: reportData,
      timestamp: timestamp || new Date().toISOString(),
      createdAt: new Date()
    }
    
    const saveResult = await db.collection('learning_reports').add({
      data: reportDoc
    })
    
    // 记录用户行为
    await recordUserBehavior(openid, 'user_report_generated', {
      reportId: saveResult._id,
      sessionsAnalyzed: sessions.length,
      reportType: 'comprehensive'
    })
    
    console.log('用户综合学习报告生成成功')
    
    return {
      success: true,
      data: {
        reportId: saveResult._id,
        reportData: reportData
      }
    }
    
  } catch (error) {
    console.error('生成用户综合学习报告失败:', error)
    throw error
  }
}

/**
 * 生成用户综合报告数据
 * 修改原因：新增功能，分析用户所有学习会话，生成综合统计和建议
 * @param {Array} sessions - 用户的所有学习会话
 * @param {string} openid - 用户openid
 * @returns {Object} 报告数据
 */
async function generateUserReportData(sessions, openid) {
  console.log('分析用户学习数据...', { sessionsCount: sessions.length })
  
  // 过滤出已完成的会话
  const completedSessions = sessions.filter(session => 
    session.status === 'completed' || session.isComplete === true
  )
  
  // 计算解题时间统计
  const timeStats = calculateTimeStats(sessions)
  
  // 找出思考最久的问题（轮数最多）
  const longestThinkingSession = findLongestThinkingSession(sessions)
  
  // 分析知识薄弱点
  const weaknessAnalysis = analyzeWeaknesses(sessions)
  
  // 生成学习建议
  const suggestions = generateLearningSuggestions(sessions, weaknessAnalysis)
  
  // 计算近期学习趋势（最近7天）
  const recentTrend = calculateRecentTrend(sessions)
  
  const reportData = {
    // 基本统计
    summary: {
      totalSessions: sessions.length,
      completedSessions: completedSessions.length,
      completionRate: sessions.length > 0 ? Math.round((completedSessions.length / sessions.length) * 100) : 0,
      totalLearningTime: timeStats.totalTime,
      averageSessionTime: timeStats.averageTime
    },
    
    // 解题时间分析
    timeAnalysis: {
      totalMinutes: timeStats.totalTime,
      averageMinutes: timeStats.averageTime,
      longestSession: timeStats.longestSession,
      shortestSession: timeStats.shortestSession,
      recentTrend: recentTrend
    },
    
    // 思考最久的问题
    longestThinking: longestThinkingSession,
    
    // 知识薄弱点分析
    weaknessAnalysis: weaknessAnalysis,
    
    // 学习建议
    suggestions: suggestions,
    
    // 生成时间
    generateTime: new Date().toLocaleString('zh-CN'),
    
    // 报告类型
    reportType: 'comprehensive'
  }
  
  console.log('用户学习数据分析完成', reportData.summary)
  return reportData
}

/**
 * 计算时间统计
 * 修改原因：新增辅助函数，计算用户学习时间相关统计
 * @param {Array} sessions - 学习会话数组
 * @returns {Object} 时间统计数据
 */
function calculateTimeStats(sessions) {
  let totalTime = 0
  let validSessions = 0
  let longestTime = 0
  let shortestTime = Infinity
  let longestSession = null
  let shortestSession = null
  
  sessions.forEach(session => {
    if (session.messages && session.messages.length > 0) {
      // 计算会话时长（从第一条消息到最后一条消息）
      const firstMessage = session.messages[0]
      const lastMessage = session.messages[session.messages.length - 1]
      
      if (firstMessage.timestamp && lastMessage.timestamp) {
        const startTime = new Date(firstMessage.timestamp)
        const endTime = new Date(lastMessage.timestamp)
        const duration = Math.max(1, Math.round((endTime - startTime) / (1000 * 60))) // 至少1分钟
        
        totalTime += duration
        validSessions++
        
        if (duration > longestTime) {
          longestTime = duration
          longestSession = {
            sessionId: session.sessionId,
            questionText: session.questionText || '数学题目',
            duration: duration,
            rounds: session.currentRound || session.messages.length
          }
        }
        
        if (duration < shortestTime) {
          shortestTime = duration
          shortestSession = {
            sessionId: session.sessionId,
            questionText: session.questionText || '数学题目',
            duration: duration,
            rounds: session.currentRound || session.messages.length
          }
        }
      }
    }
  })
  
  return {
    totalTime: totalTime,
    averageTime: validSessions > 0 ? Math.round(totalTime / validSessions) : 0,
    longestSession: longestSession,
    shortestSession: shortestTime === Infinity ? null : shortestSession
  }
}

/**
 * 找出思考最久的问题（轮数最多）
 * 修改原因：新增辅助函数，找出用户思考时间最长的问题
 * @param {Array} sessions - 学习会话数组
 * @returns {Object} 思考最久的会话信息
 */
function findLongestThinkingSession(sessions) {
  let maxRounds = 0
  let longestSession = null
  
  sessions.forEach(session => {
    const rounds = session.currentRound || (session.messages ? session.messages.length : 0)
    
    if (rounds > maxRounds) {
      maxRounds = rounds
      longestSession = {
        sessionId: session.sessionId,
        questionText: session.questionText || '数学题目',
        rounds: rounds,
        status: session.status || (session.isComplete ? 'completed' : 'active'),
        timestamp: session.timestamp || session.createTime
      }
    }
  })
  
  return longestSession
}

/**
 * 分析知识薄弱点
 * 修改原因：新增辅助函数，基于用户的学习记录分析薄弱知识点
 * @param {Array} sessions - 学习会话数组
 * @returns {Object} 薄弱点分析结果
 */
function analyzeWeaknesses(sessions) {
  const completedSessions = sessions.filter(session => 
    session.status === 'completed' || session.isComplete === true
  )
  
  const incompleteSessions = sessions.filter(session => 
    session.status !== 'completed' && session.isComplete !== true
  )
  
  // 分析高轮数会话（可能表示理解困难）
  const highRoundSessions = sessions.filter(session => {
    const rounds = session.currentRound || (session.messages ? session.messages.length : 0)
    return rounds >= 5
  })
  
  return {
    incompleteRate: sessions.length > 0 ? Math.round((incompleteSessions.length / sessions.length) * 100) : 0,
    highDifficultyCount: highRoundSessions.length,
    commonIssues: [
      incompleteSessions.length > completedSessions.length ? '题目完成率较低' : null,
      highRoundSessions.length > sessions.length * 0.3 ? '部分题目需要较多轮次才能理解' : null
    ].filter(Boolean)
  }
}

/**
 * 生成学习建议
 * 修改原因：新增辅助函数，基于分析结果生成个性化学习建议
 * @param {Array} sessions - 学习会话数组
 * @param {Object} weaknessAnalysis - 薄弱点分析结果
 * @returns {Array} 学习建议数组
 */
function generateLearningSuggestions(sessions, weaknessAnalysis) {
  const suggestions = []
  
  // 基于完成率给出建议
  if (weaknessAnalysis.incompleteRate > 50) {
    suggestions.push('建议在解题时更加耐心，遇到困难可以尝试分步骤思考，不要急于放弃。')
  }
  
  // 基于高难度题目数量给出建议
  if (weaknessAnalysis.highDifficultyCount > sessions.length * 0.3) {
    suggestions.push('发现你在一些题目上需要较多思考时间，建议加强基础知识的复习和练习。')
  }
  
  // 基于学习频率给出建议
  const recentSessions = sessions.filter(session => {
    const sessionTime = new Date(session.timestamp || session.createTime)
    const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
    return sessionTime > weekAgo
  })
  
  if (recentSessions.length < 3) {
    suggestions.push('建议保持规律的学习习惯，每周至少练习3-4次，这样有助于知识的巩固。')
  }
  
  // 基于总体表现给出鼓励
  const completedSessions = sessions.filter(session => 
    session.status === 'completed' || session.isComplete === true
  )
  
  if (completedSessions.length > 0) {
    suggestions.push(`你已经完成了${completedSessions.length}道题目，继续保持这种学习热情！`)
  }
  
  // 如果没有特别的建议，给出通用建议
  if (suggestions.length === 0) {
    suggestions.push('继续保持良好的学习状态，建议多做练习来巩固所学知识。')
  }
  
  return suggestions
}

/**
 * 计算近期学习趋势
 * 修改原因：新增辅助函数，分析用户最近的学习趋势
 * @param {Array} sessions - 学习会话数组
 * @returns {Object} 学习趋势数据
 */
function calculateRecentTrend(sessions) {
  const now = new Date()
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)
  
  const recentWeek = sessions.filter(session => {
    const sessionTime = new Date(session.timestamp || session.createTime)
    return sessionTime > weekAgo
  })
  
  const previousWeek = sessions.filter(session => {
    const sessionTime = new Date(session.timestamp || session.createTime)
    return sessionTime > twoWeeksAgo && sessionTime <= weekAgo
  })
  
  const trend = recentWeek.length - previousWeek.length
  let trendText = '保持稳定'
  
  if (trend > 0) {
    trendText = '学习频率上升'
  } else if (trend < 0) {
    trendText = '学习频率下降'
  }
  
  return {
    recentWeekCount: recentWeek.length,
    previousWeekCount: previousWeek.length,
    trend: trendText,
    trendValue: trend
  }
}

/**
 * 生成单个会话报告数据
 * 修改原因：补充缺失的函数，用于生成单个会话的报告数据
 * @param {Object} sessionData - 会话数据
 * @returns {Object} 报告数据
 */
async function generateReportData(sessionData) {
  console.log('生成单个会话报告数据...', sessionData.sessionId)
  
  const messages = sessionData.messages || []
  const startTime = sessionData.startTime || (messages[0] ? messages[0].timestamp : new Date().toISOString())
  const endTime = sessionData.endTime || (messages[messages.length - 1] ? messages[messages.length - 1].timestamp : new Date().toISOString())
  
  // 计算学习时长
  const duration = Math.max(1, Math.round((new Date(endTime) - new Date(startTime)) / (1000 * 60)))
  
  // 分析对话轮次
  const totalRounds = sessionData.currentRound || messages.length
  
  // 计算完成状态
  const isCompleted = sessionData.status === 'completed' || sessionData.isComplete === true
  
  return {
    sessionId: sessionData.sessionId,
    questionText: sessionData.questionText || '数学题目',
    startTime: startTime,
    endTime: endTime,
    duration: duration,
    totalRounds: totalRounds,
    isCompleted: isCompleted,
    performance: {
      score: isCompleted ? 100 : Math.max(0, 100 - (totalRounds - 1) * 10),
      level: totalRounds <= 2 ? '优秀' : totalRounds <= 4 ? '良好' : '需要改进'
    },
    generateTime: new Date().toLocaleString('zh-CN')
  }
}

// 删除以下函数：
// - generateReport 函数
// - getReport 函数  
// - generateReportData 函数