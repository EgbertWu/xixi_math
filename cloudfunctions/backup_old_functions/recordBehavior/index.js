// 云函数：recordBehavior
// 记录用户行为数据，用于分析和优化

const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 云函数入口函数
 * @param {Object} event - 事件参数
 * @param {string} event.userId - 用户ID
 * @param {string} event.action - 行为类型
 * @param {Object} event.data - 行为数据
 * @param {string} event.page - 页面路径
 * @param {string} event.timestamp - 时间戳
 */
exports.main = async (event, context) => {
  console.log('recordBehavior 云函数开始执行', event)
  
  try {
    const { userId, action, data, page, timestamp } = event
    
    // 参数验证
    if (!userId || !action) {
      return {
        success: false,
        error: '缺少必要参数',
        code: 'MISSING_PARAMS'
      }
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
    console.error('recordBehavior 云函数执行失败:', error)
    
    return {
      success: false,
      error: error.message || '服务器内部错误',
      code: 'INTERNAL_ERROR'
    }
  }
}

/**
 * 处理行为分析
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
      // 文档不存在，创建新文档
      const initData = {
        learningStats: {
          totalSessions: type === 'start' ? 1 : 0,
          completedSessions: type === 'complete' ? 1 : 0,
          totalScore: data.score || 0,
          scoreCount: data.score ? 1 : 0,
          totalTime: data.learningTime || 0
        },
        dailyLearningStats: {
          [today]: {
            sessions: type === 'start' ? 1 : 0,
            completed: type === 'complete' ? 1 : 0
          }
        },
        lastActiveTime: new Date().toISOString()
      }
      
      await db.collection('user_stats').doc(userId).set({
        data: initData
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
    
    if (data.round) {
      updateData[`answerStats.roundStats.${data.round}`] = db.command.inc(1)
    }
    
    await db.collection('user_stats').doc(userId).update({
      data: updateData
    })
    
  } catch (error) {
    if (error.errCode === -502002) {
      // 文档不存在，创建新文档
      await db.collection('user_stats').doc(userId).set({
        data: {
          answerStats: {
            totalAnswers: 1,
            totalLength: data.answerLength || 0,
            roundStats: data.round ? { [data.round]: 1 } : {}
          },
          lastActiveTime: new Date().toISOString()
        }
      })
    } else {
      throw error
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
      // 文档不存在，创建新文档
      await db.collection('user_stats').doc(userId).set({
        data: {
          featureUsage: { [feature]: 1 },
          lastActiveTime: new Date().toISOString()
        }
      })
    } else {
      throw error
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
        [`generalActions.${action}`]: db.command.inc(1),
        lastActiveTime: new Date().toISOString()
      }
    })
    
  } catch (error) {
    if (error.errCode === -502002) {
      // 文档不存在，创建新文档
      await db.collection('user_stats').doc(userId).set({
        data: {
          generalActions: { [action]: 1 },
          lastActiveTime: new Date().toISOString()
        }
      })
    } else {
      throw error
    }
  }
}