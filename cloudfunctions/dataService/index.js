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
 * @param {string} event.action - 操作类型：'recordBehavior' 记录行为 | 'syncUserData' 同步用户数据 | 'updateSessionProgress' 更新会话进度
 * @param {Object} event.data - 操作数据
 */
exports.main = async (event, context) => {
  console.log('dataService 云函数开始执行', event)
  
  try {
    const { action, data } = event
    
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
 * @param {string} behaviorData.userId - 用户ID
 * @param {string} behaviorData.action - 行为类型
 * @param {Object} behaviorData.data - 行为数据
 * @param {string} behaviorData.page - 页面路径
 * @param {string} behaviorData.timestamp - 时间戳
 * @returns {Object} 记录结果
 */
async function recordBehavior(behaviorData) {
  console.log('记录用户行为...')
  
  try {
    const { userId, action, data, page, timestamp } = behaviorData
    
    // 参数验证
    if (!userId || !action) {
      return createErrorResponse('缺少必要参数', 'MISSING_PARAMS')
    }
    
    // 获取微信用户信息
    const wxContext = cloud.getWXContext()
    
    // 构建行为记录
    const behaviorRecord = {
      userId: userId,
      action: action,
      data: data || {},
      page: page || '',
      timestamp: timestamp || new Date().toISOString(),
      platform: 'miniprogram',
      
      // 微信环境信息
      wxInfo: {
        openid: wxContext.OPENID,
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
    
    console.log('用户行为记录成功:', result._id)
    
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
 * 同步用户数据到云端
 * @param {Object} userData - 用户数据
 * @param {string} userData.userId - 用户ID
 * @param {Object} userData.userInfo - 用户信息
 * @param {Object} userData.learningStats - 学习统计
 * @param {Object} userData.settings - 用户设置
 * @param {string} userData.timestamp - 时间戳
 * @returns {Object} 同步结果
 */
async function syncUserData(userData) {
  console.log('同步用户数据...')
  
  try {
    const { userId, userInfo, learningStats, settings, timestamp } = userData
    
    // 参数验证
    if (!userId) {
      return createErrorResponse('缺少用户ID', 'MISSING_USER_ID')
    }
    
    // 获取微信用户信息
    const wxContext = cloud.getWXContext()
    
    // 构建用户数据
    const updateData = {
      userId: userId,
      openid: wxContext.OPENID,
      lastSyncTime: timestamp || new Date().toISOString(),
      platform: 'miniprogram'
    }
    
    // 添加用户信息
    if (userInfo) {
      updateData.userInfo = {
        ...userInfo,
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
    
    // 尝试更新现有用户数据
    try {
      const updateResult = await db.collection('users').doc(userId).update({
        data: updateData
      })
      
      console.log('用户数据更新成功:', updateResult)
      
      // 获取更新后的完整用户数据
      const userResult = await db.collection('users').doc(userId).get()
      
      return {
        success: true,
        data: userResult.data,
        action: 'updated'
      }
      
    } catch (updateError) {
      if (updateError.errCode === -502002) {
        // 用户不存在，创建新用户
        console.log('用户不存在，创建新用户')
        
        const newUserData = {
          ...updateData,
          createTime: new Date().toISOString(),
          
          // 默认用户信息
          userInfo: userInfo || {
            nickname: '新用户',
            avatar: '',
            level: 1,
            experience: 0
          },
          
          // 默认学习统计
          learningStats: learningStats || {
            totalQuestions: 0,
            completedSessions: 0,
            totalLearningTime: 0,
            averageScore: 0,
            bestScore: 0,
            currentStreak: 0,
            longestStreak: 0
          },
          
          // 默认设置
          settings: settings || {
            notifications: true,
            soundEffects: true,
            autoSave: true,
            dataSync: true
          },
          
          // 默认成就
          achievements: {
            unlocked: [],
            progress: {}
          }
        }
        
        const createResult = await db.collection('users').doc(userId).set({
          data: newUserData
        })
        
        console.log('新用户创建成功:', createResult)
        
        return {
          success: true,
          data: newUserData,
          action: 'created'
        }
        
      } else {
        throw updateError
      }
    }
    
  } catch (error) {
    console.error('同步用户数据失败:', error)
    throw error
  }
}

/**
 * 更新会话进度（新增功能，解决之前 learning.js 中的问题）
 * @param {Object} progressData - 进度数据
 * @param {string} progressData.sessionId - 会话ID
 * @param {string} progressData.userId - 用户ID
 * @param {Array} progressData.dialogue - 对话数据
 * @param {number} progressData.currentRound - 当前轮次
 * @returns {Object} 更新结果
 */
async function updateSessionProgress(progressData) {
  console.log('更新会话进度...')
  
  try {
    const { sessionId, userId, dialogue, currentRound } = progressData
    
    // 参数验证
    if (!sessionId || !userId) {
      return createErrorResponse('缺少必要参数', 'MISSING_PARAMS')
    }
    
    // 更新会话数据
    const updateResult = await db.collection('learning_sessions')
      .where({
        sessionId: sessionId,
        userId: userId
      })
      .update({
        data: {
          dialogue: dialogue,
          currentRound: currentRound,
          updateTime: new Date().toISOString()
        }
      })
    
    console.log('会话进度更新成功:', updateResult)
    
    return {
      success: true,
      updated: updateResult.stats.updated
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
    const { userId, action, data } = behaviorRecord
    
    // 根据不同行为类型进行分析
    switch (action) {
      case 'page_view':
        await updatePageViewStats(userId, data.page)
        break
        
      case 'learning_start':
        await updateLearningStats(userId, 'start')
        break
        
      case 'learning_complete':
        await updateLearningStats(userId, 'complete', data)
        break
        
      case 'question_answered':
        await updateAnswerStats(userId, data)
        break
        
      case 'feature_used':
        await updateFeatureUsageStats(userId, data.feature)
        break
        
      default:
        // 其他行为的通用处理
        await updateGeneralStats(userId, action)
        break
    }
    
  } catch (error) {
    console.error('行为分析处理失败:', error)
    // 不抛出错误，避免影响主流程
  }
}

/**
 * 更新页面访问统计
 * @param {string} userId - 用户ID
 * @param {string} page - 页面路径
 */
async function updatePageViewStats(userId, page) {
  try {
    const today = new Date().toISOString().split('T')[0]
    
    // 更新用户页面访问统计
    await db.collection('user_stats').doc(userId).update({
      data: {
        [`pageViews.${page}`]: db.command.inc(1),
        [`dailyPageViews.${today}.${page}`]: db.command.inc(1),
        lastActiveTime: new Date().toISOString()
      }
    })
    
  } catch (error) {
    if (error.errCode === -502002) {
      // 文档不存在，创建新文档
      await db.collection('user_stats').doc(userId).set({
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
 * @param {string} userId - 用户ID
 * @param {string} type - 类型（start/complete）
 * @param {Object} data - 数据
 */
async function updateLearningStats(userId, type, data = {}) {
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
    
    await db.collection('user_stats').doc(userId).update({
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
      
      await db.collection('user_stats').doc(userId).set({
        data: newStats
      })
    } else {
      throw error
    }
  }
}

/**
 * 更新回答统计
 * @param {string} userId - 用户ID
 * @param {Object} data - 回答数据
 */
async function updateAnswerStats(userId, data) {
  try {
    const updateData = {
      [`answerStats.totalAnswers`]: db.command.inc(1),
      [`answerStats.totalLength`]: db.command.inc(data.answerLength || 0),
      lastActiveTime: new Date().toISOString()
    }
    
    await db.collection('user_stats').doc(userId).update({
      data: updateData
    })
    
  } catch (error) {
    if (error.errCode === -502002) {
      await db.collection('user_stats').doc(userId).set({
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
 * @param {string} userId - 用户ID
 * @param {string} feature - 功能名称
 */
async function updateFeatureUsageStats(userId, feature) {
  try {
    await db.collection('user_stats').doc(userId).update({
      data: {
        [`featureUsage.${feature}`]: db.command.inc(1),
        lastActiveTime: new Date().toISOString()
      }
    })
  } catch (error) {
    if (error.errCode === -502002) {
      await db.collection('user_stats').doc(userId).set({
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
 * @param {string} userId - 用户ID
 * @param {string} action - 行为类型
 */
async function updateGeneralStats(userId, action) {
  try {
    await db.collection('user_stats').doc(userId).update({
      data: {
        [`generalStats.${action}`]: db.command.inc(1),
        lastActiveTime: new Date().toISOString()
      }
    })
  } catch (error) {
    if (error.errCode === -502002) {
      await db.collection('user_stats').doc(userId).set({
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