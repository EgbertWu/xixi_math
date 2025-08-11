// 云函数：generateReport
// 生成详细的学习报告

const cloud = require('wx-server-sdk')
const axios = require('axios')
const OpenAI = require('openai')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 初始化OpenAI客户端（千问兼容接口）
const openai = new OpenAI({
  apiKey: process.env.QWEN_API_KEY,
  baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
})

/**
 * 云函数入口函数
 * @param {Object} event - 事件参数
 * @param {string} event.sessionId - 会话ID
 * @param {string} event.userId - 用户ID
 * @param {string} event.timestamp - 时间戳
 */
exports.main = async (event, context) => {
  console.log('generateReport 云函数开始执行', event)
  
  try {
    const { sessionId, userId, timestamp } = event
    
    // 参数验证
    if (!sessionId || !userId) {
      return {
        success: false,
        error: '缺少必要参数',
        code: 'MISSING_PARAMS'
      }
    }
    
    // 1. 检查是否已有报告
    console.log('检查现有报告...')
    const existingReport = await db.collection('learning_reports')
      .where({
        sessionId: sessionId,
        userId: userId
      })
      .get()
    
    if (existingReport.data.length > 0) {
      console.log('返回现有报告')
      return {
        success: true,
        data: existingReport.data[0].reportData
      }
    }
    
    // 2. 获取会话数据
    console.log('获取会话数据...')
    const sessionResult = await db.collection('learning_sessions')
      .where({
        sessionId: sessionId,
        userId: userId,
        status: 'completed'
      })
      .get()
    
    if (sessionResult.data.length === 0) {
      return {
        success: false,
        error: '会话不存在或未完成',
        code: 'SESSION_NOT_FOUND'
      }
    }
    
    const sessionData = sessionResult.data[0]
    console.log('会话数据获取成功')
    
    // 3. 分析对话数据
    const analysisResult = analyzeDialogue(sessionData)
    
    // 4. 使用AI生成详细报告
    console.log('开始AI生成报告...')
    const aiReportResult = await generateAIReport(sessionData, analysisResult)
    
    if (!aiReportResult.success) {
      return {
        success: false,
        error: 'AI报告生成失败: ' + aiReportResult.error,
        code: 'AI_REPORT_FAILED'
      }
    }
    
    // 5. 构建完整报告数据
    const reportData = {
      ...aiReportResult.data,
      sessionId: sessionId,
      userId: userId,
      questionText: sessionData.questionText,
      startTime: sessionData.startTime,
      endTime: sessionData.endTime,
      completedRounds: sessionData.currentRound,
      totalRounds: sessionData.totalRounds,
      generateTime: timestamp || new Date().toISOString(),
      
      // 基础统计数据
      basicStats: analysisResult.basicStats,
      
      // 对话分析
      dialogueAnalysis: analysisResult.dialogueAnalysis
    }
    
    // 6. 保存报告到数据库
    console.log('保存报告到数据库...')
    await db.collection('learning_reports').add({
      data: {
        sessionId: sessionId,
        userId: userId,
        reportData: reportData,
        timestamp: reportData.generateTime
      }
    })
    
    // 7. 记录用户行为
    await recordUserBehavior(userId, 'report_generated', {
      sessionId: sessionId,
      score: reportData.performance.score,
      learningTime: analysisResult.basicStats.learningTime
    })
    
    console.log('generateReport 云函数执行成功')
    
    return {
      success: true,
      data: reportData
    }
    
  } catch (error) {
    console.error('generateReport 云函数执行失败:', error)
    
    return {
      success: false,
      error: error.message || '服务器内部错误',
      code: 'INTERNAL_ERROR'
    }
  }
}

/**
 * 分析对话数据
 * @param {Object} sessionData - 会话数据
 * @returns {Object} 分析结果
 */
function analyzeDialogue(sessionData) {
  const dialogue = sessionData.dialogue || []
  const userAnswers = dialogue.filter(item => item.type === 'user')
  const aiResponses = dialogue.filter(item => item.type === 'ai')
  
  // 计算基础统计
  const startTime = new Date(sessionData.startTime)
  const endTime = new Date(sessionData.endTime || new Date().toISOString())
  const learningTime = Math.round((endTime - startTime) / (1000 * 60)) // 分钟
  
  // 分析回答质量
  const answerLengths = userAnswers.map(item => item.content.length)
  const avgAnswerLength = answerLengths.length > 0 ? 
    Math.round(answerLengths.reduce((a, b) => a + b, 0) / answerLengths.length) : 0
  
  // 分析参与度
  const participationScore = Math.min(100, (userAnswers.length / sessionData.totalRounds) * 100)
  
  // 分析回答深度（基于长度和轮次）
  const depthScores = userAnswers.map((item, index) => {
    const expectedLength = 20 + (index * 10) // 期望长度随轮次增加
    return Math.min(100, (item.content.length / expectedLength) * 100)
  })
  const avgDepthScore = depthScores.length > 0 ? 
    Math.round(depthScores.reduce((a, b) => a + b, 0) / depthScores.length) : 0
  
  return {
    basicStats: {
      learningTime: learningTime,
      totalAnswers: userAnswers.length,
      avgAnswerLength: avgAnswerLength,
      participationScore: participationScore,
      depthScore: avgDepthScore
    },
    
    dialogueAnalysis: {
      userAnswers: userAnswers.map(item => ({
        round: item.round,
        content: item.content,
        length: item.content.length,
        timestamp: item.timestamp
      })),
      
      aiResponses: aiResponses.map(item => ({
        round: item.round,
        feedback: item.content,
        nextQuestion: item.nextQuestion,
        timestamp: item.timestamp
      }))
    }
  }
}

/**
 * 使用AI生成详细报告
 * @param {Object} sessionData - 会话数据
 * @param {Object} analysisResult - 分析结果
 * @returns {Object} AI报告结果
 */
async function generateAIReport(sessionData, analysisResult) {
  try {
    const { basicStats, dialogueAnalysis } = analysisResult
    
    // 构建详细的分析提示
    const reportPrompt = `请基于以下完整的学习会话数据生成一份专业的学习评估报告：

【题目信息】
题目内容：${sessionData.questionText}
题目分析：${JSON.stringify(sessionData.aiAnalysis)}

【学习统计】
学习时长：${basicStats.learningTime}分钟
回答次数：${basicStats.totalAnswers}次
平均回答长度：${basicStats.avgAnswerLength}字符
参与度得分：${basicStats.participationScore}%
深度得分：${basicStats.depthScore}%

【对话详情】
学生回答记录：
${dialogueAnalysis.userAnswers.map((item, index) => 
  `第${item.round}轮 (${item.length}字符)：${item.content}`
).join('\n')}

AI反馈记录：
${dialogueAnalysis.aiResponses.map((item, index) => 
  `第${item.round}轮反馈：${item.feedback}\n下一问题：${item.nextQuestion || '无'}`
).join('\n\n')}

请生成详细的JSON格式学习报告，要求：
1. 综合评估学生的学习表现
2. 分析思维能力的各个维度
3. 识别掌握的知识点和薄弱环节
4. 提供具体的改进建议
5. 制定下一步学习计划

返回格式：
{
  "performance": {
    "score": "综合得分(0-100，基于参与度、理解程度、表达能力等)",
    "level": "表现等级(优秀/良好/及格/需要改进)",
    "strengths": ["具体的优势点，如'逻辑思维清晰'、'勇于表达想法'等"],
    "improvements": ["具体的改进建议，如'可以更仔细地审题'、'尝试画图辅助思考'等"]
  },
  "thinkingAnalysis": {
    "logicalThinking": "逻辑思维能力(1-5分)",
    "problemSolving": "问题解决能力(1-5分)",
    "communication": "表达沟通能力(1-5分)",
    "creativity": "创新思维能力(1-5分)"
  },
  "knowledgePoints": [
    {
      "name": "具体知识点名称",
      "mastery": "掌握程度百分比(0-100)",
      "description": "掌握情况描述"
    }
  ],
  "suggestions": ["详细的学习建议，要具体可操作"],
  "nextSteps": ["下一步学习计划，要有针对性"]
}`
    
    // 调用通义千问API（OpenAI兼容接口）
    const completion = await openai.chat.completions.create({
      model: "qwen-plus",
      messages: [
        {
          role: 'system',
          content: '你是一位资深的教育评估专家和小学数学教师，具有丰富的学生评估经验。你擅长通过对话分析学生的学习表现，识别学习特点，并提供个性化的教学建议。请基于提供的学习数据生成专业、详细、有针对性的学习评估报告。'
        },
        {
          role: 'user',
          content: reportPrompt
        }
      ],
      temperature: 0.3,
      max_tokens: 2500,
      top_p: 0.8
    })
    
    const aiResponse = completion.choices[0].message.content
    console.log('AI报告生成响应:', aiResponse)
    
    // 解析AI响应
    let reportData
    try {
      // 尝试提取JSON
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        reportData = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('AI响应中未找到有效JSON')
      }
      
      // 验证必要字段
      if (!reportData.performance || !reportData.thinkingAnalysis) {
        throw new Error('AI响应缺少必要字段')
      }
      
    } catch (parseError) {
      console.error('解析AI报告失败:', parseError)
      console.log('原始AI响应:', aiResponse)
      
      // 生成基于统计数据的默认报告
      reportData = generateDefaultReport(basicStats, dialogueAnalysis, sessionData)
    }
    
    // 确保数据完整性
    reportData = ensureReportCompleteness(reportData, basicStats)
    
    return {
      success: true,
      data: reportData
    }
    
  } catch (error) {
    console.error('AI生成报告失败:', error)
    
    // 返回基于统计数据的默认报告
    const defaultReport = generateDefaultReport(
      analysisResult.basicStats, 
      analysisResult.dialogueAnalysis, 
      sessionData
    )
    
    return {
      success: true,
      data: defaultReport
    }
  }
}

/**
 * 生成默认报告
 * @param {Object} basicStats - 基础统计
 * @param {Object} dialogueAnalysis - 对话分析
 * @param {Object} sessionData - 会话数据
 * @returns {Object} 默认报告
 */
function generateDefaultReport(basicStats, dialogueAnalysis, sessionData) {
  // 基于统计数据计算得分
  const participationWeight = 0.3
  const depthWeight = 0.4
  const timeWeight = 0.3
  
  const timeScore = Math.min(100, Math.max(0, 100 - (basicStats.learningTime - 10) * 2)) // 10分钟为最佳
  const totalScore = Math.round(
    basicStats.participationScore * participationWeight +
    basicStats.depthScore * depthWeight +
    timeScore * timeWeight
  )
  
  // 确定等级
  let level = '需要改进'
  if (totalScore >= 85) level = '优秀'
  else if (totalScore >= 70) level = '良好'
  else if (totalScore >= 60) level = '及格'
  
  // 生成优势和改进建议
  const strengths = []
  const improvements = []
  
  if (basicStats.participationScore >= 80) {
    strengths.push('学习参与度很高，积极回答问题')
  } else {
    improvements.push('可以更积极地参与讨论，多表达自己的想法')
  }
  
  if (basicStats.depthScore >= 70) {
    strengths.push('回答内容较为详细，思考比较深入')
  } else {
    improvements.push('可以尝试更详细地解释自己的思路')
  }
  
  if (basicStats.learningTime <= 15) {
    strengths.push('学习效率较高，能够快速理解问题')
  } else if (basicStats.learningTime > 30) {
    improvements.push('可以提高学习效率，更快地抓住问题要点')
  }
  
  return {
    performance: {
      score: totalScore,
      level: level,
      strengths: strengths.length > 0 ? strengths : ['认真完成了学习任务'],
      improvements: improvements.length > 0 ? improvements : ['继续保持学习的积极性']
    },
    
    thinkingAnalysis: {
      logicalThinking: Math.min(5, Math.max(1, Math.round(basicStats.depthScore / 20))),
      problemSolving: Math.min(5, Math.max(1, Math.round(basicStats.participationScore / 20))),
      communication: Math.min(5, Math.max(1, Math.round(basicStats.avgAnswerLength / 10))),
      creativity: Math.min(5, Math.max(1, 3)) // 默认中等
    },
    
    knowledgePoints: [
      {
        name: sessionData.aiAnalysis?.subject || '数学基础',
        mastery: Math.max(50, totalScore),
        description: `通过本次学习，对相关知识点有了${level}的掌握`
      }
    ],
    
    suggestions: [
      '继续保持学习的积极性和好奇心',
      '多练习类似的题目来巩固知识',
      '尝试用不同的方法解决同一个问题',
      '注意仔细审题，理解题目要求'
    ],
    
    nextSteps: [
      '复习本次学习的相关知识点',
      '寻找更多同类型的练习题',
      '培养独立思考和解决问题的能力',
      '定期回顾和总结学习内容'
    ]
  }
}

/**
 * 确保报告数据完整性
 * @param {Object} reportData - 报告数据
 * @param {Object} basicStats - 基础统计
 * @returns {Object} 完整的报告数据
 */
function ensureReportCompleteness(reportData, basicStats) {
  // 确保performance字段
  if (!reportData.performance) {
    reportData.performance = {}
  }
  if (typeof reportData.performance.score !== 'number') {
    reportData.performance.score = Math.max(60, basicStats.participationScore)
  }
  if (!reportData.performance.strengths || !Array.isArray(reportData.performance.strengths)) {
    reportData.performance.strengths = ['认真完成了学习任务']
  }
  if (!reportData.performance.improvements || !Array.isArray(reportData.performance.improvements)) {
    reportData.performance.improvements = ['继续保持学习的积极性']
  }
  
  // 确保thinkingAnalysis字段
  if (!reportData.thinkingAnalysis) {
    reportData.thinkingAnalysis = {
      logicalThinking: 3,
      problemSolving: 3,
      communication: 3,
      creativity: 3
    }
  }
  
  // 确保数组字段
  if (!reportData.knowledgePoints || !Array.isArray(reportData.knowledgePoints)) {
    reportData.knowledgePoints = []
  }
  if (!reportData.suggestions || !Array.isArray(reportData.suggestions)) {
    reportData.suggestions = ['继续保持学习的积极性']
  }
  if (!reportData.nextSteps || !Array.isArray(reportData.nextSteps)) {
    reportData.nextSteps = ['复习相关知识点']
  }
  
  return reportData
}

/**
 * 记录用户行为
 * @param {string} userId - 用户ID
 * @param {string} action - 行为类型
 * @param {Object} data - 行为数据
 */
async function recordUserBehavior(userId, action, data) {
  try {
    await db.collection('user_behaviors').add({
      data: {
        userId: userId,
        action: action,
        data: data,
        timestamp: new Date().toISOString(),
        platform: 'miniprogram'
      }
    })
  } catch (error) {
    console.error('记录用户行为失败:', error)
    // 不影响主流程
  }
}