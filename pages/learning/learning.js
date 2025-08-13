// pages/learning/learning.js
// 希希数学小助手 学习对话页面逻辑

const app = getApp()

/**
 * 生成唯一ID
 * @returns {string} 唯一标识符
 */
function generateUniqueId() {
  return Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

Page({
  /**
   * 页面的初始数据
   */
  data: {
    sessionId: '', // 学习会话ID
    questionText: '', // 识别出的题目文本
    questionImage: '', // 题目图片
    aiAnalysis: null, // 添加AI分析数据字段
    currentRound: 1, // 当前轮次 (1-3)
    maxRounds: null, // 移除轮次限制（修改：原来是3）
    messages: [], // 对话消息列表
    userInput: '', // 用户输入
    isAIThinking: false, // AI是否正在思考
    isSessionComplete: false, // 会话是否完成
    sessionData: null, // 完整会话数据
    inputPlaceholder: '请输入你的想法...',
    showBackButton: true, // 显示返回首页按钮
    thinkingTexts: [
      'AI正在思考...',
      '正在分析你的回答...',
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
    
    // 检查用户是否登录
    if (!app.globalData.userInfo) {
      wx.showModal({
        title: '需要登录',
        content: '开始学习需要先登录账号',
        confirmText: '去登录',
        cancelText: '返回',
        success: (res) => {
          if (res.confirm) {
            // 跳转到个人资料页面进行登录
            wx.switchTab({
              url: '/pages/profile/profile'
            })
          } else {
            wx.navigateBack()
          }
        }
      })
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
      console.log('从本地存储加载会话', localSession)
      this.initializeSession(localSession)
      return
    }
    
    // 如果本地没有，检查是否是新会话模式
    if (this.data.mode === 'new') {
      // 新会话模式，等待camera页面传递的数据
      console.log('新会话模式，等待数据传递')
      return
    }
    
    // 检查用户是否登录
    if (!app.globalData.userId) {
      app.showError('请先登录')
      wx.navigateBack()
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
        aiAnalysis: existingSession.aiAnalysis, // 添加AI分析数据
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
    
    // 获取AI分析数据中的问题列表
    const aiQuestions = sessionData.aiAnalysis?.questions || []
    
    // 修改AI的初始问候语
    let aiFirstQuestion = '你好！我是希希老师。'
    
    if (sessionData.questionText) {
      if (aiQuestions.length > 0) {
        aiFirstQuestion += aiQuestions[0]
      } else {
        if (sessionData.questionText.includes('解方程') || sessionData.questionText.includes('方程')) {
          aiFirstQuestion += `我看到这是一道解方程的题目：${sessionData.questionText}。让我们一起来解决它！我能先告诉你，这道题要求我们做什么吗？`
        } else if (sessionData.questionText.includes('计算') || sessionData.questionText.includes('求')) {
          aiFirstQuestion += `这是一道计算题：${sessionData.questionText}。你觉得我们应该从哪里开始分析呢？`
        } else {
          aiFirstQuestion += `让我们一起来解决这道数学题：${sessionData.questionText}。你能先读一遍题目，告诉我你的理解吗？`
        }
      }
    } else {
      aiFirstQuestion += '让我们一起来解决这道数学题吧！你能告诉我这道题目要求我们做什么吗？'
    }
    
    // 创建初始消息
    const initialMessages = [
      {
        id: generateUniqueId(),
        type: 'system',
        content: `识别到题目：${sessionData.questionText}`,
        timestamp: new Date().toISOString()
      },
      {
        id: generateUniqueId(),
        type: 'ai',
        content: aiFirstQuestion,
        timestamp: new Date().toISOString(),
        round: 1
      }
    ];
    
    this.setData({
      sessionData: sessionData,
      aiAnalysis: sessionData.aiAnalysis, // 保存AI分析数据
      questionText: sessionData.questionText,
      questionImage: sessionData.questionImage,
      currentRound: sessionData.currentRound || 1,
      maxRounds: sessionData.maxRounds || 3,
      messages: sessionData.messages && sessionData.messages.length > 0 ? sessionData.messages : initialMessages
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
      id: generateUniqueId(), // 添加唯一ID
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
    // 检查用户是否登录
    if (!app.globalData.userId) {
      this.stopThinkingAnimation()
      app.showError('请先登录')
      wx.navigateBack()
      return
    }
    
    wx.cloud.callFunction({
      name: 'handleAnswer',  // ✅ 正确的云函数名称
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
   * 处理AI响应 - 优化版
   * @param {Object} responseData - AI响应数据
   */
  handleAIResponse(responseData) {
    const { feedback, isCompleted, nextQuestion, currentRound } = responseData
    
    // 合并AI的完整回复（避免分段）
    let fullAIResponse = feedback
    if (nextQuestion && !isCompleted) {
      fullAIResponse += '\n\n' + nextQuestion
    }
    
    // 添加AI响应消息（单条完整消息）
    const aiMessage = {
      id: generateUniqueId(),
      type: 'ai',
      content: fullAIResponse,
      timestamp: new Date().toISOString(),
      round: this.data.currentRound,
      isCompleted: isCompleted
    }
    
    const newMessages = [...this.data.messages, aiMessage]
    
    if (isCompleted) {
      // 会话完成
      this.setData({
        messages: newMessages,
        isSessionComplete: true,
        inputPlaceholder: '学习已完成！点击查看报告'
      })
      
      // 自动保存到历史记录
      this.saveToHistory()
      
      // 显示完成提示
      setTimeout(() => {
        wx.showModal({
          title: '学习完成',
          content: '恭喜完成学习！如有其他问题请重新拍照。',
          showCancel: false,
          confirmText: '查看报告',
          success: () => {
            this.goToResult()
          }
        })
      }, 1000)
    } else {
      this.setData({
        messages: newMessages,
        currentRound: currentRound,
        inputPlaceholder: `第${currentRound}轮：请输入你的想法...`
      })
    }
    
    // 滚动到底部
    setTimeout(() => {
      this.scrollToBottom()
    }, 100)
  },
  
  /**
   * 返回首页
   */
  goToHome() {
    wx.showModal({
      title: '确认返回',
      content: '返回首页后当前学习进度将会保存，下次可以继续学习',
      confirmText: '返回首页',
      cancelText: '继续学习',
      success: (res) => {
        if (res.confirm) {
          // 保存当前进度
          this.saveProgress()
          
          app.trackUserBehavior('go_to_home', {
            sessionId: this.data.sessionId,
            round: this.data.currentRound
          })
          
          // 返回首页
          wx.switchTab({
            url: '/pages/index/index'
          })
        }
      }
    })
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
   * 滚动到消息底部 - 优化版
   */
  scrollToBottom() {
    // 使用scroll-view的scroll-into-view属性更稳定
    this.setData({
      scrollIntoView: `message-${this.data.messages.length - 1}`
    })
    
    // 备用方案：使用页面滚动
    setTimeout(() => {
      wx.createSelectorQuery().select('#messages-container').boundingClientRect((rect) => {
        if (rect) {
          wx.pageScrollTo({
            scrollTop: rect.bottom + 200, // 额外留出输入框空间
            duration: 300
          })
        }
      }).exec()
    }, 100)
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
    
    // 检查用户是否登录
    if (!app.globalData.userId) {
      console.log('用户未登录，仅保存到本地')
      return;
    }
    
    // 保存到云端 - 修复：使用正确的云函数和参数
    wx.cloud.callFunction({
      name: 'dataService',
      data: {
        action: 'updateSessionProgress', // 新增：指定操作类型
        data: {
          sessionId: this.data.sessionId,
          userId: app.globalData.userId,
          dialogue: this.data.messages, // 修改：使用 dialogue 而不是 progressData
          currentRound: this.data.currentRound
        }
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
   * 保存到历史记录
   */
  saveToHistory() {
    const historyItem = {
      sessionId: this.data.sessionId,
      questionText: this.data.questionText,
      questionImage: this.data.questionImage,
      messages: this.data.messages,
      timestamp: new Date().toISOString(),
      isComplete: this.data.isSessionComplete,
      currentRound: this.data.currentRound,
      summary: this.generateSummary()
    }
    
    // 保存到本地历史记录
    let learningHistory = wx.getStorageSync('learningHistory') || []
    
    // 检查是否已存在，避免重复
    const existingIndex = learningHistory.findIndex(item => item.sessionId === this.data.sessionId)
    if (existingIndex >= 0) {
      learningHistory[existingIndex] = historyItem
    } else {
      learningHistory.unshift(historyItem) // 添加到开头
    }
    
    // 限制历史记录数量
    if (learningHistory.length > 50) {
      learningHistory = learningHistory.slice(0, 50)
    }
    
    wx.setStorageSync('learningHistory', learningHistory)
    
    // 如果用户已登录，同步到云端
    if (app.globalData.userId) {
      this.syncToCloud(historyItem)
    }
  },
  
  /**
   * 生成会话摘要
   */
  generateSummary() {
    const questionText = this.data.questionText
    if (questionText.length > 20) {
      return questionText.substring(0, 20) + '...'
    }
    return questionText || '数学题解答'
  },
  
  /**
   * 页面卸载时清理资源 - 增强版
   */
  onUnload() {
    // 清理定时器
    this.stopThinkingAnimation()
    
    // 自动保存进度和历史记录
    if (!this.data.isSessionComplete) {
      this.saveProgress()
    }
    
    // 总是保存到历史记录
    this.saveToHistory()
  },

  /**
   * 复制消息内容
   * @param {Object} e - 事件对象
   */
  copyMessage(e) {
    const content = e.currentTarget.dataset.content
    wx.setClipboardData({
      data: content,
      success: () => {
        wx.showToast({
          title: '已复制到剪贴板',
          icon: 'success'
        })
      }
    })
  },

  /**
   * 编辑消息
   * @param {Object} e - 事件对象
   */
  editMessage(e) {
    const { id, content } = e.currentTarget.dataset
    
    wx.showModal({
      title: '编辑回答',
      editable: true,
      placeholderText: '请输入新的回答...',
      content: content,
      success: (res) => {
        if (res.confirm && res.content.trim()) {
          this.updateMessage(id, res.content.trim())
        }
      }
    })
  },

  /**
   * 重新发送消息
   * @param {Object} e - 事件对象
   */
  resendMessage(e) {
    const { id, content } = e.currentTarget.dataset
    
    wx.showModal({
      title: '重新发送',
      content: `确定要重新发送这条消息吗？\n\n"${content}"`,
      success: (res) => {
        if (res.confirm) {
          // 删除该消息之后的所有对话
          this.rollbackToMessage(id)
          // 重新发送
          this.setData({ userInput: content })
          this.sendAnswer()
        }
      }
    })
  },

  /**
   * 更新消息内容
   * @param {string} messageId - 消息ID
   * @param {string} newContent - 新内容
   */
  updateMessage(messageId, newContent) {
    const messages = this.data.messages.map(msg => {
      if (msg.id === messageId) {
        return { ...msg, content: newContent, edited: true }
      }
      return msg
    })
    
    this.setData({ messages })
    this.saveProgress()
    
    wx.showToast({
      title: '消息已更新',
      icon: 'success'
    })
  },

  /**
   * 回退到指定消息
   * @param {string} messageId - 消息ID
   */
  rollbackToMessage(messageId) {
    const messageIndex = this.data.messages.findIndex(msg => msg.id === messageId)
    if (messageIndex !== -1) {
      const newMessages = this.data.messages.slice(0, messageIndex + 1)
      const lastUserMessage = newMessages.filter(msg => msg.type === 'user').pop()
      const currentRound = lastUserMessage ? lastUserMessage.round : 1
      
      this.setData({
        messages: newMessages,
        currentRound: currentRound,
        isSessionComplete: false
      })
      
      this.saveProgress()
    }
  }
})