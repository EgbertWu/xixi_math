// pages/index/index.js
// 希希数学小助手 首页逻辑

Page({
  /**
   * 页面的初始数据
   */
  data: {
    // 统计数据
    stats: {
      totalQuestions: 123,
      learningTime: '4h 30m',
      accuracy: '95%'
    },
    
    // 解题历史记录（示例数据）
    historyItems: [
      {
        id: 1,
        title: '加法运算',
        image: '/images/math-addition.png'
      },
      {
        id: 2,
        title: '减法运算', 
        image: '/images/math-subtraction.png'
      },
      {
        id: 3,
        title: '乘法运算',
        image: '/images/math-multiplication.png'
      },
      {
        id: 4,
        title: '除法运算',
        image: '/images/math-division.png'
      }
    ]
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('希希数学小助手首页加载');
    this.loadUserStats();
  },

  /**
   * 加载用户统计数据
   */
  loadUserStats() {
    // 从本地存储获取用户统计数据
    const userStats = wx.getStorageSync('userStats') || {
      totalQuestions: 0,
      learningTime: '0h 0m',
      accuracy: '0%'
    };
    
    this.setData({
      stats: userStats
    });
    
    // 加载解题历史记录
    this.loadLearningHistory();
  },

  /**
   * 加载学习历史记录
   */
  loadLearningHistory() {
    const historyList = wx.getStorageSync('learningHistory') || [];
    
    // 只显示最近的4条记录
    const recentHistory = historyList.slice(0, 4).map(item => ({
      id: item.sessionId,
      title: item.summary || '数学题解答',
      image: item.questionImage || '',
      timestamp: item.timestamp,
      sessionId: item.sessionId
    }));
    
    this.setData({
      historyItems: recentHistory
    });
  },

  /**
   * 开始拍照解题
   */
  startCamera() {
    wx.navigateTo({
      url: '/pages/camera/camera'
    });
  },

  /**
   * 跳转到相机页面
   */
  goToCamera() {
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
   * 生命周期函数--监听页面显示
   */
  onShow() {
    // 页面显示时刷新数据
    this.loadUserStats();
  }
});