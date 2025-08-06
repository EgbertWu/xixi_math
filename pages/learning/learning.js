// pages/learning/learning.js
// 希希数学小助手 学习对话页面逻辑

const app = getApp()

Page({
  /**
   * 页面的初始数据
   */
  data: {
    sessionId: '', // 学习会话ID
    questionText: '', // 识别出的题目文本
    questionImage: '', // 题目图片
    currentRound: 1, // 当前轮次 (1-3)
    maxRounds: 3, // 最大轮次
    messages: [], // 对话消息列表
    userInput: '', // 用户输入
    isAIThinking: false, // AI是否正在思考
    isSessionComplete: false, // 会话是否完成
    sessionData: null, // 完整会话数据
    inputPlaceholder: '请输入你的想法...',
    thinkingTexts: [
      'AI老师正在思考...',
      '正在分析你的回答...',
      '准备下一个启发性问题...'
    ],
    currentThinkingIndex: 0
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('学习页面加载', options)
    
    const sessionId = options.sessionId
    const mode = options.mode || 'new' // new: 新会话, continue: 继续会话
    
    if (!sessionId) {
      app.showError('会话ID缺失')
      wx.navigateBack()
      return
    }
    
    this.setData({ 
      sessionId,
      mode 
    })
    
    // 根据模式加载会话数据
    if (mode === 'continue') {
      this.loadExistingSession()
    } else {
      this.loadSessionData()
    }
    
    // 记录页面访问
    app.trackUserBehavior('page_visit', {
      page: 'learning',
      sessionId: sessionId,
      mode: mode
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 滚动到底部显示最新消息
    this.scrollToBottom()
  },

  /**
   * 加载会话数据
   * 从本地存储或云端获取会话信息
   */
  loadSessionData() {
    // 先从本地存储获取
    const localSession = wx.getStorageSync('currentSession')
    if (localSession && localSession.sessionId === this.data.sessionId) {
      this.initializeSession(localSession)
      return
    }
    
    // 从云端获取会话数据
    wx.cloud.callFunction({
      name: 'getSession',
      data: {
        sessionId: this.data.sessionId,
        userId: app.globalData.userId
      },
      success: (res) => {
        if (res.result && res.result.success) {
          this.initializeSession(res.result.data)
        } else {
          app.showError('加载会话失败')
          wx.navigateBack()
        }
      },
      fail: (err) => {
        console.error('获取会话数据失败', err)
        app.showError('网络错误，请重试')
        wx.navigateBack()
      }
    })
  },

  /**
   * 加载已存在的会话（继续对话模式）
   */
  loadExistingSession() {
    // 从本地存储获取学习历史
    const learningHistory = wx.getStorageSync('learningHistory') || []
    const existingSession = learningHistory.find(item => item.sessionId === this.data.sessionId)
    
    if (existingSession) {
      this.setData({
        sessionData: existingSession,
        questionText: existingSession.questionText,
        questionImage: existingSession.questionImage,
        messages: existingSession.messages || [],
        currentRound: existingSession.currentRound || 1,
        isSessionComplete: existingSession.isComplete || false
      })
      
      // 滚动到底部
      setTimeout(() => {
        this.scrollToBottom()
      }, 100)
    } else {
      app.showError('找不到对话记录')
      wx.navigateBack()
    }
  },

  /**
   * 初始化学习会话
   * @param {Object} sessionData - 会话数据
   */
  initializeSession(sessionData) {
    console.log('初始化会话', sessionData)
    
    this.setData({
      sessionData: sessionData,
      questionText: sessionData.questionText,
      questionImage: sessionData.questionImage,
      messages: [
        {
          type: 'system',
          content: `识别到题目：${sessionData.questionText}`,
          timestamp: new Date().toISOString()
        },
        {
          type: 'ai',
          content: sessionData.firstQuestion,
          timestamp: new Date().toISOString(),
          round: 1
        }
      ]
    })
    
    // 滚动到底部
    setTimeout(() => {
      this.scrollToBottom()
    }, 100)
  },

  /**
   * 处理用户输入变化
   * @param {Object} e - 事件对象
   */
  onInputChange(e) {
    this.setData({
      userInput: e.detail.value
    })
  },

  /**
   * 发送用户回答
   */
  sendAnswer() {
    const userInput = this.data.userInput.trim()
    if (!userInput) {
      app.showError('请输入你的回答')
      return
    }
    
    // 添加用户消息到对话列表
    const userMessage = {
      type: 'user',
      content: userInput,
      timestamp: new Date().toISOString(),
      round: this.data.currentRound
    }
    
    this.setData({
      messages: [...this.data.messages, userMessage],
      userInput: '',
      isAIThinking: true,
      currentThinkingIndex: 0
    })
    
    // 记录用户回答
    app.trackUserBehavior('user_answer', {
      sessionId: this.data.sessionId,
      round: this.data.currentRound,
      answerLength: userInput.length
    })
    
    // 滚动到底部
    this.scrollToBottom()
    
    // 开始思考动画
    this.startThinkingAnimation()
    
    // 发送到AI处理
    this.processUserAnswer(userInput)
  },

  /**
   * 开始AI思考动画
   */
  startThinkingAnimation() {
    this.thinkingTimer = setInterval(() => {
      const nextIndex = (this.data.currentThinkingIndex + 1) % this.data.thinkingTexts.length
      this.setData({
        currentThinkingIndex: nextIndex
      })
    }, 2000)
  },

  /**
   * 停止AI思考动画
   */
  stopThinkingAnimation() {
    if (this.thinkingTimer) {
      clearInterval(this.thinkingTimer)
      this.thinkingTimer = null
    }
    this.setData({
      isAIThinking: false
    })
  },

  /**
   * 处理用户回答，获取AI响应
   * @param {string} userAnswer - 用户回答
   */
  processUserAnswer(userAnswer) {
    wx.cloud.callFunction({
      name: 'processAnswer',
      data: {
        sessionId: this.data.sessionId,
        userAnswer: userAnswer,
        currentRound: this.data.currentRound,
        userId: app.globalData.userId,
        timestamp: new Date().toISOString()
      },
      success: (res) => {
        this.stopThinkingAnimation()
        
        if (res.result && res.result.success) {
          const responseData = res.result.data
          this.handleAIResponse(responseData)
        } else {
          this.handleAIError(res.result?.error || 'AI处理失败')
        }
      },
      fail: (err) => {
        console.error('处理回答失败', err)
        this.stopThinkingAnimation()
        this.handleAIError('网络错误，请重试')
      }
    })
  },

  /**
   * 处理AI响应
   * @param {Object} responseData - AI响应数据
   */
  handleAIResponse(responseData) {
    const { aiResponse, isComplete, nextQuestion } = responseData
    
    // 添加AI响应消息
    const aiMessage = {
      type: 'ai',
      content: aiResponse,
      timestamp: new Date().toISOString(),
      round: this.data.currentRound
    }
    
    const newMessages = [...this.data.messages, aiMessage]
    
    if (isComplete) {
      // 会话完成
      this.setData({
        messages: newMessages,
        isSessionComplete: true,
        inputPlaceholder: '学习已完成'
      })
      
      // 记录会话完成
      app.trackUserBehavior('session_complete', {
        sessionId: this.data.sessionId,
        totalRounds: this.data.currentRound
      })
      
      // 延迟跳转到结果页面
      setTimeout(() => {
        this.goToResult()
      }, 2000)
    } else {
      // 继续下一轮
      const nextRound = this.data.currentRound + 1
      
      // 如果有下一个问题，添加到消息列表
      if (nextQuestion) {
        newMessages.push({
          type: 'ai',
          content: nextQuestion,
          timestamp: new Date().toISOString(),
          round: nextRound
        })
      }
      
      this.setData({
        messages: newMessages,
        currentRound: nextRound,
        inputPlaceholder: `第${nextRound}轮：请输入你的想法...`
      })
    }
    
    // 滚动到底部
    setTimeout(() => {
      this.scrollToBottom()
    }, 100)
  },

  /**
   * 处理AI错误
   * @param {string} errorMsg - 错误信息
   */
  handleAIError(errorMsg) {
    wx.showModal({
      title: 'AI响应失败',
      content: errorMsg + '\n\n是否重试？',
      confirmText: '重试',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          // 重新发送最后一条用户消息
          const lastUserMessage = this.data.messages.filter(msg => msg.type === 'user').pop()
          if (lastUserMessage) {
            this.processUserAnswer(lastUserMessage.content)
          }
        } else {
          wx.navigateBack()
        }
      }
    })
  },

  /**
   * 滚动到消息底部
   */
  scrollToBottom() {
    wx.createSelectorQuery().select('#messages-container').boundingClientRect((rect) => {
      if (rect) {
        wx.pageScrollTo({
          scrollTop: rect.bottom,
          duration: 300
        })
      }
    }).exec()
  },

  /**
   * 跳转到结果页面
   */
  goToResult() {
    wx.redirectTo({
      url: `/pages/result/result?sessionId=${this.data.sessionId}`
    })
  },

  /**
   * 查看题目图片
   */
  previewImage() {
    if (this.data.questionImage) {
      wx.previewImage({
        urls: [this.data.questionImage],
        current: this.data.questionImage
      })
    }
  },

  /**
   * 获取帮助提示
   */
  getHint() {
    wx.showModal({
      title: '学习提示',
      content: '这是一个启发式学习过程：\n\n1. 仔细思考AI老师的问题\n2. 用自己的话表达想法\n3. 不要害怕犯错，错误也是学习\n4. 尝试解释你的思考过程',
      showCancel: false,
      confirmText: '我知道了'
    })
    
    app.trackUserBehavior('get_hint', {
      sessionId: this.data.sessionId,
      round: this.data.currentRound
    })
  },

  /**
   * 退出学习
   */
  exitLearning() {
    wx.showModal({
      title: '确认退出',
      content: '退出后当前学习进度将会保存，下次可以继续学习',
      confirmText: '退出',
      cancelText: '继续学习',
      success: (res) => {
        if (res.confirm) {
          // 保存当前进度
          this.saveProgress()
          
          app.trackUserBehavior('exit_learning', {
            sessionId: this.data.sessionId,
            round: this.data.currentRound
          })
          
          wx.navigateBack()
        }
      }
    })
  },

  /**
   * 保存学习进度
   */
  saveProgress() {
    const progressData = {
      sessionId: this.data.sessionId,
      currentRound: this.data.currentRound,
      messages: this.data.messages,
      timestamp: new Date().toISOString()
    }
    
    // 保存到本地
    wx.setStorageSync('learningProgress', progressData)
    
    // 保存到云端
    wx.cloud.callFunction({
      name: 'saveProgress',
      data: {
        userId: app.globalData.userId,
        progressData: progressData
      },
      success: (res) => {
        console.log('进度保存成功', res)
      },
      fail: (err) => {
        console.error('进度保存失败', err)
      }
    })
  },

  /**
   * 页面卸载时清理资源
   */
  onUnload() {
    // 清理定时器
    this.stopThinkingAnimation()
    
    // 自动保存进度
    if (!this.data.isSessionComplete) {
      this.saveProgress()
    }
  }
})