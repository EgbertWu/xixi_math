// 云函数：updateUserStats
// 根据openid统计learning_history数据并更新user_stats

const cloud = require('wx-server-sdk')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

/**
 * 云函数入口函数
 * 修改原因：创建专门的云函数来统计learning_history数据并更新user_stats，解决小程序端权限问题
 * @param {Object} event - 事件参数
 * @param {string} event.openid - 用户openid（可选，不传则使用微信上下文获取）
 */
exports.main = async (event, context) => {
  
  try {
    // 获取用户openid
    const wxContext = cloud.getWXContext()
    const openid = event.openid || wxContext.OPENID
    
    if (!openid) {
      return {
        success: false,
        error: '无法获取用户openid',
        code: 'MISSING_OPENID'
      }
    }
    
    
    // 1. 统计learning_history中的数据
    const stats = await calculateLearningStats(openid)
    
    // 2. 更新或创建user_stats记录
    const updateResult = await updateUserStatsRecord(openid, stats)
    
    // 3. 同步更新users表中的learningStats字段
    await syncLearningStatsToUsers(openid, stats)
    
    return {
      success: true,
      data: {
        openid: openid,
        stats: stats,
        action: updateResult.action,
        timestamp: new Date().toISOString()
      }
    }
    
  } catch (error) {
    console.error('updateUserStats 云函数执行失败:', error)
    return {
      success: false,
      error: error.message,
      code: 'FUNCTION_ERROR'
    }
  }
}

/**
 * 同步学习统计数据到users表
 * 修改原因：确保users表中的learningStats与user_stats表保持同步
 * @param {string} openid - 用户openid
 * @param {Object} stats - 学习统计数据
 */
async function syncLearningStatsToUsers(openid, stats) {
  try {
    // 构建要更新到users表的learningStats数据
    const learningStatsForUsers = {
      totalQuestions: stats.totalQuestions || 0,
      completedSessions: stats.completedSessions || 0,
      totalLearningTime: stats.learningTime || 0,
      averageScore: stats.averageScore || 0,
      bestScore: stats.bestScore || 0,
      currentStreak: stats.streak || 0,
      longestStreak: stats.longestStreak || 0,
      updateTime: new Date().toISOString()
    }
    
    // 检查users表中是否存在该用户
    try {
      await db.collection('users').doc(openid).update({
        data: {
          'learningStats': learningStatsForUsers
        }
      })
      console.log(`成功同步学习统计数据到users表: ${openid}`)
    } catch (updateError) {
      // 如果用户不存在，记录日志但不抛出错误
      if (updateError.errCode === -1) {
        console.log(`用户 ${openid} 在users表中不存在，跳过同步learningStats`)
      } else {
        console.error('同步learningStats到users表失败:', updateError)
        throw updateError
      }
    }
    
  } catch (error) {
    console.error('syncLearningStatsToUsers执行失败:', error)
    throw error
  }
}

/**
 * 计算用户的学习统计数据
 * 修改原因：根据用户要求调整统计逻辑
 * @param {string} openid - 用户openid
 * @returns {object} 统计数据对象
 */
async function calculateLearningStats(openid) {
  
  try {
    // 查询用户的learning_history数据
    const learningHistoryResult = await db.collection('learning_history').doc(openid).get()
    
    if (!learningHistoryResult.data) {
      console.log('用户暂无学习历史记录')
      return {
        totalQuestions: 0,
        completedSessions: 0,
        learningTime: 0,
        averageScore: 0,
        streak: 0,
        totalDays: 0,
        lastLearningDate: null,
        firstLearningDate: null,
        latestAchievement: '暂无成就'
      }
    }
    
    const historyData = learningHistoryResult.data
    const sessions = historyData.sessions || []
    
    // 1. 总题目数：直接使用learning_history的totalSessions字段
    const totalQuestions = historyData.totalSessions || 0
    
    // 2. 完成会话数：统计状态为completed的会话
    const completedSessions = sessions.filter(session => session.isComplete || session.status === 'completed').length
    
    // 3. 学习时长：基于sessions中的timestamp统计
    let totalTime = 0 // 总学习时长（分钟）
    const learningDates = new Set() // 用于统计学习天数
    let latestTimestamp = 0
    let latestAchievement = '暂无成就'
    sessions.forEach(session => {
      // 统计学习时长：基于timestamp
      if (session.timestamp) {
        const sessionDate = new Date(session.timestamp)
        const dateStr = sessionDate.toISOString().split('T')[0]
        learningDates.add(dateStr)
        
        // 估算每个会话的学习时长（基于消息数量或轮次）
        const messagesCount = session.messages ? session.messages.length : 0
        const estimatedMinutes = Math.max(3, messagesCount * 1.5) // 每条消息约1.5分钟
        totalTime += estimatedMinutes
        
      }
    })
    
    // 4. 计算平均分数（保留原有逻辑，但不作为准确率显示）
    let totalScore = 0
    sessions.forEach(session => {
      if (session.score !== undefined) {
        totalScore += session.score
      } else if (session.isComplete) {
        // 如果没有具体分数，完成的会话给予默认分数
        totalScore += 80
      }
    })
    
    const averageScore = totalQuestions > 0 ? Math.round(totalScore / totalQuestions) : 0
    
    // 5. 计算连续学习天数
    const sortedDates = Array.from(learningDates).sort()
    const streak = calculateLearningStreak(sortedDates)

    latestAchievement = calculateLatestAchievement({
      totalQuestions,
      completedSessions,
      learningTime: Math.round(totalTime),
      averageScore,
      streak,
      totalDays: learningDates.size
    })
    
    // 6. 获取首次和最后学习日期
    const firstLearningDate = sortedDates[0] || null
    const lastLearningDate = sortedDates[sortedDates.length - 1] || null
    
    const result = {
      totalQuestions, // 使用totalSessions字段
      completedSessions,
      learningTime: Math.round(totalTime), // 基于timestamp统计的学习时长
      averageScore,
      streak,
      totalDays: learningDates.size,
      lastLearningDate,
      firstLearningDate,
      latestAchievement // 最新成就，替代准确率
    }
    
    console.log('学习统计计算完成:', result)
    return result
    
  } catch (error) {
    console.error('计算学习统计数据失败:', error)
    throw error
  }
}

/**
 * 计算连续学习天数
 * 修改原因：计算用户连续学习的天数，用于成就系统
 * @param {Array} sortedDates - 排序后的学习日期数组
 * @returns {number} 连续学习天数
 */
function calculateLearningStreak(sortedDates) {
  if (sortedDates.length === 0) return 0
  
  const today = new Date().toISOString().split('T')[0]
  let streak = 0
  let currentDate = today
  
  // 从今天开始往前计算连续天数
  for (let i = sortedDates.length - 1; i >= 0; i--) {
    const learningDate = sortedDates[i]
    
    if (learningDate === currentDate) {
      streak++
      // 计算前一天的日期
      const prevDate = new Date(currentDate)
      prevDate.setDate(prevDate.getDate() - 1)
      currentDate = prevDate.toISOString().split('T')[0]
    } else {
      break
    }
  }
  
  return streak
}

/**
 * 更新用户统计记录
 * 修改原因：将统计数据保存到user_stats集合中
 * @param {string} openid - 用户openid
 * @param {Object} stats - 统计数据
 * @returns {Object} 更新结果
 */
async function updateUserStatsRecord(openid, stats) {
  try {
    // 检查是否已存在用户统计记录
    const existingResult = await db.collection('user_stats')
      .where({
        openid: openid
      })
      .get()
    
    const updateData = {
      ...stats,
      openid: openid,
      updateTime: new Date().toISOString()
    }
    
    if (existingResult.data.length > 0) {
      // 更新现有记录
      const docId = existingResult.data[0]._id
      await db.collection('user_stats').doc(docId).update({
        data: updateData
      })
      
      return {
        action: 'updated',
        docId: docId
      }
    } else {
      // 创建新记录
      updateData.createTime = new Date().toISOString()
      
      const addResult = await db.collection('user_stats').add({
        data: updateData
      })
      
      return {
        action: 'created',
        docId: addResult._id
      }
    }
    
  } catch (error) {
    console.error('更新用户统计记录失败:', error)
    throw error
  }
}

/**
 * 计算用户的最新成就
 * @param {Object} stats - 学习统计数据
 * @returns {string} 最新解锁的成就名称
 */
function calculateLatestAchievement(stats) {
  // 定义成就列表（按优先级从高到低）
  const achievements = [
    {
      id: 'hour_learning',
      name: '⏰ 专注学习', 
      condition: stats.learningTime >= 60
    },
    {
      id: 'ten_questions',
      name: '📚 勤学好问',
      condition: stats.totalQuestions >= 10
    },
    {
      id: 'perfect_score', 
      name: '⭐ 完美表现',
      condition: stats.averageScore >= 100
    },
    {
      id: 'week_streak',
      name: '🔥 坚持不懈',
      condition: stats.streak >= 7
    },
    {
      id: 'first_question',
      name: '🎯 初次尝试',
      condition: stats.totalQuestions >= 1
    }
  ];
  
  // 找到最高优先级的已解锁成就
  for (const achievement of achievements) {
    if (achievement.condition) {
      return achievement.name;
    }
  }
  
  return '暂无成就';
}
