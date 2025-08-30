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
    // 修改原因：删除历史记录相关字段 mode、historyList、historyStats，简化数据结构
  },

  /**
   * 生命周期函数--监听页面加载
   * 修改原因：删除历史记录模式判断，统一显示综合学习报告，不再显示历史记录列表
   */
  onLoad(options) {
    console.log('结果页面加载', options)
    
    // 修改原因：删除mode参数判断，统一显示综合学习报告
    // 不再支持历史记录模式，页面始终显示综合报告内容
    this.setData({ 
      mode: 'userReport',
      isLoading: true 
    })
    this.loadLearningReport()
    
    // 记录页面访问
    app.trackUserBehavior('page_visit', {
      page: 'result',
      mode: 'userReport'
    })
  },

  /**
   * 加载学习报告
   * 修改原因：从生成单个会话报告改为生成用户综合学习报告
   * 从云端获取AI生成的综合学习报告
   */
  loadLearningReport() {
    wx.cloud.callFunction({
      name: 'reportService',  // ✅ 调用 reportService 云函数
      data: {
        action: 'generateUserReport',   // ✅ 修改：调用综合报告生成操作
        data: {
          openid: app.globalData.openid,  // ✅ 修改：传递用户openid而不是sessionId
          timestamp: new Date().toISOString()
        }
      },
      success: (res) => {
        console.log('综合学习报告生成成功', res)
        
        if (res.result && res.result.success) {
          const reportData = res.result.data
          this.processUserReportData(reportData)  // ✅ 修改：调用新的处理函数
        } else {
          this.handleLoadError(res.result?.error || '报告生成失败')
        }
      },
      fail: (err) => {
        console.error('加载综合学习报告失败', err)
        this.handleLoadError('网络错误，请重试')
      }
    })
  },

  /**
   * 处理报告数据
   * 处理用户综合报告数据
   * 修改原因：新增方法处理综合学习报告的数据结构
   * @param {Object} reportData - 从云端获取的综合报告数据
   */
  processUserReportData(reportData) {
    // 修改原因：调整数据映射，确保与数据库返回的数据结构匹配
    
    // 从 reportData 中提取实际数据
    const actualData = reportData.reportData || reportData
    const summary = actualData.summary || {}
    const timeAnalysis = actualData.timeAnalysis || {}
    const longestThinking = actualData.longestThinking || {}
    
    // 计算综合得分（基于完成率和平均时间）
    const calculateScore = () => {
      const completionRate = summary.completionRate || 0
      const avgTime = timeAnalysis.averageMinutes || 0
      // 基础分数基于完成率
      let score = completionRate * 0.6
      // 时间效率加分（1-3分钟为最佳）
      if (avgTime >= 1 && avgTime <= 3) {
        score += 30
      } else if (avgTime <= 5) {
        score += 20
      } else {
        score += 10
      }
      // 会话数量加分
      const sessionBonus = Math.min(summary.completedSessions * 2, 10)
      score += sessionBonus
      
      return Math.min(Math.round(score), 100)
    }

    const score = calculateScore()
    
    /**
     * 根据分数计算中文等级
     * 修改原因：将英文等级改为中文等级（优、良、中）
     */
    const calculateChineseLevel = (score) => {
      if (score >= 85) {
        return '优秀'
      } else if (score >= 70) {
        return '良好'
      } else {
        return '中等'
      }
    }

    // 生成优势和改进建议
    const generatePerformanceAnalysis = () => {
      const strengths = []
      const improvements = []
      
      if (summary.completionRate >= 80) {
        strengths.push('学习完成度很高，坚持性很好')
      }
      if (timeAnalysis.averageMinutes <= 3) {
        strengths.push('解题效率很高，思路清晰')
      }
      if (summary.completedSessions >= 5) {
        strengths.push('学习频次合适，形成了良好的学习习惯')
      }
      
      if (summary.completionRate < 60) {
        improvements.push('建议提高学习完成度，坚持完成每个学习任务')
      }
      if (timeAnalysis.averageMinutes > 5) {
        improvements.push('可以尝试先理解题目要求，再开始解答')
      }
      if (summary.completedSessions < 3) {
        improvements.push('建议增加学习频次，保持学习的连续性')
      }
      
      return { strengths, improvements }
    }
    
    const performanceAnalysis = generatePerformanceAnalysis()
    
    // 生成思维能力分析（基于学习数据推算）
    const generateThinkingAnalysis = () => {
      const baseScore = Math.min(Math.floor(score / 20), 5)
      return {
        logicalThinking: Math.max(baseScore, 3),
        problemSolving: Math.max(baseScore, 3),
        communication: Math.max(baseScore - 1, 2),
        creativity: Math.max(baseScore - 1, 2)
      }
    }
    
    // 更新页面数据
    this.setData({
      reportData: {
        ...this.data.reportData,
        // 基本信息
        questionText: `综合学习报告 (共${summary.completedSessions}道题目)`,
        totalTime: summary.totalLearningTime || 0,
        totalLearningTime: summary.totalLearningTime || 0,
        completedSessions: summary.completedSessions || 0,
        
        // 学习表现
        performance: {
          score: score,
          level: calculateChineseLevel(score), // 修改：使用中文等级
          chineseLevel: calculateChineseLevel(score), // 新增：专门的中文等级字段
          strengths: performanceAnalysis.strengths,
          improvements: performanceAnalysis.improvements
        },
        
        // 思维能力分析
        thinkingAnalysis: generateThinkingAnalysis(),
        
        // 最长会话信息
        longestSession: {
          questionText: longestThinking.questionText || '暂无数据'
        },
        
        // 学习建议
        suggestions: actualData.suggestions || [],
        
        // 知识点（使用薄弱点分析）
        knowledgePoints: actualData.weaknessAnalysis?.commonIssues?.map(issue => ({
          name: issue,
          mastery: 60 // 默认掌握度
        })) || [],
        
        // 下一步计划（基于建议生成）
        nextSteps: actualData.suggestions?.slice(0, 3).map((suggestion, index) => 
          `第${index + 1}步：${suggestion}`
        ) || [],
        
        // 生成时间
        generateTime: actualData.generateTime || new Date().toLocaleString('zh-CN')
      },
      
      shareConfig: {
        title: `我在希希数学小助手完成了${summary.completedSessions}道数学题，等级${calculateChineseLevel(score)}！`, // 修改：分享标题使用等级
        desc: `通过AI启发式教学，提升了数学思维能力`,
        imageUrl: '/images/share-result.png'
      },
      
      isLoading: false
    })
    
    // 更新用户学习统计
    this.updateUserStats()
    
    // 记录综合报告生成成功
    app.trackUserBehavior('user_report_generated', {
      totalSessions: summary.completedSessions,
      score: score,
      totalTime: summary.totalLearningTime
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
   * 修改原因：调用updateUserStats云函数重新计算统计数据，确保数据准确性
   */
  updateUserStats() {
    // 检查用户是否登录
    if (!app.globalData.openid) {
      console.log('用户未登录，跳过统计更新')
      return
    }
    
    // 调用云函数重新计算统计数据
    wx.cloud.callFunction({
      name: 'updateUserStats',
      data: {
        openid: app.globalData.openid,
        forceUpdate: true
      },
      success: (res) => {
        console.log('用户统计更新成功', res)
        
        if (res.result && res.result.success) {
          const stats = res.result.data.stats
          
          // 更新本地缓存
          wx.setStorageSync('learningStats', {
            totalQuestions: stats.totalQuestions || 0,
            completedSessions: stats.completedSessions || 0,
            learningTime: stats.learningTime || 0,
            averageScore: stats.averageScore || 0,
            streak: stats.streak || 0,
            totalDays: stats.totalDays || 0
          })
          
          console.log('本地统计数据已更新:', stats)
        }
      },
      fail: (err) => {
        console.error('用户统计更新失败', err)
        // 降级处理：仍然更新本地数据
        const currentStats = wx.getStorageSync('learningStats') || {
          totalQuestions: 0,
          completedSessions: 0,
          learningTime: 0
        }
        
        const newStats = {
          totalQuestions: currentStats.totalQuestions + 1,
          completedSessions: currentStats.completedSessions + 1,
          learningTime: currentStats.learningTime + Math.round((this.data.reportData.totalTime || 0) / 60)
        }
        
        wx.setStorageSync('learningStats', newStats)
        console.log('降级到本地统计更新:', newStats)
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
      // 修改原因：删除单个会话报告查看，改为显示会话详情
      wx.showModal({
        title: '已完成的学习',
        content: '这是一个已完成的学习记录，可以重新学习类似题目。',
        confirmText: '重新学习',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // 跳转到首页重新开始学习
            wx.switchTab({
              url: '/pages/index/index'
            })
          }
        }
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
   * 继续学习 - 直接跳转到拍照页面
   * 修改原因：简化用户操作流程，直接进入拍照页面开始新的学习
   */
  continueNewLearning() {
    app.trackUserBehavior('continue_learning', {
      source: 'result_page'
    })
    
    wx.navigateTo({
      url: '/pages/camera/camera'
    })
  },

  /**
   * 分享报告到相册或微信
   * 修改原因：支持多种分享方式，包括朋友圈和微信好友
   */
  saveReportToAlbum() {
    const that = this
    
    wx.showActionSheet({
      itemList: ['转发给好友', '保存到相册'],
      success(res) {
        switch(res.tapIndex) {
          case 0:
            // 转发给好友 - 显示分享菜单
            wx.showShareMenu({
              withShareTicket: true,
              menus: ['shareAppMessage', 'shareTimeline']
            })
            // 提示用户点击右上角分享
            wx.showToast({
              title: '请点击右上角分享按钮',
              icon: 'none',
              duration: 2000
            })
            break
          case 1:
            // 保存到相册
            that.saveImageToAlbum()
            break
        }
      }
    })
    
    app.trackUserBehavior('share_report_action', {
      sessionId: this.data.sessionId
    })
  },

  /**
   * 保存图片到相册
   * 修改原因：保留原有的保存到相册功能
   */
  saveImageToAlbum() {
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
    
    app.trackUserBehavior('save_to_album', {
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