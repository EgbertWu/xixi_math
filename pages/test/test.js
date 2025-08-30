// 数据库测试页面
// 用于运行数据库测试并显示结果
// 创建原因：提供一个可视化界面来运行数据库测试，帮助调试历史记录显示问题

const databaseTest = require('../../test/database-test.js')

Page({
  /**
   * 页面的初始数据
   */
  data: {
    testResults: null,
    isLoading: false,
    testLog: []
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad: function (options) {
    console.log('数据库测试页面加载')
  },

  /**
   * 运行完整数据库测试
   */
  async runFullTest() {
    console.log('开始运行完整数据库测试')
    
    this.setData({
      isLoading: true,
      testLog: ['开始运行完整数据库测试...']
    })
    
    try {
      // 重写console.log来捕获测试日志
      const originalLog = console.log
      const logs = []
      
      console.log = (...args) => {
        const logMessage = args.map(arg => 
          typeof arg === 'object' ? JSON.stringify(arg, null, 2) : String(arg)
        ).join(' ')
        logs.push(logMessage)
        originalLog.apply(console, args)
        
        // 实时更新日志显示
        this.setData({
          testLog: [...logs]
        })
      }
      
      // 运行测试
      const results = await databaseTest.quickTest()
      
      // 恢复原始console.log
      console.log = originalLog
      
      this.setData({
        testResults: results,
        isLoading: false
      })
      
      wx.showToast({
        title: '测试完成',
        icon: 'success'
      })
      
    } catch (error) {
      console.error('测试失败:', error)
      
      this.setData({
        isLoading: false,
        testLog: [...this.data.testLog, `❌ 测试失败: ${error.message}`]
      })
      
      wx.showToast({
        title: '测试失败',
        icon: 'error'
      })
    }
  },

  /**
   * 仅测试learning_history集合
   */
  async testLearningHistoryOnly() {
    console.log('开始测试learning_history集合')
    
    this.setData({
      isLoading: true,
      testLog: ['开始测试learning_history集合...']
    })
    
    try {
      const results = await databaseTest.testLearningHistoryOnly()
      
      this.setData({
        testResults: { learningHistory: results },
        isLoading: false,
        testLog: [...this.data.testLog, 
          `learning_history测试结果: ${results.success ? '成功' : '失败'}`,
          `用户数据条数: ${results.userDataCount || 0}`
        ]
      })
      
      wx.showToast({
        title: results.success ? '测试成功' : '测试失败',
        icon: results.success ? 'success' : 'error'
      })
      
    } catch (error) {
      console.error('learning_history测试失败:', error)
      
      this.setData({
        isLoading: false,
        testLog: [...this.data.testLog, `❌ learning_history测试失败: ${error.message}`]
      })
    }
  },

  /**
   * 仅测试learning_sessions集合
   */
  async testLearningSessionsOnly() {
    console.log('开始测试learning_sessions集合')
    
    this.setData({
      isLoading: true,
      testLog: ['开始测试learning_sessions集合...']
    })
    
    try {
      const results = await databaseTest.testLearningSessionsOnly()
      
      this.setData({
        testResults: { learningSessions: results },
        isLoading: false,
        testLog: [...this.data.testLog, 
          `learning_sessions测试结果: ${results.success ? '成功' : '失败'}`,
          `用户数据条数: ${results.userDataCount || 0}`
        ]
      })
      
      wx.showToast({
        title: results.success ? '测试成功' : '测试失败',
        icon: results.success ? 'success' : 'error'
      })
      
    } catch (error) {
      console.error('learning_sessions测试失败:', error)
      
      this.setData({
        isLoading: false,
        testLog: [...this.data.testLog, `❌ learning_sessions测试失败: ${error.message}`]
      })
    }
  },

  /**
   * 清除测试结果
   */
  clearResults() {
    this.setData({
      testResults: null,
      testLog: []
    })
    
    wx.showToast({
      title: '已清除结果',
      icon: 'success'
    })
  },

  /**
   * 复制测试结果到剪贴板
   */
  copyResults() {
    if (!this.data.testResults) {
      wx.showToast({
        title: '没有测试结果',
        icon: 'error'
      })
      return
    }
    
    const resultText = JSON.stringify(this.data.testResults, null, 2)
    
    wx.setClipboardData({
      data: resultText,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        })
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'error'
        })
      }
    })
  },

  /**
   * 复制测试日志到剪贴板
   */
  copyLogs() {
    if (!this.data.testLog || this.data.testLog.length === 0) {
      wx.showToast({
        title: '没有测试日志',
        icon: 'error'
      })
      return
    }
    
    const logText = this.data.testLog.join('\n')
    
    wx.setClipboardData({
      data: logText,
      success: () => {
        wx.showToast({
          title: '日志已复制',
          icon: 'success'
        })
      },
      fail: () => {
        wx.showToast({
          title: '复制失败',
          icon: 'error'
        })
      }
    })
  },

  /**
   * 返回首页
   */
  goHome() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  /**
   * 跳转到修复验证页面
   */
  goToFixVerification() {
    wx.navigateTo({
      url: '/pages/test/fix-verification'
    })
  }
})