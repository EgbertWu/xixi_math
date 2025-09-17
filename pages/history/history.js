// pages/history/history.js
// 希希学习小助手 学习历史页面

const app = getApp()

Page({
  data: {
    sessions: [],
    totalSessions: 0,
    completedSessions: 0,
    currentFilter: 'all', // all, completed, incomplete
    loading: false,
    loadingMore: false,
    hasMore: true,
    page: 0,
    pageSize: 10
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('历史页面加载', options)
    // 修改原因：添加登录检查，确保用户已完整登录后再加载历史数据
    if (!app.isUserLogin()) {
      app.requireLogin('查看解题记录需要先登录', () => {
        this.loadHistoryData()
      })
    } else {
      this.loadHistoryData()
    }
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 修改原因：页面显示时检查登录状态，避免未登录用户看到空白页面
    if (app.isUserLogin()) {
      this.refreshData()
    }
  },

  /**
   * 刷新数据
   */
  refreshData() {
    // 修改原因：刷新数据前检查登录状态
    if (!app.isUserLogin()) {
      app.requireLogin('查看解题记录需要先登录', () => {
        this.setData({
          sessions: [],
          page: 0,
          hasMore: true
        })
        this.loadHistoryData()
      })
      return
    }
    
    this.setData({
      sessions: [],
      page: 0,
      hasMore: true
    })
    this.loadHistoryData()
  },

  /**
   * 下拉刷新
   */
  onPullDownRefresh() {
    this.refreshData()
    wx.stopPullDownRefresh()
  },

  /**
   * 刷新数据
   */
  refreshData() {
    this.setData({
      sessions: [],
      page: 0,
      hasMore: true
    })
    this.loadHistoryData()
  },

  /**
   * 筛选切换事件处理
   * 修改原因：添加状态值映射，将前端筛选值转换为数据库对应的状态值
   */
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    console.log('🔄 切换筛选条件:', filter)
    
    this.setData({
      currentFilter: filter,
      sessions: [],
      page: 0,
      hasMore: true
    })
    
    this.loadHistoryData()
  },

  /**
   * 加载更多数据
   * 修改原因：添加加载更多功能，支持分页加载历史记录
   */
  onLoadMore() {
    if (this.data.loadingMore || !this.data.hasMore) {
      return
    }
    
    console.log('🔄 加载更多数据...')
    this.setData({
      page: this.data.page + 1,
      loadingMore: true
    })
    
    this.loadHistoryData()
  },

  /**
   * 加载历史数据
   * 改动原因：添加返回结果处理和错误处理逻辑
   */
  async loadHistoryData() {
    this.setData({ loading: this.data.page === 0 })
    
    try {
      console.log('🔄 开始加载历史数据...', {
        openid: app.globalData.openid,
        page: this.data.page,
        filter: this.data.currentFilter
      })
      
      // 将前端筛选值映射为数据库状态值
      let dbStatus = this.data.currentFilter
      if (this.data.currentFilter === 'incomplete') {
        dbStatus = 'active'  // 将'incomplete'映射为'active'
      }
      
      const result = await wx.cloud.callFunction({
        name: 'dataService',
        data: {
          action: 'getLearningHistory',
          data: {
            openid: app.globalData.openid,
            limit: this.data.pageSize,
            skip: this.data.page * this.data.pageSize,
            status: dbStatus === 'all' ? null : dbStatus,
            sessions: this.data.sessions
          }
        }
      })
      
      console.log('📊 云函数返回结果:', result)
      
      if (result.result && result.result.success) {
        const { sessions, totalSessions, completedSessions, hasMore } = result.result.data
        
        // 修改原因：在数据加载时格式化时间，解决WXML中无法调用函数的问题
        const formattedSessions = sessions.map(session => ({
          ...session,
          formattedTime: this.formatTime(session.lastUpdateTime)
        }))
        
        this.setData({
          sessions: this.data.page === 0 ? formattedSessions : [...this.data.sessions, ...formattedSessions],
          totalSessions,
          completedSessions,
          hasMore,
          loading: false,
          loadingMore: false
        })
        
        console.log('✅ 历史数据加载成功:', {
          sessionsCount: sessions.length,
          totalSessions,
          completedSessions
        })
      } else {
        console.error('❌ 云函数返回失败:', result.result)
        this.setData({
          sessions: this.data.page === 0 ? [] : this.data.sessions,
          loading: false,
          loadingMore: false
        })
        
        wx.showToast({
          title: '加载历史记录失败',
          icon: 'none'
        })
      }
    } catch (error) {
      console.error('❌ 加载历史数据失败:', error)
      this.setData({
        loading: false,
        loadingMore: false
      })
      
      wx.showToast({
        title: '网络错误，请重试',
        icon: 'none'
      })
    }
  },
  
  /**
   * 点击会话项
   */
  onSessionTap(e) {
    const session = e.currentTarget.dataset.session;
    console.log('点击会话项:', session);
    
    if (!session || !session.sessionId) {
      console.error('会话数据无效:', session);
      wx.showToast({
        title: '会话数据无效',
        icon: 'error'
      });
      return;
    }
  
    const sessionId = session.sessionId;
    const status = session.status;
    console.log('sessionId:', sessionId);
    console.log('status:', status);
    
    // 根据状态确定跳转模式
    const mode = status === 'completed' ? 'history' : 'continue';
    const url = `/pages/learning/learning?sessionId=${sessionId}&mode=${mode}`;
    
    console.log('跳转URL:', url);
    
    // 添加加载提示
    wx.showLoading({
      title: '加载中...',
      mask: true
    });
    
    wx.navigateTo({
      url: url,
      success: () => {
        console.log('跳转成功');
        wx.hideLoading();
      },
      fail: (err) => {
        console.error('跳转失败:', err);
        wx.hideLoading();
        wx.showToast({
          title: '页面跳转失败',
          icon: 'error'
        });
      }
    });
  },

  /**
   * 跳转到拍照页面
   */
  goToCamera() {
    wx.navigateTo({
      url: '/pages/camera/camera'
    })
  },

  /**
   * 格式化时间 - 修改为更简洁的显示格式
   * 修改原因：优化时间显示，避免过长的时间字符串影响布局
   */
  formatTime(timeString) {
    if (!timeString) return ''
    
    const time = new Date(timeString)
    const now = new Date()
    const diff = now - time
    
    // 小于1分钟
    if (diff < 60 * 1000) {
      return '刚刚'
    }
    
    // 小于1小时
    if (diff < 60 * 60 * 1000) {
      return `${Math.floor(diff / (60 * 1000))}分钟前`
    }
    
    // 小于1天
    if (diff < 24 * 60 * 60 * 1000) {
      return `${Math.floor(diff / (60 * 60 * 1000))}小时前`
    }
    
    // 小于7天
    if (diff < 7 * 24 * 60 * 60 * 1000) {
      return `${Math.floor(diff / (24 * 60 * 60 * 1000))}天前`
    }
    
    // 超过7天，显示简洁的日期时间格式
    const year = time.getFullYear()
    const month = String(time.getMonth() + 1).padStart(2, '0')
    const day = String(time.getDate()).padStart(2, '0')
    const hour = String(time.getHours()).padStart(2, '0')
    const minute = String(time.getMinutes()).padStart(2, '0')
    const second = String(time.getSeconds()).padStart(2, '0')
    
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
  }
})