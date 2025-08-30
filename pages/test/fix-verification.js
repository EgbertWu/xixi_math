/**
 * 修复验证测试页面
 * 用于验证首页历史记录显示修复是否有效
 */

const app = getApp()

Page({
  data: {
    testResults: {},
    isLoading: false,
    testLog: []
  },

  onLoad() {
    console.log('修复验证页面加载')
  },

  /**
   * 验证首页历史记录修复
   */
  async verifyHistoryFix() {
    console.log('开始验证首页历史记录修复...')
    
    this.setData({
      isLoading: true,
      testLog: ['🔍 开始验证首页历史记录修复...']
    })

    try {
      // 1. 检查openid
      const openid = app.globalData.openid
      this.addLog(`📱 当前openid: ${openid}`)
      
      if (!openid) {
        this.addLog('❌ openid不存在，无法进行测试')
        this.setData({ isLoading: false })
        return
      }

      // 2. 测试getUserHistory云函数
      this.addLog('☁️ 测试getUserHistory云函数...')
      const cloudResult = await wx.cloud.callFunction({
        name: 'getUserHistory',
        data: {
          openid: openid,
          page: 1,
          pageSize: 4,
          type: 'sessions'
        }
      })

      this.addLog(`📊 云函数调用结果: ${cloudResult.result.success ? '成功' : '失败'}`)
      
      if (cloudResult.result.success) {
        const sessions = cloudResult.result.data.sessions || []
        this.addLog(`📈 获取到 ${sessions.length} 条历史记录`)
        
        if (sessions.length > 0) {
          this.addLog('✅ 数据获取成功，历史记录应该能正常显示')
          this.addLog(`📝 第一条记录: ${sessions[0].questionText}`)
        } else {
          this.addLog('⚠️ 没有历史记录数据')
        }
      } else {
        this.addLog(`❌ 云函数调用失败: ${cloudResult.result.error}`)
      }

      // 3. 模拟首页loadLearningHistory函数
      this.addLog('🏠 模拟首页历史记录加载逻辑...')
      const historyItems = this.simulateLoadLearningHistory(cloudResult)
      
      this.addLog(`🎯 处理后的历史记录条数: ${historyItems.length}`)
      
      // 4. 模拟首页loadRecentSessions函数
      this.addLog('📋 模拟最近学习记录加载逻辑...')
      const recentResult = await wx.cloud.callFunction({
        name: 'getUserHistory',
        data: {
          openid: openid,
          page: 1,
          pageSize: 3,
          type: 'sessions'
        }
      })
      
      const recentSessions = this.simulateLoadRecentSessions(recentResult)
      this.addLog(`📊 最近学习记录条数: ${recentSessions.length}`)

      // 5. 总结结果
      this.addLog('\n🎉 验证完成！')
      this.addLog('📋 修复状态总结:')
      this.addLog(`  - getUserHistory云函数: ${cloudResult.result.success ? '✅ 正常' : '❌ 异常'}`)
      this.addLog(`  - 历史记录数据: ${historyItems.length > 0 ? '✅ 有数据' : '⚠️ 无数据'}`)
      this.addLog(`  - 最近学习记录: ${recentSessions.length > 0 ? '✅ 有数据' : '⚠️ 无数据'}`)
      
      if (cloudResult.result.success && (historyItems.length > 0 || recentSessions.length > 0)) {
        this.addLog('\n🎊 修复成功！首页历史记录应该能正常显示了')
        wx.showToast({
          title: '修复验证成功',
          icon: 'success'
        })
      } else {
        this.addLog('\n⚠️ 可能需要先创建一些学习记录')
        wx.showToast({
          title: '暂无历史数据',
          icon: 'none'
        })
      }

      this.setData({
        testResults: {
          cloudFunction: cloudResult.result.success,
          historyCount: historyItems.length,
          recentCount: recentSessions.length,
          openid: openid
        },
        isLoading: false
      })

    } catch (error) {
      console.error('验证过程出错:', error)
      this.addLog(`❌ 验证过程出错: ${error.message}`)
      this.setData({ isLoading: false })
    }
  },

  /**
   * 模拟首页loadLearningHistory函数的数据处理逻辑
   */
  simulateLoadLearningHistory(result) {
    let recentHistory = []
    if (result.result && result.result.success && result.result.data.sessions) {
      recentHistory = result.result.data.sessions.map(item => ({
        id: item.sessionId,
        title: item.questionText || '数学题解答',
        image: '',
        timestamp: item.startTime,
        sessionId: item.sessionId
      }))
    }
    return recentHistory
  },

  /**
   * 模拟首页loadRecentSessions函数的数据处理逻辑
   */
  simulateLoadRecentSessions(result) {
    let formattedSessions = []
    if (result.result && result.result.success && result.result.data.sessions) {
      const sessions = result.result.data.sessions
      formattedSessions = sessions.map(session => ({
        sessionId: session.sessionId,
        questionText: session.questionText || '数学题解答',
        startTime: session.startTime,
        lastUpdateTime: this.formatTime(session.startTime),
        status: session.status,
        progress: session.progress
      }))
    }
    return formattedSessions
  },

  /**
   * 格式化时间（复制自首页）
   */
  formatTime(timeString) {
    if (!timeString) return '未知时间'
    
    try {
      const date = new Date(timeString)
      const now = new Date()
      const diff = now - date
      
      const minutes = Math.floor(diff / (1000 * 60))
      const hours = Math.floor(diff / (1000 * 60 * 60))
      const days = Math.floor(diff / (1000 * 60 * 60 * 24))
      
      if (minutes < 1) {
        return '刚刚'
      } else if (minutes < 60) {
        return `${minutes}分钟前`
      } else if (hours < 24) {
        return `${hours}小时前`
      } else if (days < 7) {
        return `${days}天前`
      } else {
        return date.toLocaleDateString('zh-CN')
      }
    } catch (error) {
      return '时间格式错误'
    }
  },

  /**
   * 添加日志
   */
  addLog(message) {
    console.log(message)
    this.setData({
      testLog: [...this.data.testLog, message]
    })
  },

  /**
   * 清除日志
   */
  clearLog() {
    this.setData({
      testLog: [],
      testResults: {}
    })
  },

  /**
   * 复制日志
   */
  copyLog() {
    const logText = this.data.testLog.join('\n')
    wx.setClipboardData({
      data: logText,
      success: () => {
        wx.showToast({
          title: '日志已复制',
          icon: 'success'
        })
      }
    })
  },

  /**
   * 跳转到首页验证
   */
  goToHomePage() {
    wx.switchTab({
      url: '/pages/index/index'
    })
  },

  /**
   * 返回测试页面
   */
  goBack() {
    wx.navigateBack()
  }
})