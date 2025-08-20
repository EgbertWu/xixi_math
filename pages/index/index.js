// pages/index/index.js
// 希希数学小助手 首页逻辑

const app = getApp()

Page({
  /**
   * 页面的初始数据
   */
  data: {
    stats: {
      totalQuestions: 0,
      learningTime: '0h 0m',
      accuracy: '0%'
    },
    historyItems: [],
    recentSessions: [], // 最近的学习记录
    hasRecentSessions: false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('希希数学小助手首页加载');
    this.initPageData();
  },

  /**
   * 初始化页面数据
   */
  initPageData() {
    // 先设置默认数据，确保页面能快速显示
    this.setDefaultData();
    
    // 如果用户已登录，再异步加载云端数据
    if (app.globalData.userInfo) {
      this.loadUserStats();
    } else {
      // 未登录用户使用本地数据
      this.loadLocalStats();
    }
  },

  /**
   * 设置默认数据
   */
  setDefaultData() {
    this.setData({
      stats: {
        totalQuestions: 0,
        learningTime: '0h 0m',
        accuracy: '0%'
      },
      historyItems: []
    });
  },

  /**
   * 加载用户统计数据（仅登录用户）
   */
  async loadUserStats() {
    // 只有登录用户才访问数据库
    if (!app.globalData.userInfo) {
      this.loadLocalStats();
      return;
    }

    try {
      // 从云数据库获取用户统计数据
      const db = wx.cloud.database();
      const userStatsResult = await db.collection('user_stats').where({
        _openid: '{openid}'
      }).get();
      
      let userStats = {
        totalQuestions: 0,
        learningTime: '0h 0m',
        accuracy: '0%'
      };
      
      if (userStatsResult.data.length > 0) {
        userStats = userStatsResult.data[0];
      }
      
      this.setData({
        stats: userStats
      });
      
      // 加载解题历史记录
      await this.loadLearningHistory();
    } catch (error) {
      console.error('加载用户统计数据失败:', error);
      // 降级到本地存储
      this.loadLocalStats();
    }
  },

  /**
   * 加载本地统计数据（降级方案）
   */
  loadLocalStats() {
    const userStats = wx.getStorageSync('userStats') || {
      totalQuestions: 0,
      learningTime: '0h 0m',
      accuracy: '0%'
    };
    
    this.setData({
      stats: userStats
    });
    
    this.loadLearningHistory();
  },

  /**
   * 加载学习历史记录（仅登录用户）
   */
  async loadLearningHistory() {
    // 只有登录用户才访问数据库
    if (!app.globalData.userInfo) {
      this.loadLocalHistory();
      return;
    }
    
    try {
      // 从云数据库获取学习历史
      const db = wx.cloud.database();
      const historyResult = await db.collection('learning_sessions')
        .where({
          _openid: '{openid}'
        })
        .orderBy('updateTime', 'desc')
        .limit(4)
        .get();
      
      const recentHistory = historyResult.data.map(item => {
        return {
          id: item._id,
          title: item.questionText || '数学题解答',
          image: item.questionImage || '',
          timestamp: item.updateTime,
          sessionId: item.sessionId
        };
      });
      
      this.setData({
        historyItems: recentHistory
      });
    } catch (error) {
      console.error('加载学习历史失败:', error);
      // 降级到本地存储
      this.loadLocalHistory();
    }
  },

  /**
   * 加载本地历史记录（降级方案）
   */
  loadLocalHistory() {
    const historyList = wx.getStorageSync('learningHistory') || [];
    
    const recentHistory = historyList.slice(0, 4).map(item => {
      return {
        id: item.sessionId,
        title: item.summary || '数学题解答',
        image: item.questionImage || '',
        timestamp: item.timestamp,
        sessionId: item.sessionId
      };
    });
    
    this.setData({
      historyItems: recentHistory
    });
  },

  /**
   * 开始拍照解题
   */
  startCamera() {
    // 检查用户是否登录
    if (!app.globalData.userInfo) {
      wx.showModal({
        title: '需要登录',
        content: '请先登录以便保存您的学习记录',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // 跳转到个人资料页面进行登录
            wx.switchTab({
              url: '/pages/profile/profile'
            })
          }
        }
      })
      return
    }
    
    wx.navigateTo({
      url: '/pages/camera/camera'
    });
  },

  /**
   * 跳转到相机页面
   */
  goToCamera() {
    // 检查用户是否登录
    if (!app.globalData.userInfo) {
      wx.showModal({
        title: '需要登录',
        content: '请先登录以便保存您的学习记录',
        confirmText: '去登录',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            // 跳转到个人资料页面进行登录
            wx.switchTab({
              url: '/pages/profile/profile'
            })
          }
        }
      })
      return
    }
    
    wx.navigateTo({
      url: '/pages/camera/camera'
    });
  },

  /**
   * 查看解题历史
   */
  viewHistory() {
    wx.navigateTo({
      url: '/pages/learning/learning'
    });
  },

  /**
   * 打开学习会话
   */
  openLearningSession(e) {
    const sessionId = e.currentTarget.dataset.sessionId;
    if (sessionId) {
      wx.navigateTo({
        url: `/pages/learning/learning?sessionId=${sessionId}&mode=continue`
      });
    }
  },

  /**
   * 更新用户统计数据到云数据库
   */
  async updateUserStats(newStats) {
    try {
      const db = wx.cloud.database();
      const userStatsResult = await db.collection('user_stats').where({
        _openid: '{openid}'
      }).get();
      
      if (userStatsResult.data.length > 0) {
        // 更新现有记录
        await db.collection('user_stats').doc(userStatsResult.data[0]._id).update({
          data: newStats
        });
      } else {
        // 创建新记录
        const statsWithTime = Object.assign({}, newStats, {
          createTime: new Date()
        });
        await db.collection('user_stats').add({
          data: statsWithTime
        });
      }
      
      // 同时更新本地存储作为备份
      wx.setStorageSync('userStats', newStats);
    } catch (error) {
      console.error('更新用户统计数据失败:', error);
      // 降级到本地存储
      wx.setStorageSync('userStats', newStats);
    }
  },

  /**
   * 保存学习记录到云数据库
   */
  async saveLearningRecord(record) {
    try {
      const db = wx.cloud.database();
      const recordWithTime = Object.assign({}, record, {
        timestamp: new Date()
      });
      await db.collection('learning_sessions').add({
        data: recordWithTime
      });
      
      // 同时保存到本地存储作为备份
      const localHistory = wx.getStorageSync('learningHistory') || [];
      localHistory.unshift(record);
      wx.setStorageSync('learningHistory', localHistory.slice(0, 50)); // 只保留最近50条
      
      // 刷新历史记录显示
      this.loadLearningHistory();
    } catch (error) {
      console.error('保存学习记录失败:', error);
      // 降级到本地存储
      const localHistory = wx.getStorageSync('learningHistory') || [];
      localHistory.unshift(record);
      wx.setStorageSync('learningHistory', localHistory.slice(0, 50));
      this.loadLocalHistory();
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 页面显示时刷新数据，但不直接访问数据库
    this.initPageData();
  },

  /**
   * 加载最近的学习记录
   */
  async loadRecentSessions() {
    if (!app.globalData.openid) {
      return
    }

    try {
      const result = await wx.cloud.callFunction({
        name: 'dataService',
        data: {
          action: 'getRecentLearningHistory',
          data: {
            openid: app.globalData.openid,
            limit: 3
          }
        }
      })

      if (result.result && result.result.success) {
        const { recentSessions } = result.result.data
        
        // 格式化时间
        const formattedSessions = recentSessions.map(session => ({
          ...session,
          lastUpdateTime: this.formatTime(session.lastUpdateTime)
        }))
        
        this.setData({
          recentSessions: formattedSessions,
          hasRecentSessions: formattedSessions.length > 0
        })
      }
    } catch (error) {
      console.error('加载最近学习记录失败:', error)
    }
  },

  /**
   * 点击最近学习记录
   */
  onRecentSessionTap(e) {
    const session = e.currentTarget.dataset.session
    
    if (session.status === 'completed') {
      // 已完成的会话，查看历史对话
      wx.navigateTo({
        url: `/pages/learning/learning?sessionId=${session.sessionId}&mode=history`
      })
    } else {
      // 未完成的会话，继续学习
      wx.navigateTo({
        url: `/pages/learning/learning?sessionId=${session.sessionId}&mode=continue`
      })
    }
  },

  /**
   * 查看全部历史记录
   */
  viewAllHistory() {
    wx.navigateTo({
      url: '/pages/history/history'
    })
  },

  /**
   * 格式化时间
   */
  formatTime(timeString) {
    if (!timeString) return ''
    
    const time = new Date(timeString)
    const now = new Date()
    const diff = now - time
    
    // 小于1天
    if (diff < 24 * 60 * 60 * 1000) {
      if (diff < 60 * 60 * 1000) {
        return `${Math.floor(diff / (60 * 1000))}分钟前`
      }
      return `${Math.floor(diff / (60 * 60 * 1000))}小时前`
    }
    
    // 超过1天，显示日期
    return time.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric'
    })
  },

  /**
   * 打开学习会话
   */
  openLearningSession(e) {
    const sessionId = e.currentTarget.dataset.sessionId;
    if (sessionId) {
      wx.navigateTo({
        url: `/pages/learning/learning?sessionId=${sessionId}&mode=continue`
      });
    }
  },

  /**
   * 更新用户统计数据到云数据库
   */
  async updateUserStats(newStats) {
    try {
      const db = wx.cloud.database();
      const userStatsResult = await db.collection('user_stats').where({
        _openid: '{openid}'
      }).get();
      
      if (userStatsResult.data.length > 0) {
        // 更新现有记录
        await db.collection('user_stats').doc(userStatsResult.data[0]._id).update({
          data: newStats
        });
      } else {
        // 创建新记录
        const statsWithTime = Object.assign({}, newStats, {
          createTime: new Date()
        });
        await db.collection('user_stats').add({
          data: statsWithTime
        });
      }
      
      // 同时更新本地存储作为备份
      wx.setStorageSync('userStats', newStats);
    } catch (error) {
      console.error('更新用户统计数据失败:', error);
      // 降级到本地存储
      wx.setStorageSync('userStats', newStats);
    }
  },

  /**
   * 保存学习记录到云数据库
   */
  async saveLearningRecord(record) {
    try {
      const db = wx.cloud.database();
      const recordWithTime = Object.assign({}, record, {
        timestamp: new Date()
      });
      await db.collection('learning_sessions').add({
        data: recordWithTime
      });
      
      // 同时保存到本地存储作为备份
      const localHistory = wx.getStorageSync('learningHistory') || [];
      localHistory.unshift(record);
      wx.setStorageSync('learningHistory', localHistory.slice(0, 50)); // 只保留最近50条
      
      // 刷新历史记录显示
      this.loadLearningHistory();
    } catch (error) {
      console.error('保存学习记录失败:', error);
      // 降级到本地存储
      const localHistory = wx.getStorageSync('learningHistory') || [];
      localHistory.unshift(record);
      wx.setStorageSync('learningHistory', localHistory.slice(0, 50));
      this.loadLocalHistory();
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 页面显示时刷新数据，但不直接访问数据库
    this.initPageData();
  }
});