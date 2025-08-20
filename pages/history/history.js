// pages/history/history.js
// 希希数学小助手 学习历史页面

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
    this.loadHistoryData()
  },

  /**
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 刷新数据
    this.refreshData()
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
   * 加载历史数据
   */
  async loadHistoryData() {
    if (this.data.loading || this.data.loadingMore) {
      return
    }

    // 检查用户登录状态
    if (!app.globalData.openid) {
      wx.showModal({
        title: '需要登录',
        content: '查看学习历史需要先登录账号',
        confirmText: '去登录',
        cancelText: '返回',
        success: (res) => {
          if (res.confirm) {
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

    const isFirstLoad = this.data.page === 0
    
    this.setData({
      loading: isFirstLoad,
      loadingMore: !isFirstLoad
    })

    try {
      const result = await wx.cloud.callFunction({
        name: 'dataService',
        data: {
          action: 'getLearningHistory',
          data: {
            openid: app.globalData.openid,
            limit: this.data.pageSize,
            skip: this.data.page * this.data.pageSize,
            status: this.data.currentFilter === 'all' ? null : this.data.currentFilter
          }
        }
      })

      if (result.result && result.result.success) {
        const { sessions, totalSessions, completedSessions, hasMore } = result.result.data
        
        // 格式化时间
        const formattedSessions = sessions.map(session => ({
          ...session,
          lastUpdateTime: this.formatTime(session.lastUpdateTime)
        }))
        
        this.setData({
          sessions: isFirstLoad ? formattedSessions : [...this.data.sessions, ...formattedSessions],
          totalSessions,
          completedSessions,
          hasMore,
          page: this.data.page + 1
        })
      } else {
        throw new Error(result.result?.error || '获取历史记录失败')
      }
    } catch (error) {
      console.error('加载历史数据失败:', error)
      wx.showToast({
        title: '加载失败，请重试',
        icon: 'none'
      })
    } finally {
      this.setData({
        loading: false,
        loadingMore: false
      })
    }
  },

  /**
   * 筛选条件改变
   */
  onFilterChange(e) {
    const filter = e.currentTarget.dataset.filter
    if (filter === this.data.currentFilter) {
      return
    }
    
    this.setData({
      currentFilter: filter,
      sessions: [],
      page: 0,
      hasMore: true
    })
    
    this.loadHistoryData()
  },

  /**
   * 加载更多
   */
  onLoadMore() {
    if (this.data.hasMore && !this.data.loadingMore) {
      this.loadHistoryData()
    }
  },

  /**
   * 点击会话项
   */
  onSessionTap(e) {
    const session = e.currentTarget.dataset.session
    
    if (session.status === 'completed') {
      // 已完成的会话，查看历史对话
      wx.navigateTo({
        url: `/pages/learning/learning?sessionId=${session.sessionId}&mode=history`
      })
    } else {
      // 未完成的会话，继续学习
      wx.showModal({
        title: '继续学习',
        content: '这道题还没有完成，是否继续学习？',
        confirmText: '继续',
        cancelText: '取消',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({
              url: `/pages/learning/learning?sessionId=${session.sessionId}&mode=continue`
            })
          }
        }
      })
    }
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
   * 格式化时间
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
    
    // 超过7天，显示具体日期
    return time.toLocaleDateString('zh-CN', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })
  }
})