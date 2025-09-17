// pages/learning/learning.js
// 希希学习小助手 学习对话页面逻辑

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
    inputPlaceholder: '请输入消息...',
    showBackButton: true, // 显示返回首页按钮
    isReadOnly: false, // 新增：是否为只读模式（用于已完成的历史记录）
    isHistoryMode: false, // 新增：是否为历史模式
    thinkingTexts: [
      'AI正在思考...',
      '正在分析你的回答...',
    ],
    currentThinkingIndex: 0,
    // 分段响应配置
    streamConfig: {
      typewriterSpeed: 40, // 打字机速度（毫秒/字符）
      segmentDelay: 200, // 段落间隔时间（毫秒）
      enableTypewriter: true // 是否启用打字机效果
    }
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('学习页面加载', options)
    
    const sessionId = options.sessionId
    const mode = options.mode || 'new' // new: 新会话, continue: 继续会话, history: 历史记录
    
    if (!sessionId) {
      app.showError('会话ID缺失')
      wx.navigateBack()
      return
    }
    
    // 修改原因：统一检查登录状态，确保openid和userInfo都存在
    if (!app.isUserLogin()) {
      app.requireLogin('开始学习需要先登录账号', () => {
        // 登录成功后重新加载页面数据
        this.setData({ 
          sessionId,
          mode,
          isHistoryMode: mode === 'history'
        })
        
        if (mode === 'continue' || mode === 'history') {
          this.loadSessionFromCloud()
        } else {
          this.loadSessionData()
        }
      })
      return
    }
    
    this.setData({ 
      sessionId,
      mode,
      isHistoryMode: mode === 'history'
    })
    
    // 根据模式加载会话数据
    if (mode === 'continue' || mode === 'history') {
      this.loadSessionFromCloud()
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
    if (!app.globalData.openid) {
      app.showError('请先登录')
      wx.navigateBack()
      return
    }
    
    // 从云端获取会话数据
    wx.cloud.callFunction({
      name: 'dataService',  // 使用dataService云函数
      data: {
        action: 'getSessionData',  // 指定操作类型
        data: {
          sessionId: this.data.sessionId
        },
        openid: app.globalData.openid  // 传递openid参数
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
   * 从云端加载会话数据
   */
  async loadSessionFromCloud() {
    console.log('开始从云端加载会话数据，sessionId:', this.data.sessionId);
    
    // 检查sessionId是否有效
    if (!this.data.sessionId) {
      console.error('sessionId为空，无法加载会话数据');
      wx.showToast({
        title: '会话ID无效',
        icon: 'error'
      });
      wx.navigateBack();
      return;
    }

    // 修改原因：确保openid存在且有效
    if (!app.globalData.openid) {
      console.error('openid为空，用户未登录');
      app.showError('请先登录')
      wx.navigateBack()
      return
    }

    wx.showLoading({ title: '加载中...' })

    try {
      // 修改原因：添加更详细的日志，确保openid正确传递
      console.log('准备调用云函数，参数:', {
        sessionId: this.data.sessionId,
        openid: app.globalData.openid,
        openidType: typeof app.globalData.openid,
        openidLength: app.globalData.openid ? app.globalData.openid.length : 0
      })
      
      const result = await wx.cloud.callFunction({
        name: 'dataService',
        data: {
          action: 'getSessionData',
          data: {
            sessionId: this.data.sessionId
          },
          openid: app.globalData.openid  // 确保openid作为独立参数传递
        }
      })
      
      console.log('云函数返回结果:', result)
      
      if (result.result && result.result.success) {
        const sessionData = result.result.data
        console.log('会话数据:', sessionData)
        
        // 修改原因：设置完整的会话数据，包括dialogue和messages字段的兼容处理
        this.setData({
          sessionData: sessionData,
          aiAnalysis: sessionData.aiAnalysis,
          messages: sessionData.dialogue || sessionData.messages || [],
          questionText: sessionData.questionText || '',
          questionImage: sessionData.questionImage || '',
          currentRound: sessionData.currentRound || 1,
          isSessionComplete: sessionData.isComplete || false,
          isReadOnly: sessionData.status === 'completed',
          isHistoryMode: this.data.mode === 'history'
        })
        
        wx.hideLoading()
        this.scrollToBottom()
      } else {
        console.error('云函数返回失败:', result.result)
        wx.hideLoading()
        
        // 修改原因：根据错误类型提供更具体的错误信息
        let errorMsg = '加载会话失败'
        if (result.result && result.result.error) {
          if (result.result.error.includes('USER_NOT_LOGGED_IN')) {
            errorMsg = '用户未登录，请重新登录'
            // 清除可能无效的登录状态
            app.globalData.isLogin = false
            app.globalData.userInfo = null
          } else if (result.result.error.includes('SESSION_NOT_FOUND')) {
            errorMsg = '会话不存在或已被删除'
          }
        }
        
        wx.showToast({
          title: errorMsg,
          icon: 'none'
        })
        
        setTimeout(() => {
          wx.navigateBack()
        }, 2000)
      }
    } catch (error) {
      console.error('调用云函数失败:', error)
      wx.hideLoading()
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'none'
      })
      
      setTimeout(() => {
        wx.navigateBack()
      }, 2000)
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
    // 检查是否为只读模式
    if (this.data.isReadOnly) {
      wx.showToast({
        title: '该记录已完成，无法继续输入',
        icon: 'none'
      })
      return
    }
    
    const userInput = this.data.userInput.trim()
    if (!userInput) {
      wx.showToast({
        title: '请输入内容',
        icon: 'none'
      })
      return
    }
    
    // 检查会话是否已完成
    if (this.data.isSessionComplete) {
      wx.showToast({
        title: '学习已完成',
        icon: 'none'
      })
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
   * 处理用户回答，获取AI响应（流式版本）
   * @param {string} userAnswer - 用户回答
   */
  processUserAnswer(userAnswer) {
    console.log('开始处理用户回答:', userAnswer);
    
    // 检查用户是否登录
    if (!app.globalData.openid) {
      this.stopThinkingAnimation()
      app.showError('请先登录')
      wx.navigateBack()
      return
    }
    
    // 检查sessionId是否有效
    if (!this.data.sessionId) {
      console.error('sessionId为空，无法处理用户回答');
      this.stopThinkingAnimation();
      wx.showToast({
        title: '会话ID无效',
        icon: 'error'
      });
      return;
    }
    
    // 创建AI消息占位符
    const aiMessageId = generateUniqueId()
    const aiMessage = {
      id: aiMessageId,
      type: 'ai',
      content: '',
      timestamp: new Date().toISOString(),
      round: this.data.currentRound,
      isStreaming: true // 标记为流式消息
    }
    
    // 添加AI消息占位符到消息列表
    const newMessages = [...this.data.messages, aiMessage]
    this.setData({
      messages: newMessages,
      scrollIntoView: `message-${newMessages.length - 1}`
    })
    
    console.log('准备调用handleAnswer云函数，参数:', {
      sessionId: this.data.sessionId,
      userAnswer: userAnswer,
      currentRound: this.data.currentRound,
      openid: app.globalData.openid
    });
    
    // 调用云函数
    wx.cloud.callFunction({
      name: 'handleAnswer',  // ✅ 正确的云函数名称
      data: {
        sessionId: this.data.sessionId,
        userAnswer: userAnswer,
        currentRound: this.data.currentRound,
        openid: app.globalData.openid,
        timestamp: new Date().toISOString(),
        streamMode: true // 启用流式模式
      },
      success: (res) => {
        console.log('handleAnswer云函数调用成功:', res);
        this.stopThinkingAnimation()
        
        if (res.result && res.result.success) {
          const responseData = res.result.data
          // 更新流式消息为完整消息
          this.updateStreamingMessage(aiMessageId, responseData)
        } else {
          console.error('AI处理失败:', res.result);
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
   * 更新流式消息为完整消息
   * @param {string} messageId - 消息ID
   * @param {Object} responseData - AI响应数据
   */
  updateStreamingMessage(messageId, responseData) {
    console.log('[分段响应] 更新流式消息:', { messageId, streamMode: responseData.streamMode, hasMore: responseData.hasMore })
    
    // 检查是否为分段响应
    if (responseData.streamMode && responseData.hasMore) {
      console.log('[分段响应] 检测到分段响应，开始处理')
      // 处理分段响应
      this.handleSegmentedResponse(messageId, responseData)
      return
    }
    
    // 检查是否为分段响应的第一段（没有更多段落）
    if (responseData.streamMode && !responseData.hasMore) {
      console.log('[分段响应] 检测到单段响应，直接处理')
      this.handleSegmentedResponse(messageId, responseData)
      return
    }
    
    const feedback = responseData.feedback || ''
    const isCompleted = responseData.isCompleted || false
    const nextQuestion = responseData.nextQuestion || ''
    const currentRound = responseData.currentRound || this.data.currentRound
    const answerCorrect = responseData.answerCorrect || false
    
    // 合并AI的完整回复
    let fullAIResponse = feedback
    if (nextQuestion && !isCompleted) {
      fullAIResponse += '\n\n' + nextQuestion
    }
    
    // 如果学习完成且答案正确，添加查看报告的提示
    if (isCompleted && answerCorrect) {
      fullAIResponse += '\n\n🎉 恭喜完成了解题！点击下方链接查看详细的学习报告。'
    }
    
    // 更新消息内容
    const updatedMessages = this.data.messages.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          content: fullAIResponse,
          isCompleted: isCompleted,
          showReportLink: isCompleted && answerCorrect,
          isStreaming: false // 结束流式状态
        }
      }
      return msg
    })
    
    this.setData({
      messages: updatedMessages,
      isSessionComplete: isCompleted,
      currentRound: isCompleted ? this.data.currentRound : currentRound,
      inputPlaceholder: isCompleted ? '学习已完成！' : `第${currentRound}轮：请输入你的想法...`
    })
    
    if (isCompleted) {
      // 自动保存到历史记录
      this.saveToHistory()
    } else {
      this.saveProgress()
    }
  },

  /**
   * 处理分段响应
   * @param {string} messageId - 消息ID
   * @param {Object} responseData - 分段响应数据
   */
  handleSegmentedResponse(messageId, responseData) {
    try {
      const content = responseData.content || ''
      const segmentIndex = responseData.segmentIndex || 0
      const totalSegments = responseData.totalSegments || 1
      const hasMore = responseData.hasMore || false
      
      console.log(`[分段响应] 处理段落 ${segmentIndex + 1}/${totalSegments}, 内容长度: ${content.length}, 还有更多: ${hasMore}`)
      
      // 获取当前消息的已有内容
      const currentMessage = this.data.messages.find(msg => msg.id === messageId)
      if (!currentMessage) {
        console.error(`[分段响应] 未找到消息ID: ${messageId}`)
        return
      }
      
      const existingContent = currentMessage.content || ''
      
      // 开始打字机效果显示当前段落
      this.typewriterEffect(messageId, content, existingContent, () => {
        // 打字机效果完成后的回调
        console.log(`[分段响应] 段落 ${segmentIndex + 1} 显示完成`)
        
        if (hasMore) {
          // 延迟请求下一段
          setTimeout(() => {
            this.requestNextSegment(messageId, segmentIndex + 1)
          }, this.data.streamConfig.segmentDelay) // 使用配置的段落间隔时间
        } else {
          // 所有段落完成，处理最终状态
          console.log('[分段响应] 所有段落显示完成，进行最终处理')
          this.finalizeStreamingMessage(messageId, responseData)
        }
      })
    } catch (error) {
      console.error('[分段响应] 处理分段响应时发生错误:', error)
      // 降级处理：结束流式状态
      this.finalizeStreamingMessage(messageId, { isCompleted: false })
    }
  },

  /**
   * 打字机效果显示文本
   * @param {string} messageId - 消息ID
   * @param {string} newText - 要显示的新文本
   * @param {string} existingText - 已有的文本
   * @param {Function} callback - 完成回调
   */
  typewriterEffect(messageId, newText, existingText, callback) {
    if (!newText) {
      callback && callback()
      return
    }
    
    // 如果禁用打字机效果，直接显示完整文本
    if (!this.data.streamConfig.enableTypewriter) {
      const fullContent = existingText + newText
      const updatedMessages = this.data.messages.map(msg => {
        if (msg.id === messageId) {
          return {
            ...msg,
            content: fullContent,
            isStreaming: true
          }
        }
        return msg
      })
      
      this.setData({
        messages: updatedMessages
      })
      
      this.scrollToBottom()
      callback && callback()
      return
    }
    
    let currentIndex = 0
    const chars = Array.from(newText) // 支持中文字符
    const baseContent = existingText
    
    const typeInterval = setInterval(() => {
      if (currentIndex < chars.length) {
        const displayText = baseContent + chars.slice(0, currentIndex + 1).join('')
        
        // 更新消息内容
        const updatedMessages = this.data.messages.map(msg => {
          if (msg.id === messageId) {
            return {
              ...msg,
              content: displayText,
              isStreaming: true
            }
          }
          return msg
        })
        
        this.setData({
          messages: updatedMessages
        })
        
        // 滚动到底部
        this.scrollToBottom()
        
        currentIndex++
      } else {
        // 打字完成
        clearInterval(typeInterval)
        callback && callback()
      }
    }, this.data.streamConfig.typewriterSpeed) // 使用配置的打字速度
  },

  /**
   * 请求下一个段落
   * @param {string} messageId - 消息ID
   * @param {number} segmentIndex - 段落索引
   */
  requestNextSegment(messageId, segmentIndex) {
    console.log(`[分段响应] 请求下一段落，索引: ${segmentIndex}`)
    
    // 检查sessionId是否有效
    if (!this.data.sessionId) {
      console.error('sessionId为空，无法请求下一段落');
      this.finalizeStreamingMessage(messageId, { isCompleted: false });
      return;
    }
    
    wx.cloud.callFunction({
      name: 'handleAnswer',
      data: {
        sessionId: this.data.sessionId,
        streamMode: true,
        segmentIndex: segmentIndex
      },
      success: (res) => {
        console.log(`[分段响应] 段落 ${segmentIndex} 请求成功:`, res.result)
        
        if (res.result && res.result.success) {
          const responseData = res.result.data
          this.handleSegmentedResponse(messageId, responseData)
        } else {
          console.error(`[分段响应] 获取段落 ${segmentIndex} 失败:`, res.result)
          // 降级处理：结束流式状态
          this.finalizeStreamingMessage(messageId, { isCompleted: false })
        }
      },
      fail: (err) => {
        console.error(`[分段响应] 请求段落 ${segmentIndex} 网络失败:`, err)
        // 降级处理：结束流式状态
        this.finalizeStreamingMessage(messageId, { isCompleted: false })
      }
    })
  },

  /**
   * 完成流式消息的最终处理
   * @param {string} messageId - 消息ID
   * @param {Object} responseData - 响应数据
   */
  finalizeStreamingMessage(messageId, responseData) {
    const isCompleted = responseData.isCompleted || false
    const currentRound = responseData.currentRound || this.data.currentRound
    const answerCorrect = responseData.answerCorrect || false
    
    // 更新消息状态
    const updatedMessages = this.data.messages.map(msg => {
      if (msg.id === messageId) {
        return {
          ...msg,
          isCompleted: isCompleted,
          showReportLink: isCompleted && answerCorrect,
          isStreaming: false // 结束流式状态
        }
      }
      return msg
    })
    
    this.setData({
      messages: updatedMessages,
      isSessionComplete: isCompleted,
      currentRound: isCompleted ? this.data.currentRound : currentRound,
      inputPlaceholder: isCompleted ? '学习已完成！' : `第${currentRound}轮：请输入你的想法...`
    })
    
    if (isCompleted) {
      // 自动保存到历史记录
      this.saveToHistory()
    } else {
      this.saveProgress()
    }
  },

  /**
   * 处理AI响应 - 优化版（避免页面刷新）
   * @param {Object} responseData - AI响应数据
   */
  handleAIResponse(responseData) {
    // 创建临时消息ID用于兼容旧逻辑
    const tempMessageId = generateUniqueId()
    const tempMessage = {
      id: tempMessageId,
      type: 'ai',
      content: '',
      timestamp: new Date().toISOString(),
      round: this.data.currentRound,
      isStreaming: false
    }
    
    // 添加临时消息
    const newMessages = [...this.data.messages, tempMessage]
    this.setData({ messages: newMessages })
    
    // 使用新的流式处理逻辑
    this.updateStreamingMessage(tempMessageId, responseData)
    
    this.saveProgress()
  },
  
  /**
   * 滚动到消息底部 - 优化版（避免页面刷新）
   */
  scrollToBottom() {
    // 只使用scroll-view的scroll-into-view属性，避免页面滚动
    const messageCount = this.data.messages.length
    if (messageCount > 0) {
      this.setData({
        scrollIntoView: `message-${messageCount - 1}`
      })
    }
  },
  
  /**
   * 发送用户回答 - 优化版
   */
  sendAnswer() {
    const userInput = this.data.userInput.trim()
    if (!userInput) {
      app.showError('请输入你的回答')
      return
    }
    
    // 添加用户消息到对话列表
    const userMessage = {
      id: generateUniqueId(),
      type: 'user',
      content: userInput,
      timestamp: new Date().toISOString(),
      round: this.data.currentRound
    }
    
    const newMessages = [...this.data.messages, userMessage]
    
    this.setData({
      messages: newMessages,
      userInput: '',
      isAIThinking: true,
      currentThinkingIndex: 0,
      scrollIntoView: `message-${newMessages.length - 1}` // 修复：使用正确的变量名
    })
    
    // 记录用户回答
    app.trackUserBehavior('user_answer', {
      sessionId: this.data.sessionId,
      round: this.data.currentRound,
      answerLength: userInput.length
    })
    
    // 开始思考动画
    this.startThinkingAnimation()
    
    // 发送到AI处理
    this.processUserAnswer(userInput)
    
    // 每次交互后只保存进度，不保存历史
    this.saveProgress()
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
          
          // 立即保存到历史记录
          this.saveToHistory()
          
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
   * 滚动到消息底部
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
   * 修改原因：改为跳转到综合报告页面，不再传递sessionId
   */
  goToResult() {
    wx.redirectTo({
      url: `/pages/result/result?mode=userReport`
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
    // 如果是只读模式，直接返回不保存
    if (this.data.isReadOnly) {
      wx.navigateBack()
      return
    }
    
    if (this.hasDataChanged()) {
      wx.showModal({
        title: '确认退出',
        content: '退出后将保存当前学习进度，确定要退出吗？',
        confirmText: '退出',
        cancelText: '继续学习',
        success: (res) => {
          if (res.confirm) {
            this.saveAll()
            wx.navigateBack()
          }
        }
      })
    } else {
      wx.navigateBack()
    }
  },

  /**
   * 保存学习进度（包含状态更新）
   * 改动原因：合并状态更新逻辑，避免函数重复，简化调用流程
   */
  saveProgress() {
    console.log('开始保存学习进度...');
    
    // 检查sessionId是否有效
    if (!this.data.sessionId) {
      console.error('sessionId为空，无法保存进度');
      return;
    }
    
    const progressData = {
      sessionId: this.data.sessionId,
      currentRound: this.data.currentRound,
      messages: this.data.messages,
      timestamp: new Date().toISOString()
    }
    
    // 保存到本地
    try {
      wx.setStorageSync('learningProgress', progressData)
      console.log('本地进度保存成功');
    } catch (error) {
      console.error('本地进度保存失败:', error);
    }
    
    // 检查用户是否登录
    if (!app.globalData.openid) {
      console.log('用户未登录，仅保存到本地')
      return;
    }
    
    console.log('准备保存到云端，参数:', {
      sessionId: this.data.sessionId,
      openid: app.globalData.openid,
      messagesCount: this.data.messages.length,
      currentRound: this.data.currentRound
    });
    
    // 保存到云端 - 包含状态更新
    wx.cloud.callFunction({
      name: 'dataService',
      data: {
        action: 'updateSessionProgress',
        data: {
          sessionId: this.data.sessionId,
          openid: app.globalData.openid,
          dialogue: this.data.messages,
          currentRound: this.data.currentRound,
          status: this.data.isSessionComplete ? 'completed' : 'active',
          updateTime: new Date().toISOString(),
          // 如果会话完成，添加结束时间
          ...(this.data.isSessionComplete && {
            endTime: new Date().toISOString(),
            completionReason: 'user_completed'
          })
        }
      },
      success: (res) => {
        console.log('会话进度保存成功', res)
      },
      fail: (err) => {
        console.error('会话保存失败', err)
      }
    })
  },

  /**
   * 保存到历史记录
   */
  saveToHistory() {
    console.log('🔄 开始保存历史记录...')
    
    const historyItem = {
  sessionId: this.data.sessionId,
  timestamp: new Date().toISOString(),
  status: this.data.isSessionComplete ? 'completed' : 'active', // ✅ 统一使用status
  summary: this.generateSummary()
}
    
    console.log('📝 准备保存的历史记录:', historyItem)
    
    // 保存到本地历史记录
    let learningHistory = wx.getStorageSync('learningHistory') || []
    console.log('📚 当前本地历史记录数量:', learningHistory.length)
    
    // 检查是否已存在，避免重复
    const existingIndex = learningHistory.findIndex(item => item.sessionId === this.data.sessionId)
    if (existingIndex >= 0) {
      console.log('🔄 更新现有历史记录，索引:', existingIndex)
      learningHistory[existingIndex] = historyItem
    } else {
      console.log('➕ 添加新的历史记录')
      learningHistory.unshift(historyItem) // 添加到开头
    }
    
    // 限制历史记录数量
    if (learningHistory.length > 50) {
      learningHistory = learningHistory.slice(0, 50)
      console.log('✂️ 历史记录数量超限，已截取到50条')
    }
    
    try {
      wx.setStorageSync('learningHistory', learningHistory)
      console.log('✅ 本地历史记录保存成功，总数量:', learningHistory.length)
    } catch (error) {
      console.error('❌ 本地历史记录保存失败:', error)
    }
    
    // 如果用户已登录，同步到云端
    if (app.globalData.openid) {
      console.log('☁️ 用户已登录，开始同步到云端...')
      this.syncToCloud(historyItem)
    } else {
      console.log('⚠️ 用户未登录，跳过云端同步')
    }
  },

  saveAll() {
    console.log('开始保存所有数据...');
    
    // 检查sessionId是否有效
    if (!this.data.sessionId) {
      console.error('sessionId为空，无法保存数据');
      return;
    }
    
    // 分别调用两个专门的函数
    this.saveToHistory()  // 保存到learning_history
    this.saveProgress()   // 更新learning_sessions
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
   * 页面卸载时保存数据
   */
  onUnload() {
    // 清理定时器
    this.stopThinkingAnimation()
    
    // 只在非只读模式且会话有实际变化时才保存
    if (!this.data.isReadOnly && this.hasDataChanged()) {
      this.saveAll()
    }
  },

  /**
   * 检查数据是否有变化
   */
  hasDataChanged() {
    // 如果是只读模式（已完成的历史记录），不认为有数据变化
    if (this.data.isReadOnly) {
      return false
    }
    
    // 检查是否有新的消息、状态变化等
    return this.data.messages.length > 0 || 
           this.data.isSessionComplete || 
           this.data.currentRound > 1
  },

  /**
   * 显示消息操作按钮（长按触发）
   * @param {Object} e - 事件对象
   */
  showMessageActions(e) {
    const { id } = e.currentTarget.dataset
    
    // 触觉反馈
    wx.vibrateShort({
      type: 'light'
    })
    
    this.setData({
      currentActionMessageId: id
    })
    
    // 记录用户行为
    app.trackUserBehavior('show_message_actions', {
      sessionId: this.data.sessionId,
      messageId: id
    })
  },

  /**
   * 隐藏消息操作按钮
   */
  hideMessageActions() {
    this.setData({
      currentActionMessageId: null,
    })
  },

  /**
   * 复制消息内容 - 优化版
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
        // 隐藏操作按钮
        this.hideMessageActions()
      }
    })
  },

  /**
   * 编辑消息 - 优化版
   * @param {Object} e - 事件对象
   */
  editMessage(e) {
    const { id, content } = e.currentTarget.dataset
    
    // 先隐藏操作按钮
    this.hideMessageActions()
    
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
   * 重新发送消息 - 优化版
   * @param {Object} e - 事件对象
   */
  resendMessage(e) {
    const { id, content } = e.currentTarget.dataset
    
    // 先隐藏操作按钮
    this.hideMessageActions()
    
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
  },

  /**
   * 同步历史记录到云端
   * @param {Object} historyItem - 历史记录项
   */
  syncToCloud(historyItem) {
    console.log('☁️ 开始同步历史记录到云端...')
    
    // 如果openid为空，尝试重新获取
    if (!app.globalData.openid) {
      console.warn('⚠️ openid为空，尝试重新获取用户信息...')
      // 可以在这里调用app的登录方法重新获取openid
      wx.showToast({
        title: '用户信息丢失，请重新登录',
        icon: 'error',
        duration: 2000
      })
      return
    }
    
    // 检查historyItem是否有效
    if (!historyItem || !historyItem.sessionId) {
      console.error('历史记录数据无效:', historyItem);
      wx.showToast({
        title: '数据无效，无法保存',
        icon: 'error',
        duration: 2000
      });
      return;
    }
    
    console.log('📤 发送数据:', {
      action: 'saveLearningHistory',
      openid: app.globalData.openid,
      historyData: historyItem
    })
    
    // 调用云函数保存学习历史
    wx.cloud.callFunction({
      name: 'dataService',
      data: {
        action: 'saveLearningHistory',
        openid: app.globalData.openid,
        historyData: historyItem
      },
      success: (res) => {
        console.log('✅ 历史记录同步到云端成功:', res)
        if (res.result) {
          console.log('📊 云函数返回结果:', res.result)
        }
        wx.showToast({
          title: '历史记录已保存',
          icon: 'success',
          duration: 1000
        })
      },
      fail: (err) => {
        console.error('❌ 历史记录同步到云端失败:', err)
        console.error('❌ 错误详情:', {
          errMsg: err.errMsg,
          errCode: err.errCode,
          result: err.result
        })
        wx.showToast({
          title: '历史记录保存失败',
          icon: 'error',
          duration: 2000
        })
      }
    })
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
   * 显示消息操作按钮（长按触发）
   * @param {Object} e - 事件对象
   */
  showMessageActions(e) {
    const { id } = e.currentTarget.dataset
    
    // 触觉反馈
    wx.vibrateShort({
      type: 'light'
    })
    
    this.setData({
      currentActionMessageId: id
    })
    
    // 记录用户行为
    app.trackUserBehavior('show_message_actions', {
      sessionId: this.data.sessionId,
      messageId: id
    })
  },

  /**
   * 隐藏消息操作按钮
   */
  hideMessageActions() {
    this.setData({
      currentActionMessageId: null,
    })
  },

  /**
   * 复制消息内容 - 优化版
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
        // 隐藏操作按钮
        this.hideMessageActions()
      }
    })
  },

  /**
   * 编辑消息 - 优化版
   * @param {Object} e - 事件对象
   */
  editMessage(e) {
    const { id, content } = e.currentTarget.dataset
    
    // 先隐藏操作按钮
    this.hideMessageActions()
    
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
   * 重新发送消息 - 优化版
   * @param {Object} e - 事件对象
   */
  resendMessage(e) {
    const { id, content } = e.currentTarget.dataset
    
    // 先隐藏操作按钮
    this.hideMessageActions()
    
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
  },

  /**
   * 点击查看学习报告
   * 用户主动点击查看报告链接时调用
   */
  onViewReportTap() {
    // 记录用户行为
    app.trackUserBehavior('view_report_clicked', {
      sessionId: this.data.sessionId,
      source: 'chat_link'
    })
    
    // 跳转到结果页面
    this.goToResult()
  },
  onViewReportTap() {
    // 记录用户行为
    app.trackUserBehavior('view_report_clicked', {
      sessionId: this.data.sessionId,
      source: 'chat_link'
    })
    
    // 跳转到结果页面
    this.goToResult()
  }

})