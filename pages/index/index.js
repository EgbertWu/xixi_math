// pages/index/index.js
// 希希学习小助手 首页逻辑

const app = getApp()

Page({
  /**
   * 页面的初始数据
   */
  data: {
    stats: {
      totalQuestions: 0,
      learningTime: '0h 0m',
      latestAchievement: '暂无成就'
    },
    historyItems: [],
    recentSessions: [], // 最近的学习记录
    hasRecentSessions: false,
    isDevelopment: false // 开发环境标识，生产环境应设为false
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('希希学习小助手首页加载');
    this.initPageData();
  },

  /**
   * 初始化页面数据
   */
  initPageData() {
    // 先设置默认数据，确保页面能快速显示
    this.setDefaultData();
    
    // 检查openid状态
    if (app.globalData.openid) {
      console.log('已有openid，加载用户数据:', app.globalData.openid);
      this.loadUserStats();
    } else {
      console.log('没有openid，等待获取...');
      // 等待一段时间后重试，因为getOpenId是异步的
      setTimeout(() => {
        if (app.globalData.openid) {
          console.log('延迟获取到openid，加载用户数据:', app.globalData.openid);
          this.loadUserStats();
        } else {
          console.log('仍然没有openid，加载本地数据');
          this.loadLocalStats();
          // 不再调用loadLocalHistory，设置空历史记录
          this.setData({ historyItems: [] });
        }
      }, 1000); // 等待1秒
    }
  },

  /**
   * 加载用户统计数据（仅登录用户）
   * 修改原因：使用updateUserStats云函数替代直接查询数据库，解决权限问题并确保数据统计准确性
   */
  async loadUserStats() {
    if (!app.globalData.openid) {
      console.log('loadUserStats: 没有openid');
      this.loadLocalStats();
      this.setData({ historyItems: [] });
      return;
    }
  
    try {
      console.log('loadUserStats: 开始加载，openid:', app.globalData.openid);
      
      const result = await wx.cloud.callFunction({
        name: 'updateUserStats',
        data: {
          openid: app.globalData.openid
        }
      });
      
      console.log('updateUserStats云函数返回结果:', result);
      console.log('result.result:', result.result);
      console.log('result.result.data:', result.result.data);
      if (result.result && result.result.data) {
        console.log('result.result.data.stats:', result.result.data.stats);
      }

      let userStats = {
        totalQuestions: 0,
        learningTime: '0h 0m',
        latestAchievement: '暂无成就'
      };
      
      if (result && result.result && result.result.success && result.result.data && result.result.data.stats) {
        const statsData = result.result.data.stats;
        console.log('解析到的statsData:', statsData);
        console.log('statsData.totalQuestions:', statsData.totalQuestions);
        console.log('statsData.learningTime:', statsData.learningTime);
        console.log('statsData.latestAchievement:', statsData.latestAchievement);
        
        userStats = {
          totalQuestions: statsData.totalQuestions || 0,
          learningTime: this.formatLearningTime(statsData.learningTime || 0),
          latestAchievement: statsData.latestAchievement || '暂无成就'
        };
        console.log('构建的userStats:', userStats);
      } else {
        console.log('条件检查失败:');
        console.log('result存在:', !!result);
        console.log('result.result存在:', !!(result && result.result));
        console.log('result.result.success:', result && result.result && result.result.success);
        console.log('result.result.data存在:', !!(result && result.result && result.result.data));
        console.log('result.result.data.stats存在:', !!(result && result.result && result.result.data && result.result.data.stats));
      }
      
      console.log('最终设置的userStats:', userStats);
      this.setData({
        stats: userStats
      });
      
      await this.loadLearningHistory();
    } catch (error) {
      console.error('加载用户统计数据失败:', error);
      this.loadLocalStats();
      this.setData({ historyItems: [] });
    }
  },

  setDefaultData() {
    this.setData({
      stats: {
        totalQuestions: 0,
        learningTime: '0h 0m',
        latestAchievement: '暂无成就'  // 修改：将accuracy改为latestAchievement
      },
      historyItems: []
    });
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
   * 加载学习历史记录（使用云函数访问）
   */
  async loadLearningHistory() {
    // 检查用户是否有openid
    if (!app.globalData.openid) {
      console.log('用户openid不存在，无法加载历史记录');
      this.setData({ historyItems: [] });
      return;
    }
    
    try {
      console.log('开始加载历史记录，openid:', app.globalData.openid);
      
      // 添加加载状态提示
      wx.showLoading({ title: '加载中...' });
      
      const result = await wx.cloud.callFunction({
        name: 'getUserHistory',
        data: {
          openid: app.globalData.openid,
          page: 1,
          pageSize: 2, // 只显示最新2条
          type: 'sessions'
        }
      });
      
      console.log('云函数查询结果:', result);
      
      let recentHistory = [];
      if (result.result && result.result.success && result.result.data.sessions) {
        // 处理learning_sessions数据
        recentHistory = result.result.data.sessions.map(item => ({
          id: item.sessionId,
          title: item.questionText || '数学题解答',
          image: '', // learning_sessions中没有图片字段
          timestamp: item.startTime,
          sessionId: item.sessionId
        }));
        
        console.log('✅ 成功获取历史记录:', recentHistory.length, '条');
      } else {
        console.log('⚠️ 未获取到历史记录数据');
        // 添加用户提示
        if (result.result && !result.result.success) {
          wx.showToast({
            title: result.result.error || '获取记录失败',
            icon: 'none'
          });
        }
      }
      
      console.log('处理后的历史记录:', recentHistory);
      this.setData({ historyItems: recentHistory });
      
    } catch (error) {
      console.error('加载学习历史失败:', error);
      this.setData({ historyItems: [] });
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'error'
      });
    } finally {
      wx.hideLoading();
    }
  },

  /**
   * 删除原来的loadLocalHistory函数，因为不再需要本地存储降级
   * 现在统一从云数据库获取数据
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
   * 打开学习会话 - 修复版本
   * 改动原因：currentTarget没有status字段，需要通过sessionId查询获取会话状态
   */
  async openLearningSession(e) {
    console.log('🔍 点击历史记录项:', e);
    
    const sessionId = e.currentTarget.dataset.sessionId;
    console.log('📝 获取到sessionId:', sessionId);
    
    if (!sessionId) {
      console.error('❌ 未获取到sessionId');
      wx.showToast({
        title: '记录信息错误',
        icon: 'error'
      });
      return;
    }
  
    try {
      // 显示加载提示
      wx.showLoading({ title: '加载中...' });
      
      // 先检查recentSessions中是否有该会话数据
      let sessionStatus = 'continue'; // 默认为继续模式
      const recentSession = this.data.recentSessions.find(session => session.sessionId === sessionId);
      
      if (recentSession && recentSession.status) {
        // 如果在最近会话中找到了状态信息
        sessionStatus = recentSession.status === 'completed' ? 'history' : 'continue';
        console.log('📋 从最近会话中获取状态:', recentSession.status, '-> mode:', sessionStatus);
      } else {
        // 如果最近会话中没有，调用云函数查询
        console.log('🔍 从云端查询会话状态...');
        const result = await wx.cloud.callFunction({
          name: 'getUserHistory',
          data: {
            openid: app.globalData.openid,
            sessionId: sessionId, // 查询特定会话
            type: 'sessions'
          }
        });
        
        if (result.result && result.result.success && result.result.data.sessions && result.result.data.sessions.length > 0) {
          const session = result.result.data.sessions[0];
          sessionStatus = session.status === 'completed' ? 'history' : 'continue';
          console.log('☁️ 从云端获取状态:', session.status, '-> mode:', sessionStatus);
        } else {
          console.log('⚠️ 未找到会话状态，使用默认continue模式');
        }
      }
      
      wx.hideLoading();
      
      // 根据会话状态决定模式
      const mode = sessionStatus;
      const url = `/pages/learning/learning?sessionId=${sessionId}&mode=${mode}`;
      
      console.log('🚀 跳转到学习页面:', url);
      
      wx.navigateTo({
        url: url,
        success: () => {
          console.log('✅ 页面跳转成功');
        },
        fail: (error) => {
          console.error('❌ 页面跳转失败:', error);
          wx.showToast({
            title: '跳转失败',
            icon: 'error'
          });
        }
      });
      
    } catch (error) {
      wx.hideLoading();
      console.error('❌ 获取会话状态失败:', error);
      
      // 发生错误时使用默认的continue模式
      const url = `/pages/learning/learning?sessionId=${sessionId}&mode=continue`;
      console.log('🔄 使用默认模式跳转:', url);
      
      wx.navigateTo({
        url: url,
        fail: (error) => {
          wx.showToast({
            title: '跳转失败',
            icon: 'error'
          });
        }
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
        openid: '{openid}'
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
  /**
   * 加载最近学习记录（使用getUserHistory云函数）
   */
  async loadRecentSessions() {
    if (!app.globalData.openid) {
      return
    }

    try {
      // 修复：使用getUserHistory云函数替代dataService
      // 原因：dataService云函数存在错误，而getUserHistory能正常工作
      const result = await wx.cloud.callFunction({
        name: 'getUserHistory',
        data: {
          openid: app.globalData.openid,
          page: 1,
          pageSize: 3,
          type: 'sessions'
        }
      })

      if (result.result && result.result.success && result.result.data.sessions) {
        const sessions = result.result.data.sessions
        
        // 格式化时间和数据结构
        const formattedSessions = sessions.map(session => ({
          sessionId: session.sessionId,
          questionText: session.questionText || '数学题解答',
          startTime: session.startTime,
          lastUpdateTime: this.formatTime(session.startTime), // 使用startTime作为显示时间
          status: session.status,
          progress: session.progress
        }))
        
        this.setData({
          recentSessions: formattedSessions,
          hasRecentSessions: formattedSessions.length > 0
        })
      } else {
        // 如果没有数据，设置为空
        this.setData({
          recentSessions: [],
          hasRecentSessions: false
        })
      }
    } catch (error) {
      console.error('加载最近学习记录失败:', error)
      this.setData({
        recentSessions: [],
        hasRecentSessions: false
      })
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
   goToHistoryPage() {
    wx.navigateTo({
      url: '/pages/history/history'
    });
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
   * 格式化学习时长（分钟转换为小时分钟格式）
   * 修改原因：云函数返回的学习时长是分钟数，需要转换为用户友好的显示格式
   */
  formatLearningTime(minutes) {
    if (!minutes || minutes === 0) {
      return '0h 0m'
    }
    
    const hours = Math.floor(minutes / 60)
    const remainingMinutes = minutes % 60
    
    if (hours === 0) {
      return `${remainingMinutes}m`
    } else if (remainingMinutes === 0) {
      return `${hours}h`
    } else {
      return `${hours}h ${remainingMinutes}m`
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
   * 跳转到数据库测试页面
   * 仅在开发环境下可用
   */
  goToTest() {
    if (!this.data.isDevelopment) {
      wx.showToast({
        title: '该功能仅在开发环境可用',
        icon: 'none'
      });
      return;
    }

    console.log('跳转到数据库测试页面');
    wx.navigateTo({
      url: '/pages/test/test',
      success: () => {
        console.log('成功跳转到测试页面');
      },
      fail: (error) => {
        console.error('跳转测试页面失败:', error);
        wx.showToast({
          title: '跳转失败',
          icon: 'error'
        });
      }
    });
  }
});