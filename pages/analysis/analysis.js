// pages/analysis/analysis.js
// 希希数学小助手 详细分析页面逻辑

const app = getApp()

Page({
  /**
   * 页面的初始数据
   */
  data: {
    type: '', // 分析类型：thinking(思维能力)、knowledge(知识点)、suggestions(学习建议)
    title: '', // 页面标题
    content: {}, // 分析内容
    sessionId: '', // 会话ID
    reportData: null // 报告数据
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('分析页面加载', options)
    
    const type = options.type || 'thinking'
    const sessionId = options.sessionId
    
    // 设置页面标题
    let title = '详细分析'
    switch (type) {
      case 'thinking':
        title = '思维能力分析'
        break
      case 'knowledge':
        title = '知识点掌握'
        break
      case 'suggestions':
        title = '学习建议'
        break
    }
    
    this.setData({
      type,
      title,
      sessionId
    })
    
    // 设置导航栏标题
    wx.setNavigationBarTitle({
      title: title
    })
    
    // 加载报告数据
    this.loadReportData()
    
    // 记录页面访问
    app.trackUserBehavior('page_visit', {
      page: 'analysis',
      type: type,
      sessionId: sessionId
    })
  },

  /**
   * 加载报告数据
   */
  loadReportData() {
    // 如果有缓存的报告数据，直接使用
    if (app.globalData.reportData) {
      this.processReportData(app.globalData.reportData)
      return
    }
    
    // 否则从云端获取
    if (this.data.sessionId) {
      wx.showLoading({
        title: '加载中...',
        mask: true
      })
      
      wx.cloud.callFunction({
        name: 'getReportData',
        data: {
          sessionId: this.data.sessionId,
          openid: app.globalData.openid
        },
        success: (res) => {
          console.log('报告数据获取成功', res)
          
          if (res.result && res.result.success) {
            const reportData = res.result.data.reportData
            this.processReportData(reportData)
            
            // 缓存报告数据
            app.globalData.reportData = reportData
          } else {
            this.handleLoadError(res.result?.error || '报告数据获取失败')
          }
        },
        fail: (err) => {
          console.error('获取报告数据失败', err)
          this.handleLoadError('网络错误，请重试')
        },
        complete: () => {
          wx.hideLoading()
        }
      })
    } else {
      wx.showToast({
        title: '缺少会话ID',
        icon: 'none'
      })
      
      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    }
  },

  /**
   * 处理报告数据
   * @param {Object} reportData - 报告数据
   */
  processReportData(reportData) {
    if (!reportData) {
      this.handleLoadError('报告数据为空')
      return
    }
    
    let content = {}
    
    switch (this.data.type) {
      case 'thinking':
        content = this.processThinkingAnalysis(reportData.thinkingAnalysis)
        break
      case 'knowledge':
        content = this.processKnowledgePoints(reportData.knowledgePoints)
        break
      case 'suggestions':
        content = this.processSuggestions(reportData.suggestions, reportData.nextSteps)
        break
    }
    
    this.setData({
      reportData,
      content
    })
  },

  /**
   * 处理思维能力分析数据
   * @param {Object} thinkingAnalysis - 思维能力分析数据
   * @returns {Object} 处理后的数据
   */
  processThinkingAnalysis(thinkingAnalysis) {
    if (!thinkingAnalysis) {
      return {
        items: []
      }
    }
    
    const getDescription = (ability, score) => {
      const descriptions = {
        logicalThinking: {
          1: '逻辑思维能力有待提升，在解题过程中可能存在思路不清晰的情况。',
          2: '逻辑思维基础已具备，但在复杂问题分析时仍需加强。',
          3: '逻辑思维能力处于中等水平，能够进行基本的逻辑推理。',
          4: '逻辑思维能力较强，能够清晰地分析问题并找出解决方案。',
          5: '逻辑思维能力出色，能够系统地分析复杂问题，思路清晰有条理。'
        },
        problemSolving: {
          1: '问题解决能力需要提升，在面对挑战时可能感到困难。',
          2: '具备基本的问题解决能力，但在复杂问题面前仍需指导。',
          3: '问题解决能力处于中等水平，能够解决常见类型的问题。',
          4: '问题解决能力较强，能够灵活运用所学知识解决问题。',
          5: '问题解决能力出色，能够创造性地解决复杂问题，思路灵活多变。'
        },
        communication: {
          1: '数学表达能力有待提升，在表述解题思路时可能不够清晰。',
          2: '具备基本的数学表达能力，但表述可能不够完整。',
          3: '数学表达能力处于中等水平，能够基本表述自己的解题思路。',
          4: '数学表达能力较强，能够清晰地表述解题思路和方法。',
          5: '数学表达能力出色，能够准确、清晰、完整地表述复杂的解题过程。'
        },
        creativity: {
          1: '创新思维有待培养，在解题时倾向于使用常规方法。',
          2: '具备基本的创新意识，但在实际解题中应用较少。',
          3: '创新思维处于中等水平，有时能够尝试不同的解题方法。',
          4: '创新思维能力较强，能够从多角度思考问题。',
          5: '创新思维能力出色，能够灵活运用多种方法，善于发现问题的新解法。'
        }
      }
      
      return descriptions[ability][score] || '暂无详细描述'
    }
    
    const getImprovement = (ability, score) => {
      if (score >= 4) return [] // 高分不需要改进建议
      
      const improvements = {
        logicalThinking: [
          '多做逻辑推理类题目，如数独、逻辑谜题等',
          '练习将复杂问题分解为简单步骤',
          '尝试用图表或思维导图整理思路',
          '学习基本的逻辑规则和推理方法'
        ],
        problemSolving: [
          '多练习不同类型的数学题目',
          '学习多种解题策略和方法',
          '遇到难题时，尝试从简单情况入手',
          '培养审题习惯，确保理解题目要求'
        ],
        communication: [
          '练习用完整句子表达解题思路',
          '学习数学术语，提高表达准确性',
          '尝试向他人讲解数学概念或解题过程',
          '写下解题步骤，培养条理清晰的表达能力'
        ],
        creativity: [
          '尝试用多种方法解决同一个问题',
          '思考问题时不要局限于常规思路',
          '学习经典问题的多种解法',
          '培养发散思维，多问"还有其他方法吗"'
        ]
      }
      
      // 根据分数返回不同数量的建议
      const count = 5 - score // 分数越低，建议越多
      return improvements[ability].slice(0, count)
    }
    
    // 构建分析项
    const items = [
      {
        name: '逻辑思维',
        key: 'logicalThinking',
        score: thinkingAnalysis.logicalThinking || 3,
        description: getDescription('logicalThinking', thinkingAnalysis.logicalThinking || 3),
        improvements: getImprovement('logicalThinking', thinkingAnalysis.logicalThinking || 3)
      },
      {
        name: '问题解决',
        key: 'problemSolving',
        score: thinkingAnalysis.problemSolving || 3,
        description: getDescription('problemSolving', thinkingAnalysis.problemSolving || 3),
        improvements: getImprovement('problemSolving', thinkingAnalysis.problemSolving || 3)
      },
      {
        name: '表达能力',
        key: 'communication',
        score: thinkingAnalysis.communication || 3,
        description: getDescription('communication', thinkingAnalysis.communication || 3),
        improvements: getImprovement('communication', thinkingAnalysis.communication || 3)
      },
      {
        name: '创新思维',
        key: 'creativity',
        score: thinkingAnalysis.creativity || 3,
        description: getDescription('creativity', thinkingAnalysis.creativity || 3),
        improvements: getImprovement('creativity', thinkingAnalysis.creativity || 3)
      }
    ]
    
    return {
      items: items
    }
  },

  /**
   * 处理知识点数据
   * @param {Array} knowledgePoints - 知识点数据
   * @returns {Object} 处理后的数据
   */
  processKnowledgePoints(knowledgePoints) {
    if (!knowledgePoints || !Array.isArray(knowledgePoints) || knowledgePoints.length === 0) {
      return {
        points: []
      }
    }
    
    // 为每个知识点添加详细信息
    const points = knowledgePoints.map(point => {
      // 根据掌握程度生成建议
      let suggestions = []
      if (point.mastery < 60) {
        suggestions = [
          `重点复习"${point.name}"的基本概念和方法`,
          `寻找更多关于"${point.name}"的入门练习题`,
          `可以请教老师或同学关于"${point.name}"的疑问`
        ]
      } else if (point.mastery < 80) {
        suggestions = [
          `继续练习"${point.name}"相关的中等难度题目`,
          `尝试用不同方法解决"${point.name}"相关问题`,
          `复习"${point.name}"的关键概念和解题技巧`
        ]
      } else {
        suggestions = [
          `尝试"${point.name}"的高难度挑战题`,
          `尝试向他人讲解"${point.name}"相关概念`,
          `探索"${point.name}"与其他知识点的联系`
        ]
      }
      
      // 获取掌握程度描述
      let levelText = ''
      let levelClass = ''
      if (point.mastery >= 80) {
        levelText = '优秀'
        levelClass = 'excellent'
      } else if (point.mastery >= 70) {
        levelText = '良好'
        levelClass = 'good'
      } else if (point.mastery >= 60) {
        levelText = '及格'
        levelClass = 'pass'
      } else {
        levelText = '需要加强'
        levelClass = 'improve'
      }
      
      return {
        ...point,
        levelText,
        levelClass,
        suggestions
      }
    })
    
    return {
      points: points
    }
  },

  /**
   * 处理学习建议数据
   * @param {Array} suggestions - 学习建议
   * @param {Array} nextSteps - 下一步计划
   * @returns {Object} 处理后的数据
   */
  processSuggestions(suggestions, nextSteps) {
    if (!suggestions || !Array.isArray(suggestions)) {
      suggestions = []
    }
    
    if (!nextSteps || !Array.isArray(nextSteps)) {
      nextSteps = []
    }
    
    // 为每条建议添加图标和详细说明
    const processedSuggestions = suggestions.map((item, index) => {
      // 根据内容选择图标
      let icon = '💡'
      if (item.includes('练习')) icon = '✏️'
      else if (item.includes('复习')) icon = '📚'
      else if (item.includes('思考')) icon = '🧠'
      else if (item.includes('尝试')) icon = '🔍'
      
      // 生成详细说明
      let detail = ''
      if (index === 0) {
        detail = '这是提升学习效果的关键建议，建议优先采纳。'
      } else if (index === suggestions.length - 1) {
        detail = '长期坚持这一建议，将有助于持续提高学习能力。'
      } else {
        detail = '这一建议针对你的具体学习情况，有针对性地解决问题。'
      }
      
      return {
        content: item,
        icon,
        detail
      }
    })
    
    // 处理下一步计划
    const processedNextSteps = nextSteps.map((item, index) => {
      return {
        content: item,
        step: index + 1
      }
    })
    
    return {
      suggestions: processedSuggestions,
      nextSteps: processedNextSteps
    }
  },

  /**
   * 处理加载错误
   * @param {string} errorMsg - 错误信息
   */
  handleLoadError(errorMsg) {
    wx.showToast({
      title: errorMsg,
      icon: 'none',
      duration: 2000
    })
    
    setTimeout(() => {
      wx.navigateBack()
    }, 2000)
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack()
  },

  /**
   * 分享
   */
  onShareAppMessage() {
    return {
      title: `${this.data.title} - 希希数学小助手`,
      path: `/pages/index/index`
    }
  }
})