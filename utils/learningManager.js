// utils/learningManager.js
// 希希学习小助手 学习管理工具类

/**
 * 学习管理器
 * 负责管理学习会话、历史记录和摘要生成
 */
class LearningManager {
  
  /**
   * 生成学习摘要
   * @param {Object} sessionData - 会话数据
   * @returns {string} 摘要文本
   */
  static generateSummary(sessionData) {
    const { questionText, messages } = sessionData
    
    // 提取第一个问题作为摘要基础
    const firstQuestion = messages.find(msg => msg.type === 'ai' && msg.round === 1)
    
    if (!firstQuestion) {
      return questionText.length > 20 ? questionText.substring(0, 20) + '...' : questionText
    }
    
    // 根据问题类型生成不同的摘要
    const questionContent = firstQuestion.content
    
    if (questionContent.includes('计算') || questionContent.includes('算')) {
      return '数学计算题解答'
    } else if (questionContent.includes('应用题') || questionContent.includes('实际问题')) {
      return '数学应用题分析'
    } else if (questionContent.includes('几何') || questionContent.includes('图形')) {
      return '几何图形问题'
    } else if (questionContent.includes('方程') || questionContent.includes('未知数')) {
      return '方程求解问题'
    } else {
      // 默认摘要：提取问题关键词
      const keywords = this.extractKeywords(questionText)
      return keywords.length > 0 ? `${keywords[0]}相关问题` : '数学题解答'
    }
  }
  
  /**
   * 提取关键词
   * @param {string} text - 文本内容
   * @returns {Array} 关键词数组
   */
  static extractKeywords(text) {
    const mathKeywords = [
      '加法', '减法', '乘法', '除法', '分数', '小数', '百分数',
      '面积', '周长', '体积', '角度', '三角形', '正方形', '长方形',
      '方程', '未知数', '应用题', '速度', '时间', '距离'
    ]
    
    const foundKeywords = []
    mathKeywords.forEach(keyword => {
      if (text.includes(keyword)) {
        foundKeywords.push(keyword)
      }
    })
    
    return foundKeywords
  }
  
  /**
   * 保存学习记录到历史
   * @param {Object} sessionData - 完整的会话数据
   */
  static saveLearningHistory(sessionData) {
    try {
      // 获取现有历史记录
      const existingHistory = wx.getStorageSync('learningHistory') || []
      
      // 生成摘要
      const summary = this.generateSummary(sessionData)
      
      // 创建历史记录项
      const historyItem = {
        sessionId: sessionData.sessionId,
        questionText: sessionData.questionText,
        questionImage: sessionData.questionImage,
        summary: summary,
        messages: sessionData.messages || [],
        currentRound: sessionData.currentRound || 1,
        isComplete: sessionData.isComplete || false,
        timestamp: new Date().toISOString(),
        createTime: new Date().toLocaleString('zh-CN')
      }
      
      // 检查是否已存在该会话
      const existingIndex = existingHistory.findIndex(item => item.sessionId === sessionData.sessionId)
      
      if (existingIndex >= 0) {
        // 更新现有记录
        existingHistory[existingIndex] = historyItem
      } else {
        // 添加新记录到开头
        existingHistory.unshift(historyItem)
      }
      
      // 限制历史记录数量（最多保存50条）
      const limitedHistory = existingHistory.slice(0, 50)
      
      // 保存到本地存储
      wx.setStorageSync('learningHistory', limitedHistory)
      
      // 更新用户统计数据
      this.updateUserStats(sessionData)
      
      console.log('学习记录保存成功', historyItem)
      return historyItem
      
    } catch (error) {
      console.error('保存学习记录失败', error)
      return null
    }
  }
  
  /**
   * 更新用户统计数据
   * @param {Object} sessionData - 会话数据
   */
  static updateUserStats(sessionData) {
    try {
      // 获取现有统计数据
      const currentStats = wx.getStorageSync('userStats') || {
        totalQuestions: 0,
        learningTime: '0h 0m',
        accuracy: '0%',
        totalMinutes: 0
      }
      
      // 更新题目数量
      currentStats.totalQuestions += 1
      
      // 估算学习时间（每轮对话约3-5分钟）
      const sessionMinutes = (sessionData.currentRound || 1) * 4
      currentStats.totalMinutes += sessionMinutes
      
      // 格式化学习时间
      const hours = Math.floor(currentStats.totalMinutes / 60)
      const minutes = currentStats.totalMinutes % 60
      currentStats.learningTime = `${hours}h ${minutes}m`
      
      // 计算准确率（简单估算，基于完成轮数）
      const completionRate = Math.min(100, 70 + (sessionData.currentRound || 1) * 10)
      currentStats.accuracy = `${completionRate}%`
      
      // 保存更新后的统计数据
      wx.setStorageSync('userStats', currentStats)
      
      console.log('用户统计数据更新成功', currentStats)
      
    } catch (error) {
      console.error('更新用户统计失败', error)
    }
  }
  
  /**
   * 获取学习历史记录
   * @param {number} limit - 限制返回数量
   * @returns {Array} 历史记录数组
   */
  static getLearningHistory(limit = 10) {
    try {
      const history = wx.getStorageSync('learningHistory') || []
      return limit > 0 ? history.slice(0, limit) : history
    } catch (error) {
      console.error('获取学习历史失败', error)
      return []
    }
  }
  
  /**
   * 根据会话ID获取特定的学习记录
   * @param {string} sessionId - 会话ID
   * @returns {Object|null} 学习记录或null
   */
  static getLearningRecord(sessionId) {
    try {
      const history = wx.getStorageSync('learningHistory') || []
      return history.find(item => item.sessionId === sessionId) || null
    } catch (error) {
      console.error('获取学习记录失败', error)
      return null
    }
  }
  
  /**
   * 删除学习记录
   * @param {string} sessionId - 会话ID
   * @returns {boolean} 是否删除成功
   */
  static deleteLearningRecord(sessionId) {
    try {
      const history = wx.getStorageSync('learningHistory') || []
      const filteredHistory = history.filter(item => item.sessionId !== sessionId)
      
      wx.setStorageSync('learningHistory', filteredHistory)
      console.log('学习记录删除成功', sessionId)
      return true
      
    } catch (error) {
      console.error('删除学习记录失败', error)
      return false
    }
  }
  
  /**
   * 清空所有学习历史
   * @returns {boolean} 是否清空成功
   */
  static clearAllHistory() {
    try {
      wx.removeStorageSync('learningHistory')
      console.log('所有学习历史已清空')
      return true
    } catch (error) {
      console.error('清空学习历史失败', error)
      return false
    }
  }
}

module.exports = LearningManager