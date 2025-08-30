// pages/profile/profile.js
// 希希数学小助手 个人资料页面逻辑

const app = getApp()

Page({
  /**
   * 页面的初始数据
   */
  data: {
    userInfo: null, // 用户信息
    isLogin: false, // 是否已登录
    tempAvatarUrl: '', // 临时头像URL
    tempNickname: '', // 临时昵称
    
    // 学习统计数据
    learningStats: {
      totalQuestions: 0, // 总题目数
      completedSessions: 0, // 完成会话数
      learningTime: 0, // 学习时长(分钟)
      averageScore: 0, // 平均分数
      streak: 0, // 连续学习天数
      totalDays: 0 // 总学习天数
    },
    
    // 成就数据
    achievements: [
      {
        id: 'first_question',
        name: '初次尝试',
        description: '完成第一道题目',
        icon: '🎯',
        unlocked: false,
        progress: 0,
        target: 1
      },
      {
        id: 'ten_questions',
        name: '勤学好问',
        description: '完成10道题目',
        icon: '📚',
        unlocked: false,
        progress: 0,
        target: 10
      },
      {
        id: 'perfect_score',
        name: '完美表现',
        description: '获得100分',
        icon: '⭐',
        unlocked: false,
        progress: 0,
        target: 1
      },
      {
        id: 'week_streak',
        name: '坚持不懈',
        description: '连续学习7天',
        icon: '🔥',
        unlocked: false,
        progress: 0,
        target: 7
      },
      {
        id: 'hour_learning',
        name: '专注学习',
        description: '累计学习1小时',
        icon: '⏰',
        unlocked: false,
        progress: 0,
        target: 60
      }
    ],
    
    // 添加过滤后的成就数组
    unlockedAchievements: [], // 已解锁的成就
    
    // 设置选项
    settings: {
      notifications: true, // 学习提醒
      soundEffects: true, // 音效
      autoSave: true, // 自动保存
      dataSync: true // 数据同步
    },
    
    // 功能菜单
    menuItems: [
      {
        id: 'learning_history',
        name: '学习报告',
        icon: 'icon-history',
        desc: 'AI智能分析学习成长轨迹',
        badge: ''
      },
      {
        id: 'achievements',
        name: '成就中心',
        icon: 'icon-a-chengji',
        desc: '查看获得的成就',
        badge: ''
      },
      {
        id: 'feedback',
        name: '意见反馈',
        icon: 'icon-wenhao',
        desc: '帮助我们改进',
        badge: ''
      },
      {
        id: 'about',
        name: '关于我们',
        icon: 'icon-brain',
        desc: '希希数学小助手介绍',
        badge: ''
      },
      {
        id: 'settings',
        name: '设置',
        icon: 'icon-setting',
        desc: '应用设置',
        badge: ''
      }
    ], 
    isLoading: true
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('个人资料页面加载')
    
    // 记录页面访问
    app.trackUserBehavior('page_visit', {
      page: 'profile'
    })
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    this.loadUserData()
    this.updateUnlockedAchievements()
  },

  /**
   * 更新已解锁成就列表
   */
  updateUnlockedAchievements() {
    const unlockedAchievements = this.data.achievements.filter(item => item.unlocked)
    this.setData({
      unlockedAchievements
    })
  },

  /**
   * 加载用户数据
   */
  loadUserData() {
    this.setData({ isLoading: true })
    
    // 获取用户信息
    const userInfo = app.globalData.userInfo
    const isLogin = !!userInfo
    
    // 获取本地学习统计
    const localStats = wx.getStorageSync('learningStats') || {
      totalQuestions: 0,
      completedSessions: 0,
      learningTime: 0
    }
    
    this.setData({
      userInfo: userInfo,
      isLogin: isLogin,
      learningStats: {
        ...this.data.learningStats,
        ...localStats
      }
    })
    
    if (isLogin) {
      // 从云端同步数据
      this.syncUserDataFromCloud()
    } else {
      this.setData({ isLoading: false })
    }
  },

  /**
   * 从云端同步用户数据
   * 修改原因：调用updateUserStats云函数获取最新的学习统计数据
   */
  syncUserDataFromCloud() {
    // 检查用户是否登录
    if (!app.globalData.openid) {
      this.setData({ isLoading: false });
      return;
    }
    
    // 调用updateUserStats云函数获取统计数据
    wx.cloud.callFunction({
      name: 'updateUserStats',
      data: {
        openid: app.globalData.openid
      },
      success: (res) => {
        console.log('用户统计数据同步成功', res)
        
        if (res.result && res.result.success) {
          const stats = res.result.data.stats
          
          // 更新学习统计数据
          this.setData({
            learningStats: {
              totalQuestions: stats.totalQuestions || 0,
              completedSessions: stats.completedSessions || 0,
              learningTime: stats.learningTime || 0,
              averageScore: stats.averageScore || 0,
              streak: stats.streak || 0,
              totalDays: stats.totalDays || 0
            }
          })
          
          // 根据统计数据更新成就进度
          this.updateAchievementsProgress(stats)
          
          // 更新菜单徽章
          this.updateMenuBadges()
          
          console.log('学习统计数据更新完成:', this.data.learningStats)
        }
        
        this.setData({ isLoading: false })
      },
      fail: (err) => {
        console.error('用户统计数据同步失败', err)
        // 降级到本地数据
        const localStats = wx.getStorageSync('learningStats')
        if (localStats) {
          this.setData({ learningStats: localStats })
        }
        this.setData({ isLoading: false })
      }
    })
  },

  /**
   * 更新成就数据
   * @param {Array} cloudAchievements - 云端成就数据
   */
  updateAchievements(cloudAchievements) {
    if (!cloudAchievements) return
    
    const achievements = this.data.achievements.map(achievement => {
      const cloudData = cloudAchievements.find(item => item.id === achievement.id)
      if (cloudData) {
        return { ...achievement, ...cloudData }
      }
      return achievement
    })
    
    // 过滤已解锁的成就
    const unlockedAchievements = achievements.filter(item => item.unlocked)
    
    this.setData({
      achievements,
      unlockedAchievements
    })
    
    // 更新菜单徽章
    this.updateMenuBadges()
  },

  /**
   * 根据统计数据更新成就进度
   * 修改原因：根据最新的学习统计数据更新成就解锁状态和进度
   * @param {Object} stats - 学习统计数据
   */
  updateAchievementsProgress(stats) {
    const achievements = this.data.achievements.map(achievement => {
      let progress = 0
      let unlocked = false
      
      switch (achievement.id) {
        case 'first_question':
          progress = Math.min(stats.totalQuestions, achievement.target)
          unlocked = stats.totalQuestions >= achievement.target
          break
          
        case 'ten_questions':
          progress = Math.min(stats.totalQuestions, achievement.target)
          unlocked = stats.totalQuestions >= achievement.target
          break
          
        case 'perfect_score':
          progress = stats.averageScore >= 100 ? 1 : 0
          unlocked = stats.averageScore >= 100
          break
          
        case 'week_streak':
          progress = Math.min(stats.streak, achievement.target)
          unlocked = stats.streak >= achievement.target
          break
          
        case 'hour_learning':
          progress = Math.min(stats.learningTime, achievement.target)
          unlocked = stats.learningTime >= achievement.target
          break
          
        default:
          progress = achievement.progress
          unlocked = achievement.unlocked
      }
      
      return {
        ...achievement,
        progress,
        unlocked
      }
    })
    
    // 过滤已解锁的成就
    const unlockedAchievements = achievements.filter(item => item.unlocked)
    
    this.setData({
      achievements,
      unlockedAchievements
    })
    
    console.log('成就进度更新完成:', {
      total: achievements.length,
      unlocked: unlockedAchievements.length
    })
  },

  /**
   * 更新菜单徽章
   */
  updateMenuBadges() {
    const newAchievements = this.data.achievements.filter(item => 
      item.unlocked && !wx.getStorageSync(`achievement_seen_${item.id}`)
    ).length
    
    const menuItems = this.data.menuItems.map(item => {
      if (item.id === 'achievements' && newAchievements > 0) {
        return { ...item, badge: newAchievements.toString() }
      }
      return { ...item, badge: '' }
    })
    
    this.setData({ menuItems })
  },

  /**
   * 用户登录
   */
  handleLogin() {
    wx.getUserInfo({
      success: (res) => {
        console.log('获取用户信息成功', res)
        
        const userInfo = res.userInfo
        console.log('用户信息userinfo:', userInfo)
        // 保存用户信息
        app.globalData.userInfo = userInfo
        wx.setStorageSync('userInfo', userInfo)
        
        this.setData({
          userInfo: userInfo,
          isLogin: true
        })
        
        // 同步用户信息到云端
        this.syncUserInfoToCloud(userInfo)
        
        app.showSuccess('登录成功')
        
        // 记录登录行为
        app.trackUserBehavior('user_login', {
          loginMethod: 'wechat'
        })
      },
      fail: (err) => {
        console.error('获取用户信息失败', err)
        app.showError('登录失败，请重试')
      }
    })
  },

  /**
   * 同步用户信息到云端
   * @param {Object} userInfo - 用户信息
   */
  syncUserInfoToCloud(userInfo) {
    console.log('准备同步用户数据:', {
      openid: app.globalData.openid,
      userInfo: userInfo
    })
    wx.cloud.callFunction({
      name: 'dataService',  // ✅ 更新：使用新的合并云函数
      data: {
        action: 'syncUserData',  // ✅ 新增：指定操作类型
        data: {
          openid: app.globalData.openid,
          userInfo: userInfo,
          timestamp: new Date().toISOString()
        }
      },
      success: (res) => {
        console.log('用户信息同步成功', res)
      },
      fail: (err) => {
        console.error('用户信息同步失败', err)
      }
    })
  },

  /**
   * 菜单项点击
   * @param {Object} e - 事件对象
   */
  onMenuItemTap(e) {
    const itemId = e.currentTarget.dataset.id
    
    app.trackUserBehavior('menu_click', {
      menuId: itemId
    })
    
    switch (itemId) {
      case 'learning_history':
        this.viewLearningHistory()
        break
      case 'achievements':
        this.viewAchievements()
        break
      case 'settings':
        this.openSettings()
        break
      case 'feedback':
        this.openFeedback()
        break
      case 'about':
        this.showAbout()
        break
      default:
        wx.showToast({
          title: '功能开发中',
          icon: 'none'
        })
    }
  },

  /**
   * 查看学习历史
   */
  viewLearningHistory() {
    // 记录行为
    app.trackUserBehavior('view_learning_history', {
      from: 'profile'
    })
    
    // 检查用户是否登录
    if (!this.data.isLogin) {
      wx.showModal({
        title: '需要登录',
        content: '查看学习报告需要先登录账号',
        confirmText: '立即登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            this.handleLogin()
          }
        }
      })
      return
    }
    
    // 跳转到结果页面显示历史记录
    wx.navigateTo({
      url: '/pages/result/result?mode=history',
      success: () => {
        console.log('跳转到学习历史页面成功')
      },
      fail: (err) => {
        console.error('跳转到学习历史页面失败', err)
        wx.showToast({
          title: '页面跳转失败',
          icon: 'error'
        })
      }
    })
  },

  /**
   * 查看成就
   */
  viewAchievements() {
    const achievements = this.data.achievements
    const unlockedCount = achievements.filter(item => item.unlocked).length
    const totalCount = achievements.length
    
    let content = `已解锁 ${unlockedCount}/${totalCount} 个成就\n\n`
    
    achievements.forEach(achievement => {
      const status = achievement.unlocked ? '✅' : '⏳'
      const progress = achievement.unlocked ? 
        '已完成' : 
        `${achievement.progress}/${achievement.target}`
      
      content += `${status} ${achievement.icon} ${achievement.name}\n`
      content += `   ${achievement.description} (${progress})\n\n`
    })
    
    wx.showModal({
      title: '成就中心',
      content: content,
      showCancel: false,
      confirmText: '我知道了'
    })
    
    // 标记成就为已查看
    achievements.forEach(achievement => {
      if (achievement.unlocked) {
        wx.setStorageSync(`achievement_seen_${achievement.id}`, true)
      }
    })
    
    // 更新徽章
    this.updateMenuBadges()
  },

  /**
   * 打开设置
   */
  openSettings() {
    const settings = this.data.settings
    
    wx.showActionSheet({
      itemList: [
        `学习提醒: ${settings.notifications ? '开启' : '关闭'}`,
        `音效: ${settings.soundEffects ? '开启' : '关闭'}`,
        `自动保存: ${settings.autoSave ? '开启' : '关闭'}`,
        `数据同步: ${settings.dataSync ? '开启' : '关闭'}`,
        '清除缓存',
        '退出登录'
      ],
      success: (res) => {
        const tapIndex = res.tapIndex
        
        switch (tapIndex) {
          case 0:
            this.toggleSetting('notifications')
            break
          case 1:
            this.toggleSetting('soundEffects')
            break
          case 2:
            this.toggleSetting('autoSave')
            break
          case 3:
            this.toggleSetting('dataSync')
            break
          case 4:
            this.clearCache()
            break
          case 5:
            this.logout()
            break
        }
      }
    })
  },

  /**
   * 切换设置项
   * @param {string} key - 设置项键名
   */
  toggleSetting(key) {
    const settings = {
      ...this.data.settings,
      [key]: !this.data.settings[key]
    }
    
    this.setData({ settings })
    
    // 保存到本地
    wx.setStorageSync('appSettings', settings)
    
    // 同步到云端
    if (this.data.isLogin) {
      wx.cloud.callFunction({
        name: 'dataService',  // ✅ 更新：使用新的合并云函数
        data: {
          action: 'syncUserData',  // ✅ 新增：指定操作类型
          data: {
            openid: app.globalData.openid,
            settings: settings
          }
        }
      })
    }
    
    wx.showToast({
      title: `${key}已${settings[key] ? '开启' : '关闭'}`,
      icon: 'success'
    })
  },

  /**
   * 清除缓存
   */
  clearCache() {
    wx.showModal({
      title: '清除缓存',
      content: '确定要清除所有缓存数据吗？这不会影响云端数据。',
      success: (res) => {
        if (res.confirm) {
          try {
            wx.clearStorageSync()
            wx.showToast({
              title: '缓存已清除',
              icon: 'success'
            })
            
            // 重新加载数据
            setTimeout(() => {
              this.loadUserData()
            }, 1000)
          } catch (err) {
            console.error('清除缓存失败', err)
            wx.showToast({
              title: '清除失败',
              icon: 'error'
            })
          }
        }
      }
    })
  },

  /**
   * 退出登录
   */
  logout() {
    wx.showModal({
      title: '退出登录',
      content: '确定要退出登录吗？本地数据将被清除。',
      success: (res) => {
        if (res.confirm) {
          // 清除用户数据
          app.globalData.userInfo = null
          wx.removeStorageSync('userInfo')
          
          this.setData({
            userInfo: null,
            isLogin: false,
            learningStats: {
              totalQuestions: 0,
              completedSessions: 0,
              learningTime: 0,
              averageScore: 0,
              streak: 0,
              totalDays: 0
            }
          })
          
          wx.showToast({
            title: '已退出登录',
            icon: 'success'
          })
          
          app.trackUserBehavior('user_logout', {})
        }
      }
    })
  },

  /**
   * 意见反馈
   */
  openFeedback() {
    wx.showModal({
      title: '意见反馈',
      content: '感谢您使用希希数学小助手！\n\n如有任何建议或问题，请通过以下方式联系我们：\n\n• 微信群：希希数学小助手用户交流群\n• 邮箱：feedback@希希数学小助手.com\n• 电话：400-123-4567',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  /**
   * 关于我们
   */
  showAbout() {
    wx.showModal({
      title: '关于希希数学小助手',
      content: '希希数学小助手 v1.0.0\n\n基于AI的智能数学辅导助手，采用引导式教学法，通过启发式提问帮助学生独立思考和解决问题。\n\n© 2024 希希数学小助手 Team\n保留所有权利',
      showCancel: false,
      confirmText: '我知道了'
    })
  },

  /**
   * 分享小程序
   */
  onShareAppMessage() {
    app.trackUserBehavior('share_app', {
      from: 'profile'
    })
    
    return {
      title: '希希数学小助手 - AI数学辅导助手',
      path: '/pages/index/index',
      imageUrl: '/images/share-app.png'
    }
  },

  /**
   * 分享到朋友圈
   */
  onShareTimeline() {
    return {
      title: '希希数学小助手 - AI数学辅导助手，让学习更有趣！',
      imageUrl: '/images/share-timeline.png'
    }
  },

  /**
   * 处理头像选择
   * @param {Object} e - 事件对象
   */
  onChooseAvatar(e) {
    console.log('选择头像', e)
    const { avatarUrl } = e.detail
    this.setData({
      tempAvatarUrl: avatarUrl
    })
    console.log('临时头像URL:', avatarUrl)
  },

  /**
   * 处理昵称输入
   * @param {Object} e - 事件对象
   */
  onNicknameInput(e) {
    const nickname = e.detail.value
    this.setData({
      tempNickname: nickname
    })
    console.log('输入昵称:', nickname)
  },

  /**
   * 提交用户信息
   * @param {Object} e - 表单提交事件
   */
  onSubmitUserInfo(e) {
    const { tempAvatarUrl, tempNickname } = this.data

    if (!tempAvatarUrl || !tempNickname) {
      app.showError('请完善头像和昵称信息')
      return
    }

    // 上传头像到云存储
    this.uploadAvatarToCloud(tempAvatarUrl, tempNickname)
  },

  /**
   * 上传头像到云存储
   * @param {string} tempFilePath - 临时文件路径
   * @param {string} nickname - 用户昵称
   */
  uploadAvatarToCloud(tempFilePath, nickname) {
    wx.showLoading({ title: '上传中...' })

    // 生成唯一文件名
    const timestamp = Date.now()
    const cloudPath = `avatars/${timestamp}_avatar.jpg`

    wx.cloud.uploadFile({
      cloudPath: cloudPath,
      filePath: tempFilePath,
      success: (uploadRes) => {
        console.log('头像上传成功', uploadRes)

        // 构建用户信息
        const userInfo = {
          nickName: nickname,
          avatarUrl: uploadRes.fileID,
          gender: 0, // 默认值
          country: '',
          province: '',
          city: '',
          language: 'zh_CN'
        }

        // 保存用户信息
        this.saveUserInfo(userInfo)
      },
      fail: (err) => {
        console.error('头像上传失败', err)
        wx.hideLoading()
        app.showError('头像上传失败，请重试')
      }
    })
  },

  /**
   * 保存用户信息
   * @param {Object} userInfo - 用户信息
   */
  saveUserInfo(userInfo) {
    // 保存到全局数据和本地存储
    app.globalData.userInfo = userInfo
    wx.setStorageSync('userInfo', userInfo)

    this.setData({
      userInfo: userInfo,
      isLogin: true,
      tempAvatarUrl: '',
      tempNickname: ''
    })

    // 同步用户信息到云端
    this.syncUserInfoToCloud(userInfo)

    wx.hideLoading()
    app.showSuccess('设置成功')

    // 记录登录行为
    app.trackUserBehavior('user_login', {
      loginMethod: 'avatar_nickname'
    })
  }
})