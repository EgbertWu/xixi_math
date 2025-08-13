// pages/result/result.js
// 希希数学小助手 学习结果页面逻辑

const app = getApp()
const LearningManager = require('../../utils/learningManager')

Page({
  /**
   * 页面的初始数据
   */
  data: {
    sessionId: '', // 学习会话ID
    sessionData: null, // 会话数据
    learningReport: null, // 学习报告
    isLoading: true, // 是否正在加载
    loadingText: '正在生成学习报告...',
    
    // 报告数据结构
    reportData: {
      questionText: '', // 题目内容
      totalTime: 0, // 总学习时间(分钟)
      totalRounds: 3, // 总轮次
      completedRounds: 0, // 完成轮次
      
      // 学习表现评估
      performance: {
        score: 0, // 综合得分 (0-100)
        level: '', // 学习水平: 优秀/良好/需要改进
        strengths: [], // 优势点
        improvements: [] // 改进建议
      },
      
      // 思维能力分析
      thinkingAnalysis: {
        logicalThinking: 0, // 逻辑思维 (0-5)
        problemSolving: 0, // 问题解决 (0-5)
        communication: 0, // 表达能力 (0-5)
        creativity: 0 // 创新思维 (0-5)
      },
      
      // 知识点掌握情况
      knowledgePoints: [],
      
      // 学习建议
      suggestions: [],
      
      // 下一步学习计划
      nextSteps: []
    },
    
    // 分享配置
    shareConfig: {
      title: '',
      desc: '',
      imageUrl: '/images/share-result.png'
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('结果页面加载', options)
    
    const mode = options.mode
    const sessionId = options.sessionId
    
    // 如果是历史模式
    if (mode === 'history') {
      this.setData({ 
        mode: 'history',
        isLoading: true,
        loadingText: '正在加载学习历史...'
      })
      this.loadLearningHistory()
      
      // 记录页面访问
      app.trackUserBehavior('page_visit', {
        page: 'result',
        mode: 'history'
      })
      return
    }
    
    // 正常的报告模式
    if (!sessionId) {
      app.showError('会话ID缺失')
      wx.navigateBack()
      return
    }
    
    this.setData({ 
      sessionId,
      mode: 'report'
    })
    
    // 加载学习报告
    this.loadLearningReport()
    
    // 记录页面访问
    app.trackUserBehavior('page_visit', {
      page: 'result',
      sessionId: sessionId
    })
  },

  /**
   * 加载学习报告
   * 从云端获取AI生成的学习报告
   */
  loadLearningReport() {
    wx.cloud.callFunction({
      name: 'reportService',  // ✅ 调用 reportService 云函数
      data: {
        action: 'generate',   // ✅ 指定生成报告操作
        data: {
          sessionId: this.data.sessionId,
          userId: app.globalData.userId,
          timestamp: new Date().toISOString()
        }
      },
      success: (res) => {
        console.log('学习报告生成成功', res)
        
        if (res.result && res.result.success) {
          const reportData = res.result.data
          this.processReportData(reportData)  // ✅ 处理报告数据
        } else {
          this.handleLoadError(res.result?.error || '报告生成失败')
        }
      },
      fail: (err) => {
        console.error('加载学习报告失败', err)
        this.handleLoadError('网络错误，请重试')
      }
    })
  },

  /**
   * 处理报告数据
   * @param {Object} reportData - 从云端获取的报告数据
   */
  processReportData(reportData) {
    // 处理学习时间
    const startTime = new Date(reportData.startTime)
    const endTime = new Date(reportData.endTime)
    const totalTime = Math.round((endTime - startTime) / (1000 * 60)) // 转换为分钟
    
    // 获取性能等级
    const getPerformanceLevel = (score) => {
      if (score >= 85) return 'excellent'  // 优秀
      if (score >= 70) return 'good'       // 良好
      if (score >= 60) return 'pass'       // 及格
      return 'improve'                     // 需要改进
    }
    
    const getPerformanceLevelText = (score) => {
      if (score >= 85) return '优秀'
      if (score >= 70) return '良好'
      if (score >= 60) return '及格'
      return '需要改进'
    }
    
    // 更新数据
    this.setData({
      'reportData.performance.level': getPerformanceLevel(reportData.performance.score),
      'reportData.performance.levelText': getPerformanceLevelText(reportData.performance.score),
      reportData: {
        ...this.data.reportData,
        questionText: reportData.questionText,
        totalTime: totalTime,
        completedRounds: reportData.completedRounds,
        
        performance: {
          score: reportData.performance.score,
          level: getPerformanceLevel(reportData.performance.score),
          strengths: reportData.performance.strengths || [],
          improvements: reportData.performance.improvements || []
        },
        
        thinkingAnalysis: reportData.thinkingAnalysis || {
          logicalThinking: 3,
          problemSolving: 3,
          communication: 3,
          creativity: 3
        },
        
        knowledgePoints: reportData.knowledgePoints || [],
        suggestions: reportData.suggestions || [],
        nextSteps: reportData.nextSteps || []
      },
      
      shareConfig: {
        title: `我在希希数学小助手完成了数学学习，获得${reportData.performance.score}分！`,
        desc: `通过AI启发式教学，提升了数学思维能力`,
        imageUrl: '/images/share-result.png'
      },
      
      isLoading: false
    })
    
    // 更新用户学习统计
    this.updateUserStats()
    
    // 记录报告生成成功
    app.trackUserBehavior('report_generated', {
      sessionId: this.data.sessionId,
      score: reportData.performance.score,
      totalTime: totalTime
    })
  },

  /**
   * 处理加载错误
   * @param {string} errorMsg - 错误信息
   */
  handleLoadError(errorMsg) {
    this.setData({
      isLoading: false
    })
    
    wx.showModal({
      title: '加载失败',
      content: errorMsg + '\n\n是否重试？',
      confirmText: '重试',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          this.setData({ isLoading: true })
          this.loadLearningReport()
        } else {
          wx.navigateBack()
        }
      }
    })
  },

  /**
   * 更新用户学习统计
   */
  updateUserStats() {
    const currentStats = wx.getStorageSync('learningStats') || {
      totalQuestions: 0,
      completedSessions: 0,
      learningTime: 0
    }
    
    const newStats = {
      totalQuestions: currentStats.totalQuestions + 1,
      completedSessions: currentStats.completedSessions + 1,
      learningTime: currentStats.learningTime + this.data.reportData.totalTime
    }
    
    // 保存到本地
    wx.setStorageSync('learningStats', newStats)
    
    // 同步到云端
    wx.cloud.callFunction({
      name: 'updateUserStats',
      data: {
        userId: app.globalData.userId,
        stats: newStats,
        timestamp: new Date().toISOString()
      },
      success: (res) => {
        console.log('用户统计更新成功', res)
      },
      fail: (err) => {
        console.error('用户统计更新失败', err)
      }
    })
  },

  /**
   * 点击历史记录项
   * @param {Object} e - 事件对象
   */
  onHistoryItemTap(e) {
    const item = e.currentTarget.dataset.item
    const sessionId = item.sessionId
    const isCompleted = item.isCompleted
    
    if (!isCompleted) {
      wx.showModal({
        title: '未完成的学习',
        content: '这是一个未完成的学习记录，是否继续学习？',
        confirmText: '继续学习',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // 继续学习
            wx.navigateTo({
              url: `/pages/learning/learning?sessionId=${sessionId}&resume=true`
            })
          }
        }
      })
    } else {
      // 查看完成的学习报告
      wx.navigateTo({
        url: `/pages/result/result?sessionId=${sessionId}`
      })
    }
    
    app.trackUserBehavior('history_item_tap', {
      sessionId: sessionId,
      isCompleted: isCompleted
    })
  },

  /**
   * 生成思维能力分析文本
   * @returns {string} 分析文本
   */
  generateThinkingAnalysisText() {
    const analysis = this.data.reportData.thinkingAnalysis
    const getLevel = (score) => {
      if (score >= 4) return '优秀'
      if (score >= 3) return '良好'
      if (score >= 2) return '一般'
      return '需要提升'
    }
    
    return `逻辑思维: ${analysis.logicalThinking}/5 (${getLevel(analysis.logicalThinking)})\n\n` +
           `问题解决: ${analysis.problemSolving}/5 (${getLevel(analysis.problemSolving)})\n\n` +
           `表达能力: ${analysis.communication}/5 (${getLevel(analysis.communication)})\n\n` +
           `创新思维: ${analysis.creativity}/5 (${getLevel(analysis.creativity)})`
  },

  /**
   * 生成知识点分析文本
   * @returns {string} 分析文本
   */
  generateKnowledgeAnalysisText() {
    const points = this.data.reportData.knowledgePoints
    if (points.length === 0) {
      return '暂无具体知识点分析数据'
    }
    
    return points.map((point, index) => {
      return `${index + 1}. ${point.name}\n   掌握程度: ${point.mastery}%\n   ${point.description || ''}`
    }).join('\n\n')
  },

  /**
   * 继续学习新题目
   */
  continueLearning() {
    wx.showModal({
      title: '继续学习',
      content: '是否拍摄新题目继续学习？',
      success: (res) => {
        if (res.confirm) {
          wx.navigateTo({
            url: '/pages/camera/camera'
          })
        }
      }
    })
  },

  /**
   * 加载学习历史记录
   */
  loadLearningHistory() {
    // 检查用户是否登录
    if (!app.globalData.userId) {
      // 显示默认空状态或本地数据
      this.setData({
        historyList: [],
        historyStats: {
          completedCount: 0,
          avgScore: 0
        },
        isLoading: false
      });
      return;
    }
    
    wx.cloud.callFunction({
      name: 'getUserHistory',
      data: {
        userId: app.globalData.userId,
        limit: 20 // 限制返回20条记录
      },
      success: (res) => {
        console.log('学习历史加载成功', res)
        
        if (res.result && res.result.success) {
          const historyData = res.result.data
          this.processHistoryData(historyData)
        } else {
          this.handleHistoryLoadError(res.result?.error || '历史记录加载失败')
        }
      },
      fail: (err) => {
        console.error('加载学习历史失败', err)
        this.handleHistoryLoadError('网络错误，请重试')
      }
    })
  },

  /**
   * 处理历史数据
   * @param {Object} historyData - 历史数据
   */
  processHistoryData(historyData) {
    const sessions = historyData.sessions || []
    
    // 处理每个会话的显示数据
    const historyList = sessions.map(session => {
      const createTime = new Date(session.createTime || session.startTime)
      const now = new Date()
      const diffTime = now - createTime
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))
      
      let timeText
      if (diffDays === 0) {
        timeText = '今天'
      } else if (diffDays === 1) {
        timeText = '昨天'
      } else if (diffDays < 7) {
        timeText = `${diffDays}天前`
      } else {
        timeText = createTime.toLocaleDateString('zh-CN')
      }
      
      const startTime = new Date(session.startTime)
      const endTime = new Date(session.endTime || session.updateTime)
      const duration = Math.round((endTime - startTime) / (1000 * 60)) // 分钟
      
      // 生成题目预览文本
      const questionPreview = session.questionText ? 
        (session.questionText.length > 30 ? 
          session.questionText.substring(0, 30) + '...' : 
          session.questionText) : 
        '数学题目'
      
      // 状态处理
      let statusText = ''
      let status = session.status
      if (session.status === 'completed') {
        statusText = '已完成'
        status = 'completed'
      } else if (session.status === 'in_progress') {
        statusText = '进行中'
        status = 'progress'
      } else {
        statusText = '未完成'
        status = 'incomplete'
      }
      
      return {
        id: session._id || session.sessionId,
        sessionId: session.sessionId,
        questionPreview: questionPreview,
        timeText: timeText,
        duration: duration,
        status: status,
        statusText: statusText,
        score: session.finalScore || null,
        isCompleted: session.status === 'completed'
      }
    })
    
    // 计算统计数据
    const completedSessions = sessions.filter(s => s.status === 'completed')
    const totalTime = sessions.reduce((sum, session) => {
      const start = new Date(session.startTime)
      const end = new Date(session.endTime || session.updateTime)
      return sum + Math.round((end - start) / (1000 * 60))
    }, 0)
    
    const averageScore = completedSessions.length > 0 ? 
      Math.round(completedSessions.reduce((sum, s) => sum + (s.finalScore || 0), 0) / completedSessions.length) : 0
    
    this.setData({
      historyList: historyList,
      historyStats: {
        completedCount: completedSessions.length,
        avgScore: averageScore
      },
      isLoading: false
    })
  },

  /**
   * 处理历史加载错误
   * @param {string} errorMsg - 错误信息
   */
  handleHistoryLoadError(errorMsg) {
    this.setData({
      isLoading: false
    })
    
    wx.showModal({
      title: '加载失败',
      content: errorMsg + '\n\n是否重试？',
      confirmText: '重试',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          this.setData({ isLoading: true })
          this.loadLearningHistory()
        } else {
          wx.navigateBack()
        }
      }
    })
  },

  /**
   * 点击历史记录项
   * @param {Object} e - 事件对象
   */
  onHistoryItemTap(e) {
    const sessionId = e.currentTarget.dataset.sessionId
    const isCompleted = e.currentTarget.dataset.completed
    
    if (!isCompleted) {
      wx.showModal({
        title: '未完成的学习',
        content: '这是一个未完成的学习记录，是否继续学习？',
        confirmText: '继续学习',
        cancelText: '查看详情',
        success: (res) => {
          if (res.confirm) {
            // 继续学习
            wx.navigateTo({
              url: `/pages/learning/learning?sessionId=${sessionId}&resume=true`
            })
          } else {
            // 查看详情
            this.viewSessionDetail(sessionId)
          }
        }
      })
    } else {
      // 查看完成的学习报告
      wx.navigateTo({
        url: `/pages/result/result?sessionId=${sessionId}`
      })
    }
    
    app.trackUserBehavior('history_item_tap', {
      sessionId: sessionId,
      isCompleted: isCompleted
    })
  },

  /**
   * 查看会话详情
   * @param {string} sessionId - 会话ID
   */
  viewSessionDetail(sessionId) {
    // 这里可以显示会话的详细信息
    wx.showToast({
      title: '功能开发中',
      icon: 'none'
    })
  },

  /**
   * 查看学习历史（从报告页面跳转）
   */
  viewLearningHistory() {
    app.trackUserBehavior('view_learning_history', {
      sessionId: this.data.sessionId
    })
    
    wx.navigateTo({
      url: '/pages/result/result?mode=history'
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
   * 分享学习成果
   */
  shareResult() {
    app.trackUserBehavior('share_result', {
      sessionId: this.data.sessionId,
      score: this.data.reportData.performance.score
    })
    
    // 微信小程序会自动调用 onShareAppMessage
  },

  /**
   * 保存报告到相册
   */
  saveReportToAlbum() {
    wx.showLoading({
      title: '正在生成图片...'
    })
    
    // 这里可以调用canvas生成报告图片
    // 暂时显示提示
    setTimeout(() => {
      wx.hideLoading()
      wx.showToast({
        title: '功能开发中',
        icon: 'none'
      })
    }, 1000)
    
    app.trackUserBehavior('save_report_to_album', {
      sessionId: this.data.sessionId
    })
  },

  /**
   * 获取星级显示数组
   * @param {number} score - 分数 (0-5)
   * @returns {Array} 星级数组
   */
  getStarArray(score) {
    const stars = []
    for (let i = 1; i <= 5; i++) {
      stars.push({
        filled: i <= score,
        half: i === Math.ceil(score) && score % 1 !== 0
      })
    }
    return stars
  },

  /**
   * 分享到微信
   */
  onShareAppMessage() {
    return {
      title: this.data.shareConfig.title,
      path: `/pages/result/result?sessionId=${this.data.sessionId}`,
      imageUrl: this.data.shareConfig.imageUrl
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: this.data.shareConfig.title,
      imageUrl: this.data.shareConfig.imageUrl
    }
  }
})