// 数据库测试文件
// 用于测试和调试learning_history相关的数据库查询
// 创建原因：帮助排查历史记录无法显示的问题，确认数据库集合结构和数据存储情况

const app = getApp()

/**
 * 数据库测试工具类
 * 提供各种数据库查询和调试功能
 */
class DatabaseTester {
  constructor() {
    this.db = wx.cloud.database()
  }

  /**
   * 测试用户openid获取
   * @returns {string} 用户openid
   */
  async testOpenId() {
    console.log('=== 测试用户openid获取 ===')
    console.log('app.globalData.openid:', app.globalData.openid)
    console.log('openid类型:', typeof app.globalData.openid)
    console.log('openid是否存在:', !!app.globalData.openid)
    
    if (!app.globalData.openid) {
      console.warn('⚠️ openid不存在，尝试重新获取...')
      // 可以在这里调用登录函数重新获取openid
      try {
        const result = await wx.cloud.callFunction({
          name: 'login'
        })
        console.log('重新获取openid结果:', result)
        if (result.result && result.result.openid) {
          app.globalData.openid = result.result.openid
          console.log('✅ 成功获取openid:', app.globalData.openid)
        }
      } catch (error) {
        console.error('❌ 重新获取openid失败:', error)
      }
    }
    
    return app.globalData.openid
  }

  /**
   * 测试learning_history集合查询
   * @param {string} openid - 用户openid
   * @returns {Object} 查询结果
   */
  async testLearningHistoryCollection(openid) {
    console.log('\n=== 测试learning_history集合查询 ===')
    
    try {
      // 方法1：按openid查询
      console.log('--- 方法1：按openid查询 ---')
      const result1 = await this.db.collection('learning_history')
        .where({ openid: openid })
        .get()
      
      console.log('learning_history查询结果:', result1)
      console.log('数据条数:', result1.data.length)
      
      if (result1.data.length > 0) {
        console.log('第一条数据结构:', result1.data[0])
        console.log('sessions字段:', result1.data[0].sessions)
      }
      
      // 方法2：查询所有数据（限制10条）
      console.log('\n--- 方法2：查询所有数据 ---')
      const result2 = await this.db.collection('learning_history')
        .limit(10)
        .get()
      
      console.log('learning_history所有数据:', result2)
      console.log('总数据条数:', result2.data.length)
      
      return {
        success: true,
        userDataCount: result1.data.length,
        totalDataCount: result2.data.length,
        userData: result1.data,
        allData: result2.data
      }
      
    } catch (error) {
      console.error('❌ learning_history集合查询失败:', error)
      return {
        success: false,
        error: error.message,
        errorCode: error.errCode
      }
    }
  }

  /**
   * 测试learning_sessions集合查询
   * @param {string} openid - 用户openid
   * @returns {Object} 查询结果
   */
  async testLearningSessionsCollection(openid) {
    console.log('\n=== 测试learning_sessions集合查询 ===')
    
    try {
      // 方法1：按openid查询
      console.log('--- 方法1：按openid查询 ---')
      const result1 = await this.db.collection('learning_sessions')
        .where({ openid: openid })
        .orderBy('startTime', 'desc')
        .get()
      
      console.log('learning_sessions查询结果:', result1)
      console.log('数据条数:', result1.data.length)
      
      if (result1.data.length > 0) {
        console.log('第一条数据结构:', result1.data[0])
        console.log('会话ID:', result1.data[0].sessionId)
        console.log('问题文本:', result1.data[0].questionText)
      }
      
      // 方法2：查询所有数据（限制10条）
      console.log('\n--- 方法2：查询所有数据 ---')
      const result2 = await this.db.collection('learning_sessions')
        .limit(10)
        .get()
      
      console.log('learning_sessions所有数据:', result2)
      console.log('总数据条数:', result2.data.length)
      
      return {
        success: true,
        userDataCount: result1.data.length,
        totalDataCount: result2.data.length,
        userData: result1.data,
        allData: result2.data
      }
      
    } catch (error) {
      console.error('❌ learning_sessions集合查询失败:', error)
      return {
        success: false,
        error: error.message,
        errorCode: error.errCode
      }
    }
  }

  /**
   * 测试其他相关集合
   * @param {string} openid - 用户openid
   * @returns {Object} 查询结果
   */
  async testOtherCollections(openid) {
    console.log('\n=== 测试其他相关集合 ===')
    
    const collections = [
      'users',
      'user_stats', 
      'learning_reports',
      'user_behaviors'
    ]
    
    const results = {}
    
    for (const collectionName of collections) {
      try {
        console.log(`\n--- 测试${collectionName}集合 ---`)
        
        // 先测试集合是否存在
        const testResult = await this.db.collection(collectionName)
          .limit(1)
          .get()
        
        console.log(`${collectionName}集合存在，样本数据:`, testResult.data)
        
        // 如果集合存在，查询用户相关数据
        const userResult = await this.db.collection(collectionName)
          .where({ openid: openid })
          .get()
        
        console.log(`${collectionName}用户数据:`, userResult.data)
        
        results[collectionName] = {
          exists: true,
          userDataCount: userResult.data.length,
          userData: userResult.data
        }
        
      } catch (error) {
        console.log(`${collectionName}集合不存在或无权限:`, error.message)
        results[collectionName] = {
          exists: false,
          error: error.message
        }
      }
    }
    
    return results
  }

  /**
   * 测试云函数调用
   * @param {string} openid - 用户openid
   * @returns {Object} 调用结果
   */
  async testCloudFunctions(openid) {
    console.log('\n=== 测试云函数调用 ===')
    
    const results = {}
    
    // 测试dataService云函数
    try {
      console.log('--- 测试dataService云函数 ---')
      const dataServiceResult = await wx.cloud.callFunction({
        name: 'dataService',
        data: {
          action: 'getLearningHistory',
          data: {
            openid: openid,
            limit: 5
          }
        }
      })
      
      console.log('dataService调用结果:', dataServiceResult)
      results.dataService = dataServiceResult.result
      
    } catch (error) {
      console.error('❌ dataService调用失败:', error)
      results.dataService = { error: error.message }
    }
    
    // 测试getUserHistory云函数
    try {
      console.log('\n--- 测试getUserHistory云函数 ---')
      const getUserHistoryResult = await wx.cloud.callFunction({
        name: 'getUserHistory',
        data: {
          openid: openid,
          page: 1,
          pageSize: 5,
          type: 'sessions'
        }
      })
      
      console.log('getUserHistory调用结果:', getUserHistoryResult)
      results.getUserHistory = getUserHistoryResult.result
      
    } catch (error) {
      console.error('❌ getUserHistory调用失败:', error)
      results.getUserHistory = { error: error.message }
    }
    
    return results
  }

  /**
   * 运行完整的数据库测试
   * @returns {Object} 完整测试结果
   */
  async runFullTest() {
    console.log('🚀 开始运行完整数据库测试...')
    
    const testResults = {
      timestamp: new Date().toISOString(),
      openid: null,
      learningHistory: null,
      learningSessions: null,
      otherCollections: null,
      cloudFunctions: null
    }
    
    try {
      // 1. 测试openid
      testResults.openid = await this.testOpenId()
      
      if (!testResults.openid) {
        console.error('❌ 无法获取openid，停止测试')
        return testResults
      }
      
      // 2. 测试learning_history集合
      testResults.learningHistory = await this.testLearningHistoryCollection(testResults.openid)
      
      // 3. 测试learning_sessions集合
      testResults.learningSessions = await this.testLearningSessionsCollection(testResults.openid)
      
      // 4. 测试其他集合
      testResults.otherCollections = await this.testOtherCollections(testResults.openid)
      
      // 5. 测试云函数
      testResults.cloudFunctions = await this.testCloudFunctions(testResults.openid)
      
      console.log('\n🎉 完整测试结果:', testResults)
      
      // 生成测试报告
      this.generateTestReport(testResults)
      
    } catch (error) {
      console.error('❌ 测试过程中发生错误:', error)
      testResults.error = error.message
    }
    
    return testResults
  }

  /**
   * 生成测试报告
   * @param {Object} testResults - 测试结果
   */
  generateTestReport(testResults) {
    console.log('\n📊 === 数据库测试报告 ===')
    console.log('测试时间:', testResults.timestamp)
    console.log('用户openid:', testResults.openid)
    
    console.log('\n📋 集合测试结果:')
    console.log('- learning_history:', testResults.learningHistory?.success ? '✅ 成功' : '❌ 失败')
    console.log('- learning_sessions:', testResults.learningSessions?.success ? '✅ 成功' : '❌ 失败')
    
    console.log('\n📈 数据统计:')
    if (testResults.learningHistory?.success) {
      console.log(`- learning_history用户数据: ${testResults.learningHistory.userDataCount}条`)
    }
    if (testResults.learningSessions?.success) {
      console.log(`- learning_sessions用户数据: ${testResults.learningSessions.userDataCount}条`)
    }
    
    console.log('\n🔧 建议:')
    if (testResults.learningHistory?.success && testResults.learningHistory.userDataCount > 0) {
      console.log('✅ 建议使用learning_history集合')
    } else if (testResults.learningSessions?.success && testResults.learningSessions.userDataCount > 0) {
      console.log('✅ 建议使用learning_sessions集合')
    } else {
      console.log('⚠️ 两个集合都没有用户数据，可能需要先创建学习记录')
    }
  }
}

/**
 * 导出测试函数，可以在其他页面中调用
 */
module.exports = {
  DatabaseTester,
  
  /**
   * 快速测试函数
   * 可以在页面中直接调用
   */
  async quickTest() {
    const tester = new DatabaseTester()
    return await tester.runFullTest()
  },
  
  /**
   * 仅测试learning_history
   */
  async testLearningHistoryOnly() {
    const tester = new DatabaseTester()
    const openid = await tester.testOpenId()
    if (openid) {
      return await tester.testLearningHistoryCollection(openid)
    }
    return { success: false, error: '无法获取openid' }
  },
  
  /**
   * 仅测试learning_sessions
   */
  async testLearningSessionsOnly() {
    const tester = new DatabaseTester()
    const openid = await tester.testOpenId()
    if (openid) {
      return await tester.testLearningSessionsCollection(openid)
    }
    return { success: false, error: '无法获取openid' }
  }
}