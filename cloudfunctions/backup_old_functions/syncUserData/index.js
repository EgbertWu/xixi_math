// 云函数：syncUserData
// 同步用户数据到云端

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
 * @param {Object} event.userInfo - 用户信息
 * @param {Object} event.learningStats - 学习统计
 * @param {Object} event.settings - 用户设置
 * @param {string} event.timestamp - 时间戳
 */
exports.main = async (event, context) => {
  console.log('syncUserData 云函数开始执行', event)
  
  try {
    const { userId, userInfo, learningStats, settings, timestamp } = event
    
    // 参数验证
    if (!userId) {
      return {
        success: false,
        error: '缺少用户ID',
        code: 'MISSING_USER_ID'
      }
    }
    
    // 获取微信用户信息
    const wxContext = cloud.getWXContext()
    
    // 构建用户数据
    const userData = {
      userId: userId,
      openid: wxContext.OPENID,
      lastSyncTime: timestamp || new Date().toISOString(),
      platform: 'miniprogram'
    }
    
    // 添加用户信息
    if (userInfo) {
      userData.userInfo = {
        ...userInfo,
        updateTime: new Date().toISOString()
      }
    }
    
    // 添加学习统计
    if (learningStats) {
      userData.learningStats = {
        ...learningStats,
        updateTime: new Date().toISOString()
      }
    }
    
    // 添加用户设置
    if (settings) {
      userData.settings = {
        ...settings,
        updateTime: new Date().toISOString()
      }
    }
    
    // 尝试更新现有用户数据
    try {
      const updateResult = await db.collection('users').doc(userId).update({
        data: userData
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
          ...userData,
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
    console.error('syncUserData 云函数执行失败:', error)
    
    return {
      success: false,
      error: error.message || '服务器内部错误',
      code: 'INTERNAL_ERROR'
    }
  }
}