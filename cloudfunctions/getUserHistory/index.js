// 云函数：getUserHistory
// 获取用户学习历史记录

const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 云函数入口函数
 * @param {Object} event - 事件参数
 * @param {string} event.openid - 用户openid
 * @param {number} event.page - 页码（从1开始）
 * @param {number} event.pageSize - 每页数量
 * @param {string} event.type - 历史类型（sessions/reports/all）
 * @param {string} event.startDate - 开始日期
 * @param {string} event.endDate - 结束日期
 */
exports.main = async (event, context) => {
  try {
    const { 
      openid, 
      page = 1, 
      pageSize = 10, 
      type = 'all',
      startDate,
      endDate
    } = event
    
    // 参数验证
    if (!openid) {
      return {
        success: false,
        error: '缺少用户openid',
        code: 'MISSING_OPENID'
      }
    }
    
    // 验证页码和页面大小
    const validPage = Math.max(1, parseInt(page))
    const validPageSize = Math.min(50, Math.max(1, parseInt(pageSize)))
    const skip = (validPage - 1) * validPageSize
    
    let result = {}
    
    // 根据类型获取不同的历史数据
    switch (type) {
      case 'sessions':
        result = await getLearningHistory(openid, skip, validPageSize, startDate, endDate)
        break
        
      case 'reports':
        result = await getLearningReportHistory(openid, skip, validPageSize, startDate, endDate)
        break
        
      case 'all':
      default:
        result = await getAllHistory(openid, skip, validPageSize, startDate, endDate)
        break
    }
    
    
    return {
      success: true,
      data: {
        ...result,
        page: validPage,
        pageSize: validPageSize,
        type: type
      }
    }
    
  } catch (error) {
    console.error('getUserHistory 云函数执行失败:', error)
    
    return {
      success: false,
      error: error.message || '服务器内部错误',
      code: 'INTERNAL_ERROR'
    }
  }
}

/**
 * 获取学习会话历史
 * @param {string} openid - 用户openid
 * @param {number} skip - 跳过数量
 * @param {number} limit - 限制数量
 * @param {string} startDate - 开始日期
 * @param {string} endDate - 结束日期
 * @returns {Object} 会话历史数据
 */
async function getLearningHistory(openid, skip, limit, startDate, endDate) {
  // 构建查询条件
  const whereCondition = { openid: openid }
  
  // 添加日期过滤
  if (startDate || endDate) {
    whereCondition.startTime = {}
    if (startDate) {
      whereCondition.startTime[db.command.gte] = startDate
    }
    if (endDate) {
      whereCondition.startTime[db.command.lte] = endDate + 'T23:59:59.999Z'
    }
  }
  
  // 从learning_history获取总数和sessionId列表
  const countResult = await db.collection('learning_sessions')
    .where(whereCondition)
    .count()
    
  const historyResult = await db.collection('learning_history')
    .where(whereCondition)
    .orderBy('startTime', 'desc')
    .skip(skip)
    .limit(limit)
    .field({
      sessions: true  // 获取整个sessions数组
    })
    .get()
  
  // 获取所有sessionId - 修复提取逻辑
  const sessionIds = []
  historyResult.data.forEach(item => {
    if (item.sessions && Array.isArray(item.sessions)) {
      item.sessions.forEach(session => {
        if (session.sessionId) {
          sessionIds.push(session.sessionId)
        }
      })
    }
  })
  
  // 如果没有找到任何sessionId，返回空结果
  if (sessionIds.length === 0) {
    return {
      sessions: [],
      total: countResult.total,
      hasMore: skip + limit < countResult.total
    }
   
  }
  
  // 根据sessionIds从learning_sessions获取详细数据
  const sessionsResult = await db.collection('learning_sessions')
    .where({
      sessionId: db.command.in(sessionIds)
    })
    .field({
      sessionId: true,
      questionText: true,
      status: true,
      startTime: true,
      endTime: true,
      currentRound: true,
      totalRounds: true,
      aiAnalysis: true
    })
    .get()
    
  // 创建sessionId到session数据的映射
  const sessionMap = {}
  sessionsResult.data.forEach(session => {
    sessionMap[session.sessionId] = session
  })
  
  // 按照中sessionIds的顺序处理数据
  const sessions = sessionIds.map(sessionId => {
    const session = sessionMap[sessionId]
    if (!session) return null
    
    return {
      id: session._id,
      sessionId: session.sessionId,
      questionText: session.questionText,
      status: session.status,
      startTime: session.startTime,
      endTime: session.endTime,
      progress: {
        current: session.currentRound || 1,
        total: session.totalRounds || 3
      },
      difficulty: session.aiAnalysis?.difficulty || 3,
      gradeLevel: session.aiAnalysis?.gradeLevel || '未知',
      type: 'session'
    }
  }).filter(Boolean) // 过滤掉null值
  
  return {
    sessions: sessions,
    total: countResult.total,
    hasMore: skip + limit < countResult.total
  }
}

/**
 * 获取学习报告历史
 * @param {string} openid - 用户openid
 * @param {number} skip - 跳过数量
 * @param {number} limit - 限制数量
 * @param {string} startDate - 开始日期
 * @param {string} endDate - 结束日期
 * @returns {Object} 报告历史数据
 */
async function getLearningReportHistory(openid, skip, limit, startDate, endDate) {
  // 构建查询条件
  const whereCondition = { openid: openid }
  
  // 添加日期过滤
  if (startDate || endDate) {
    whereCondition.timestamp = {}
    if (startDate) {
      whereCondition.timestamp[db.command.gte] = startDate
    }
    if (endDate) {
      whereCondition.timestamp[db.command.lte] = endDate + 'T23:59:59.999Z'
    }
  }
  
  // 获取总数
  const countResult = await db.collection('learning_reports')
    .where(whereCondition)
    .count()
  
  // 获取分页数据
  const listResult = await db.collection('learning_reports')
    .where(whereCondition)
    .orderBy('timestamp', 'desc')
    .skip(skip)
    .limit(limit)
    .field({
      sessionId: true,
      timestamp: true,
      'reportData.questionText': true,
      'reportData.performance.score': true,
      'reportData.performance.level': true,
      'reportData.startTime': true,
      'reportData.endTime': true,
      'reportData.completedRounds': true,
      'reportData.totalRounds': true
    })
    .get()
  
  // 处理数据
  const reports = listResult.data.map(report => ({
    id: report._id,
    sessionId: report.sessionId,
    questionText: report.reportData?.questionText || '未知题目',
    score: report.reportData?.performance?.score || 0,
    level: report.reportData?.performance?.level || '未评级',
    startTime: report.reportData?.startTime,
    endTime: report.reportData?.endTime,
    timestamp: report.timestamp,
    progress: {
      current: report.reportData?.completedRounds || 0,
      total: report.reportData?.totalRounds || 3
    },
    type: 'report'
  }))
  
  return {
    reports: reports,
    total: countResult.total,
    hasMore: skip + limit < countResult.total
  }
}

/**
 * 获取所有历史（会话和报告混合）
 * @param {string} openid - 用户openid
 * @param {number} skip - 跳过数量
 * @param {number} limit - 限制数量
 * @param {string} startDate - 开始日期
 * @param {string} endDate - 结束日期
 * @returns {Object} 混合历史数据
 */
async function getAllHistory(openid, skip, limit, startDate, endDate) {
  // 分别获取会话和报告数据
  const [sessionsResult, reportsResult] = await Promise.all([
    getLearningSessionHistory(openid, 0, 100, startDate, endDate), // 获取更多数据用于混合排序
    getLearningReportHistory(openid, 0, 100, startDate, endDate)
  ])
  
  // 合并数据并按时间排序
  const allItems = []
  
  // 添加会话数据
  sessionsResult.sessions.forEach(session => {
    allItems.push({
      ...session,
      sortTime: session.startTime,
      type: 'session'
    })
  })
  
  // 添加报告数据
  reportsResult.reports.forEach(report => {
    allItems.push({
      ...report,
      sortTime: report.timestamp,
      type: 'report'
    })
  })
  
  // 按时间倒序排序
  allItems.sort((a, b) => new Date(b.sortTime) - new Date(a.sortTime))
  
  // 分页处理
  const paginatedItems = allItems.slice(skip, skip + limit)
  
  // 分离会话和报告
  const sessions = paginatedItems.filter(item => item.type === 'session')
  const reports = paginatedItems.filter(item => item.type === 'report')
  
  return {
    sessions: sessions,
    reports: reports,
    allItems: paginatedItems,
    total: allItems.length,
    hasMore: skip + limit < allItems.length,
    
    // 统计信息
    stats: {
      totalSessions: sessionsResult.total,
      totalReports: reportsResult.total,
      completedSessions: sessionsResult.sessions.filter(s => s.status === 'completed').length,
      avgScore: reportsResult.reports.length > 0 ? 
        Math.round(reportsResult.reports.reduce((sum, r) => sum + r.score, 0) / reportsResult.reports.length) : 0
    }
  }
}