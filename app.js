// app.js
// 希希数学小助手 微信小程序入口文件
App({
  /**
   * 小程序初始化函数
   * 在小程序启动时执行，全局只触发一次
   */
  onLaunch() {
    console.log('希希数学小助手 启动')
    
    // 初始化云开发环境
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-8g4cl3p21c582f6e', // 云开发环境ID
        traceUser: true, // 是否在将用户访问记录到用户管理中
      })
    }

    // 检查用户授权状态
    this.checkUserAuth()
    
    // 初始化用户数据
    this.initUserData()
  },

  /**
   * 检查用户授权状态
   * 确保用户已授权必要的权限
   */
  checkUserAuth() {
    // 检查摄像头权限
    wx.getSetting({
      success: (res) => {
        if (!res.authSetting['scope.camera']) {
          console.log('用户未授权摄像头权限')
        }
      }
    })
  },

  /**
   * 初始化用户数据
   * 创建用户唯一标识和基础信息
   */
  initUserData() {
    // 获取用户唯一标识
    let userId = wx.getStorageSync('userId')
    if (!userId) {
      userId = 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
      wx.setStorageSync('userId', userId)
    }
    this.globalData.userId = userId

    // 尝试恢复用户信息
    const userInfo = wx.getStorageSync('userInfo')
    if (userInfo) {
      this.globalData.userInfo = userInfo
    }

    // 记录用户启动时间
    const launchTime = new Date().toISOString()
    wx.setStorageSync('lastLaunchTime', launchTime)
  },

  /**
   * 全局数据存储
   * 存储应用级别的共享数据
   */
  globalData: {
    userId: null,           // 用户唯一标识
    userInfo: null,         // 用户信息
    currentSession: null,   // 当前学习会话
    learningStats: {        // 学习统计数据
      totalQuestions: 0,    // 总题目数
      completedSessions: 0, // 完成的会话数
      totalTime: 0         // 总学习时间
    }
  },

  /**
   * 记录用户行为数据
   * @param {string} action - 行为类型
   * @param {object} data - 行为数据
   */
  trackUserBehavior(action, data = {}) {
    try {
      // 先保存到本地，确保即使云函数调用失败也有记录
      const localBehaviors = wx.getStorageSync('userBehaviors') || []
      const behaviorData = {
        userId: this.globalData.userId,
        action: action,
        data: data,
        timestamp: new Date().toISOString(),
        page: getCurrentPages().pop()?.route || 'unknown'
      }
      
      localBehaviors.push(behaviorData)
      wx.setStorageSync('userBehaviors', localBehaviors.slice(-100)) // 只保留最近100条
      
      // 如果用户未登录或userId为临时ID，则不调用云函数
      if (!this.globalData.userInfo || !this.globalData.userId || this.globalData.userId.startsWith('temp_')) {
        console.log('用户未登录，行为数据仅保存到本地')
        return
      }
      
      // 调用云函数记录行为数据
      wx.cloud.callFunction({
        name: 'dataService',  // ✅ 更新：使用新的合并云函数
        data: {
          action: 'recordBehavior',  // ✅ 新增：指定操作类型
          data: behaviorData
        },
        success: (res) => {
          console.log('行为数据记录成功', res)
        },
        fail: (err) => {
          console.error('行为数据记录失败', err)
        }
      })
    } catch (error) {
      console.error('记录用户行为出错', error)
    }
  },

  /**
   * 显示加载提示
   * @param {string} title - 提示文字
   */
  showLoading(title = '加载中...') {
    wx.showLoading({
      title: title,
      mask: true
    })
  },

  /**
   * 隐藏加载提示
   */
  hideLoading() {
    wx.hideLoading()
  },

  /**
   * 显示错误提示
   * @param {string} message - 错误信息
   */
  showError(message) {
    wx.showToast({
      title: message,
      icon: 'error',
      duration: 2000
    })
  },

  /**
   * 显示成功提示
   * @param {string} message - 成功信息
   */
  showSuccess(message) {
    wx.showToast({
      title: message,
      icon: 'success',
      duration: 1500
    })
  }
})