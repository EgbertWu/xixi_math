// app.js
// 希希数学小助手 微信小程序入口文件
App({
  /**
   * 小程序初始化函数
   * 在小程序启动时执行，全局只触发一次
   */
  onLaunch() {
    console.log('希希数学小助手小程序启动')
    
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
   * 使用 openid 作为用户唯一标识
   */
  initUserData() {
    // 先尝试从本地获取 openid
    const storedOpenid = wx.getStorageSync('openid')
    const storedUserInfo = wx.getStorageSync('userInfo')
    
    if (storedOpenid && storedUserInfo) {
      // 如果本地有完整的用户信息，直接使用
      this.globalData.openid = storedOpenid
      this.globalData.userInfo = storedUserInfo
      this.globalData.isLogin = true
      console.log('使用本地用户信息:', storedOpenid)
    } else {
      // 如果没有完整信息，获取 openid 但不自动登录
      this.getOpenId()
    }

    // 记录用户启动时间
    const launchTime = new Date().toISOString()
    wx.setStorageSync('lastLaunchTime', launchTime)
  },

  /**
   * 获取用户 openid（不等同于登录）
   */
  getOpenId() {
    wx.cloud.callFunction({
      name: 'login',
      success: (res) => {
        if (res.result.success) {
          const openid = res.result.openid
          console.log('获取到 openid:', openid)
          
          // 保存 openid 到本地和全局
          wx.setStorageSync('openid', openid)
          this.globalData.openid = openid
          
          // 注意：这里不设置 isLogin = true
          // 只有用户主动授权获取用户信息后才算登录
        } else {
          console.error('获取 openid 失败:', res.result.error)
        }
      },
      fail: (err) => {
        console.error('调用 login 云函数失败:', err)
      }
    })
  },

  /**
   * 用户登录（获取用户信息）
   * @param {Function} successCallback - 登录成功回调
   * @param {Function} failCallback - 登录失败回调
   */
  userLogin(successCallback, failCallback) {
    // 如果没有 openid，先获取
    if (!this.globalData.openid) {
      this.getOpenId()
      if (failCallback) failCallback('获取用户标识失败')
      return
    }
    
    // 获取用户信息
    wx.getUserInfo({
      success: (res) => {
        const userInfo = res.userInfo
        
        // 保存用户信息
        this.globalData.userInfo = userInfo
        this.globalData.isLogin = true
        wx.setStorageSync('userInfo', userInfo)
        
        console.log('用户登录成功:', userInfo)
        
        // 同步用户信息到云端
        this.syncUserToCloud(userInfo)
        
        if (successCallback) successCallback(userInfo)
      },
      fail: (err) => {
        console.error('获取用户信息失败:', err)
        if (failCallback) failCallback(err)
      }
    })
  },

  /**
   * 同步用户信息到云端
   * @param {Object} userInfo - 用户信息
   */
  syncUserToCloud(userInfo) {
    wx.cloud.callFunction({
      name: 'dataService',
      data: {
        action: 'syncUserData',
        data: {
          // 移除openid参数，dataService会自动从微信上下文获取openid
          userInfo: userInfo,
          timestamp: new Date().toISOString()
        }
      },
      success: (res) => {
        console.log('用户信息同步成功:', res)
        // 添加更详细的日志
        if (res.result && res.result.success) {
          console.log('数据库操作:', res.result.action)
          console.log('用户数据:', res.result.data)
        }
      },
      fail: (err) => {
        console.error('用户信息同步失败:', err)
        // 添加更详细的错误信息
        wx.showToast({
          title: '同步失败',
          icon: 'error'
        })
      }
    })
  },

  /**
   * 检查用户是否已登录
   * @returns {boolean} 是否已登录
   */
  isUserLogin() {
    return !!(this.globalData.isLogin && this.globalData.userInfo && this.globalData.openid)
  },

  /**
   * 要求用户登录
   * @param {string} message - 提示信息
   * @param {Function} successCallback - 登录成功回调
   */
  requireLogin(message = '此功能需要登录后使用', successCallback) {
    if (this.isUserLogin()) {
      if (successCallback) successCallback()
      return true
    }
    
    wx.showModal({
      title: '需要登录',
      content: message,
      confirmText: '立即登录',
      cancelText: '取消',
      success: (res) => {
        if (res.confirm) {
          this.userLogin(successCallback, (err) => {
            wx.showToast({
              title: '登录失败',
              icon: 'error'
            })
          })
        }
      }
    })
    
    return false
  },

  /**
   * 用户退出登录
   */
  userLogout() {
    this.globalData.userInfo = null
    this.globalData.isLogin = false
    wx.removeStorageSync('userInfo')
    
    wx.showToast({
      title: '已退出登录',
      icon: 'success'
    })
  },

  /**
   * 全局数据存储
   * 存储应用级别的共享数据
   */
  globalData: {
    openid: null,           // 用户唯一标识（openid）
    userInfo: null,         // 用户信息
    isLogin: false,         // 是否已登录
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
        openid: this.globalData.openid,
        action: action,
        data: data,
        timestamp: new Date().toISOString(),
        page: getCurrentPages().pop()?.route || 'unknown'
      }
      
      localBehaviors.push(behaviorData)
      wx.setStorageSync('userBehaviors', localBehaviors.slice(-100)) // 只保留最近100条
      
      // 只有登录用户才调用云函数记录行为
      if (!this.isUserLogin()) {
        console.log('用户未登录，行为数据仅保存到本地')
        return
      }
      
      // 调用云函数记录行为数据
      wx.cloud.callFunction({
        name: 'dataService',
        data: {
          action: 'recordBehavior',
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