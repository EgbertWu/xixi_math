// 云函数：dataService
// 统一的数据服务 - 合并了 recordBehavior 和 syncUserData 的功能
// 优化原因：统一数据操作，减少云函数数量，提高代码复用性

const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 云函数入口函数
 * @param {Object} event - 事件参数
 * @param {string} event.action - 操作类型：'recordBehavior' 记录行为 | 'syncUserData' 同步用户数据 | 'updateSessionProgress' 更新会话进度 | 'saveLearningHistory' 保存学习历史
 * @param {Object} event.data - 操作数据
 * @param {string} event.openid - 用户ID（用于学习历史相关操作）
 * @param {Object} event.historyData - 历史数据（用于保存学习历史）
 */
exports.main = async (event, context) => {
  
  try {
    const { action, data, openid, historyData } = event
    
    // 参数验证
    if (!action) {
      return createErrorResponse('缺少操作类型', 'MISSING_ACTION')
    }
    
    // 根据操作类型分发处理
    switch (action) {
      case 'recordBehavior':
        return await recordBehavior(data)
      case 'syncUserData':
        return await syncUserData(data)
      case 'updateSessionProgress':
        return await updateSessionProgress(data)
      case 'saveLearningHistory':
        // 新增：处理保存学习历史的请求
        return await addLearningHistory({
          openid: openid,
          sessionInfo: historyData
        })
      case 'getLearningHistory':
        // 新增：获取学习历史
        return await getLearningHistory(data)
      case 'getRecentLearningHistory':
        // 新增：获取最近学习历史
        return await getRecentLearningHistory(data)
      default:
        return createErrorResponse('无效的操作类型', 'INVALID_ACTION')
    }
    
  } catch (error) {
    console.error('dataService 云函数执行失败:', error)
    return createErrorResponse(error.message || '服务器内部错误', 'INTERNAL_ERROR')
  }
}

/**
 * 记录用户行为数据
 * @param {Object} behaviorData - 行为数据
 * @param {string} behaviorData.action - 行为类型
 * @param {Object} behaviorData.data - 行为数据
 * @param {string} behaviorData.page - 页面路径
 * @param {string} behaviorData.timestamp - 时间戳
 * @returns {Object} 记录结果
 */
async function recordBehavior(behaviorData) {
  
  try {
    const { action, data, page, timestamp } = behaviorData
    
    // 获取微信用户信息
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    // 参数验证
    if (!openid || !action) {
      return createErrorResponse('缺少必要参数', 'MISSING_PARAMS')
    }
    
    // 构建行为记录
    const behaviorRecord = {
      openid: openid,  // 使用openid替代openid
      action: action,
      data: data || {},
      page: page || '',
      timestamp: timestamp || new Date().toISOString(),
      platform: 'miniprogram',
      
      // 微信环境信息
      wxInfo: {
        openid: openid,
        appid: wxContext.APPID,
        unionid: wxContext.UNIONID
      },
      
      // 会话信息
      sessionInfo: {
        source: wxContext.SOURCE,
        env: wxContext.ENV
      }
    }
    
    // 保存到数据库
    const result = await db.collection('user_behaviors').add({
      data: behaviorRecord
    })
    
    
    // 异步处理行为分析（不影响主流程）
    processBehaviorAnalysis(behaviorRecord).catch(error => {
      console.error('行为分析处理失败:', error)
    })
    
    return {
      success: true,
      recordId: result._id
    }
    
  } catch (error) {
    console.error('记录用户行为失败:', error)
    throw error
  }
}

/**
 * 同步用户数据到云端数据库
 * 修改原因：优化用户数据同步逻辑，先检查用户是否存在，再决定新增或更新
 * @param {Object} userData - 用户数据
 * @param {Object} userData.userInfo - 用户基本信息
 * @param {Object} userData.learningStats - 学习统计数据
 * @param {Object} userData.settings - 用户设置
 * @param {string} userData.timestamp - 时间戳
 * @returns {Object} 同步结果
 */
async function syncUserData(userData) {
  
  try {
    const { userProfile, learningStats, settings, timestamp } = userData
    
    // 获取微信用户信息
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    // 参数验证
    if (!openid) {
      return createErrorResponse('无法获取用户标识', 'MISSING_OPENID')
    }
    
    // 构建用户数据
    const updateData = {
      openid: openid,
      lastSyncTime: timestamp || new Date().toISOString(),
      platform: 'miniprogram'
    }
    
    // 添加用户信息
    // 在第165行附近，修复变量名
    if (userProfile) {
      updateData.userInfo = {
        ...userProfile,
        updateTime: new Date().toISOString()
      }
    }
    
    // 添加学习统计
    if (learningStats) {
      updateData.learningStats = {
        ...learningStats,
        updateTime: new Date().toISOString()
      }
    }
    
    // 添加用户设置
    if (settings) {
      updateData.settings = {
        ...settings,
        updateTime: new Date().toISOString()
      }
    }
    
    // 先检查用户是否存在
    try {
      // 尝试获取现有用户数据
      const existingUser = await db.collection('users').doc(openid).get()
      
      await db.collection('users').doc(openid).update({
        data: updateData
      })
      
      
      // 重新获取更新后的完整用户数据
      const updatedUser = await db.collection('users').doc(openid).get()
      
      return {
        success: true,
        data: updatedUser.data,
        action: 'updated'
      }
      
    } catch (getError) {
      // 用户不存在（errCode: -1），创建新用户
      if (getError.errCode === -1) {
        
        // 验证是否有从前端传入的用户信息
        if (!userProfile || (!userProfile.nickName && !userProfile.nickname)) {
          return createErrorResponse('创建新用户需要提供微信用户信息', 'MISSING_USER_INFO')
        }
        
        // 创建新用户数据对象
        const newUserData = {
          openid: openid,
          lastSyncTime: new Date().toISOString(),
          platform: 'miniprogram',
          
          // 使用从前端传入的真实微信用户信息
          userInfo: {
            nickname: userProfile.nickName || userProfile.nickname || '微信用户',
            avatar: userProfile.avatarUrl || userProfile.avatar || '',
            gender: userProfile.gender || 0,
            country: userProfile.country || '',
            province: userProfile.province || '',
            city: userProfile.city || '',
            language: userProfile.language || 'zh_CN',
            level: 1,
            experience: 0,
            updateTime: new Date().toISOString()
          },
          
          // 初始化学习统计
          learningStats: learningStats || {
            totalQuestions: 0,
            completedSessions: 0,
            totalLearningTime: 0,
            averageScore: 0,
            bestScore: 0,
            currentStreak: 0,
            longestStreak: 0,
            updateTime: new Date().toISOString()
          },
          
          // 初始化设置
          settings: settings || {
            notifications: true,
            soundEffects: true,
            autoSave: true,
            dataSync: true,
            updateTime: new Date().toISOString()
          },
          
          // 初始化成就
          achievements: {
            unlocked: [],
            progress: {},
            updateTime: new Date().toISOString()
          },
          
          // 微信环境信息
          wxInfo: {
            openid: openid,
            appid: wxContext.APPID,
            unionid: wxContext.UNIONID || null
          }
        }
        
        await db.collection('users').doc(openid).set({
          data: newUserData
        })
        
        return {
          success: true,
          data: newUserData,
          action: 'created'
        }
        
      } else {
        // 其他错误，重新抛出
        console.error('获取用户数据时发生未知错误:', getError)
        throw getError
      }
    }
    
    } catch (error) {
      console.error('同步用户数据失败:', error)
      return createErrorResponse(error.message || '同步用户数据失败', 'SYNC_ERROR')
    }
}

/**
 * 更新会话进度（新增功能，解决之前 learning.js 中的问题）
 * @param {Object} progressData - 进度数据
 * @param {string} progressData.sessionId - 会话ID
 * @param {string} progressData.openid - 用户ID
 * @param {Array} progressData.dialogue - 对话数据
 * @param {number} progressData.currentRound - 当前轮次
 * @returns {Object} 更新结果
 */
async function updateSessionProgress(progressData) {
  
  try {
    const { 
      sessionId, 
      dialogue, 
      currentRound, 
      status,
      updateTime,
      lastAnswerCheck,
      endTime,
      completionReason
    } = progressData
    
    // 获取微信用户信息
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    
    // 参数验证
    if (!sessionId || !openid) {
      return createErrorResponse('缺少必要参数', 'MISSING_PARAMS')
    }
    
    // 构建更新数据
    const updateData = {
      dialogue: dialogue,
      currentRound: currentRound,
      updateTime: updateTime || new Date().toISOString()
    }
    
    // 添加可选字段
    // 在 updateSessionProgress 函数中添加状态验证
    function validateStatus(status) {
      const validStatuses = ['active', 'completed', 'abandoned']
      return validStatuses.includes(status)
    }
    
    // 在更新前验证
    if (status && !validateStatus(status)) {
      updateData.status = 'active'
    } else if (status) {
      updateData.status = status
    }
    if (lastAnswerCheck) updateData.lastAnswerCheck = lastAnswerCheck
    if (endTime) {
      updateData.endTime = endTime
    }
    if (completionReason) {
      updateData.completionReason = completionReason
    }
    
    // 更新会话数据
    const updateResult = await db.collection('learning_sessions')
      .where({
        sessionId: sessionId,
        openid: openid
      })
      .update({
        data: updateData
      })
    
    return {
      success: true,
      updated: updateResult.stats.updated,
      updatedFields: Object.keys(updateData)
    }
    
  } catch (error) {
    console.error('更新会话进度失败:', error)
    throw error
  }
}

/**
 * 处理行为分析（异步处理，不影响主流程）
 * @param {Object} behaviorRecord - 行为记录
 */
async function processBehaviorAnalysis(behaviorRecord) {
  try {
    const { openid, action, data } = behaviorRecord
    
    // 根据不同行为类型进行分析
    switch (action) {
      case 'page_view':
        await updatePageViewStats(openid, data.page)
        break
        
      case 'learning_start':
        await updateLearningStats(openid, 'start')
        break
        
      case 'learning_complete':
        await updateLearningStats(openid, 'complete', data)
        break
        
      case 'question_answered':
        await updateAnswerStats(openid, data)
        break
        
      case 'feature_used':
        await updateFeatureUsageStats(openid, data.feature)
        break
        
      default:
        // 其他行为的通用处理
        await updateGeneralStats(openid, action)
        break
    }
    
  } catch (error) {
    console.error('行为分析处理失败:', error)
    // 不抛出错误，避免影响主流程
  }
}

/**
 * 更新页面访问统计
 * @param {string} openid - 用户ID
 * @param {string} page - 页面路径
 */
async function updatePageViewStats(openid, page) {
  try {
    const today = new Date().toISOString().split('T')[0]
    
    // 更新用户页面访问统计
    await db.collection('user_stats').doc(openid).update({
      data: {
        [`pageViews.${page}`]: db.command.inc(1),
        [`dailyPageViews.${today}.${page}`]: db.command.inc(1),
        lastActiveTime: new Date().toISOString()
      }
    })
    
  } catch (error) {
    if (error.errCode === -502002) {
      // 文档不存在，创建新文档
      await db.collection('user_stats').doc(openid).set({
        data: {
          pageViews: { [page]: 1 },
          dailyPageViews: { [today]: { [page]: 1 } },
          lastActiveTime: new Date().toISOString()
        }
      })
    } else {
      throw error
    }
  }
}

/**
 * 更新学习统计
 * @param {string} openid - 用户ID
 * @param {string} type - 类型（start/complete）
 * @param {Object} data - 数据
 */
async function updateLearningStats(openid, type, data = {}) {
  try {
    const today = new Date().toISOString().split('T')[0]
    const updateData = {
      lastActiveTime: new Date().toISOString()
    }
    
    if (type === 'start') {
      updateData[`learningStats.totalSessions`] = db.command.inc(1)
      updateData[`dailyLearningStats.${today}.sessions`] = db.command.inc(1)
    } else if (type === 'complete') {
      updateData[`learningStats.completedSessions`] = db.command.inc(1)
      updateData[`dailyLearningStats.${today}.completed`] = db.command.inc(1)
      
      if (data.score) {
        updateData[`learningStats.totalScore`] = db.command.inc(data.score)
        updateData[`learningStats.scoreCount`] = db.command.inc(1)
      }
      
      if (data.learningTime) {
        updateData[`learningStats.totalTime`] = db.command.inc(data.learningTime)
      }
    }
    
    await db.collection('user_stats').doc(openid).update({
      data: updateData
    })
    
  } catch (error) {
    if (error.errCode === -502002) {
      // 创建新的统计记录
      const newStats = {
        learningStats: {},
        dailyLearningStats: {},
        lastActiveTime: new Date().toISOString()
      }
      
      if (type === 'start') {
        newStats.learningStats.totalSessions = 1
        newStats.dailyLearningStats[today] = { sessions: 1 }
      }
      
      await db.collection('user_stats').doc(openid).set({
        data: newStats
      })
    } else {
      throw error
    }
  }
}

/**
 * 更新回答统计
 * @param {string} openid - 用户ID
 * @param {Object} data - 回答数据
 */
async function updateAnswerStats(openid, data) {
  try {
    const updateData = {
      [`answerStats.totalAnswers`]: db.command.inc(1),
      [`answerStats.totalLength`]: db.command.inc(data.answerLength || 0),
      lastActiveTime: new Date().toISOString()
    }
    
    await db.collection('user_stats').doc(openid).update({
      data: updateData
    })
    
  } catch (error) {
    if (error.errCode === -502002) {
      await db.collection('user_stats').doc(openid).set({
        data: {
          answerStats: {
            totalAnswers: 1,
            totalLength: data.answerLength || 0
          },
          lastActiveTime: new Date().toISOString()
        }
      })
    }
  }
}

/**
 * 更新功能使用统计
 * @param {string} openid - 用户ID
 * @param {string} feature - 功能名称
 */
async function updateFeatureUsageStats(openid, feature) {
  try {
    await db.collection('user_stats').doc(openid).update({
      data: {
        [`featureUsage.${feature}`]: db.command.inc(1),
        lastActiveTime: new Date().toISOString()
      }
    })
  } catch (error) {
    if (error.errCode === -502002) {
      await db.collection('user_stats').doc(openid).set({
        data: {
          featureUsage: { [feature]: 1 },
          lastActiveTime: new Date().toISOString()
        }
      })
    }
  }
}

/**
 * 更新通用统计
 * @param {string} openid - 用户ID
 * @param {string} action - 行为类型
 */
async function updateGeneralStats(openid, action) {
  try {
    await db.collection('user_stats').doc(openid).update({
      data: {
        [`generalStats.${action}`]: db.command.inc(1),
        lastActiveTime: new Date().toISOString()
      }
    })
  } catch (error) {
    if (error.errCode === -502002) {
      await db.collection('user_stats').doc(openid).set({
        data: {
          generalStats: { [action]: 1 },
          lastActiveTime: new Date().toISOString()
        }
      })
    }
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
 * 添加学习历史记录
 * @param {Object} historyData - 历史数据
 * @param {string} historyData.openid - 用户ID
 * @param {Object} historyData.sessionInfo - 会话信息
 * @returns {Object} 添加结果
 */
async function addLearningHistory(historyData) {
  
  try {
    const { openid, sessionInfo } = historyData
    
    // 参数验证
    if (!openid || !sessionInfo || !sessionInfo.sessionId) {
      return createErrorResponse('缺少必要参数', 'MISSING_PARAMS')
    }
    
    try {
      // 查询用户是否已有历史记录
      const existingHistory = await db.collection('learning_history').doc(openid).get()
      
      // 更新现有记录
      const currentData = existingHistory.data
      const sessions = currentData.sessions || []
      
      // 检查是否已存在该会话
      const existingSessionIndex = sessions.findIndex(s => s.sessionId === sessionInfo.sessionId)
      
      if (existingSessionIndex >= 0) {
        // 更新现有会话
        sessions[existingSessionIndex] = {
          ...sessions[existingSessionIndex],
          ...sessionInfo,
          lastUpdateTime: new Date().toISOString()
        }
      } else {
        // 添加新会话到开头
        sessions.unshift({
          ...sessionInfo,
          lastUpdateTime: new Date().toISOString()
        })
      }
      
      // 限制历史记录数量（最多保留50条）
      if (sessions.length > 50) {
        sessions.splice(50)
      }
      
      await db.collection('learning_history').doc(openid).update({
        data: {
          sessions: sessions,
          totalSessions: sessions.length,
          completedSessions: sessions.filter(s => s.status === 'completed').length,
          lastActiveTime: new Date().toISOString(),
          updateTime: new Date().toISOString()
        }
      })
      
    } catch (error) {
      // 修复：处理文档不存在的多种错误码
      if (error.errCode === -502002 || error.errCode === -1 || error.errMsg.includes('does not exist')) {
        
        await db.collection('learning_history').doc(openid).set({
          data: {
            openid: openid,
            sessions: [{
              ...sessionInfo,
              lastUpdateTime: new Date().toISOString()
            }],
            totalSessions: 1,
            completedSessions: sessionInfo.status === 'completed' ? 1 : 0,
            lastActiveTime: new Date().toISOString(),
            createTime: new Date().toISOString(),
            updateTime: new Date().toISOString()
          }
        })
      } else {
        throw error
      }
    }
    
    return {
      success: true,
      message: '学习历史记录添加成功'
    }
    
  } catch (error) {
    console.error('添加学习历史记录失败:', error)
    throw error
  }
}

/**
 * 获取学习历史记录
 * @param {Object} queryData - 查询数据
 * @param {string} queryData.openid - 用户ID
 * @param {number} queryData.limit - 限制数量
 * @param {number} queryData.skip - 跳过数量
 * @param {string} queryData.status - 状态筛选
 * @returns {Object} 历史记录
 */
async function getLearningHistory(queryData) {
  
  try {
    const { openid, limit, skip = 0, status } = queryData
    
    // 参数验证
    if (!openid) {
      return createErrorResponse('缺少用户ID', 'MISSING_USER_ID')
    }
    
    // 查询用户历史记录
    const historyResult = await db.collection('learning_history').doc(openid).get()
    
    if (historyResult.data.length === 0) {
      return {
        success: true,
        data: {
          sessions: [],
          totalSessions: 0,
          completedSessions: 0,
          hasMore: false
        }
      }
    }
    
    const historyData = historyResult.data[0]
    let sessions = historyData.sessions || []
    
    // 状态筛选
    if (status) {
      sessions = sessions.filter(s => s.status === status)
    }
    
    // 分页处理
    const totalCount = sessions.length
    const paginatedSessions = sessions.slice(skip, skip + limit)
    
    return {
      success: true,
      data: {
        sessions: paginatedSessions,
        totalSessions: historyData.totalSessions || 0,
        completedSessions: historyData.completedSessions || 0,
        hasMore: skip + limit < totalCount,
        totalCount: totalCount
      }
    }
    
  } catch (error) {
    console.error('获取学习历史记录失败:', error)
    throw error
  }
}

/**
 * 获取最近的学习记录（用于首页展示）
 * @param {Object} queryData - 查询数据
 * @param {string} queryData.openid - 用户ID
 * @param {number} queryData.limit - 限制数量，默认3条
 * @returns {Object} 最近的学习记录
 */
async function getRecentLearningHistory(queryData) {
  
  try {
    const { openid, limit = 3 } = queryData
    
    // 参数验证
    if (!openid) {
      return createErrorResponse('缺少用户ID', 'MISSING_USER_ID')
    }
    
    // 获取历史记录
    const historyResult = await getLearningHistory({ openid, limit, skip: 0 })
    
    if (!historyResult.success) {
      return historyResult
    }
    
    return {
      success: true,
      data: {
        recentSessions: historyResult.data.sessions,
        totalSessions: historyResult.data.totalSessions,
        completedSessions: historyResult.data.completedSessions
      }
    }
    
  } catch (error) {
    console.error('获取最近学习记录失败:', error)
    throw error
  }
}