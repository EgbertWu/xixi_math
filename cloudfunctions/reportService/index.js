// 云函数：reportService
// 统一的报告服务 - 合并了 generateReport 和 getReportData 的功能
// 优化原因：减少云函数数量，统一报告相关操作，提高维护效率

const cloud = require('wx-server-sdk')
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
 * @param {string} event.action - 操作类型：'generate' 生成报告 | 'get' 获取报告
 * @param {string} event.sessionId - 会话ID
 * @param {string} event.userId - 用户ID
 * @param {string} event.timestamp - 时间戳（生成报告时使用）
 */
exports.main = async (event, context) => {
  console.log('reportService 云函数开始执行', event)
  
  try {
    const { action, sessionId, userId, timestamp } = event
    
    // 参数验证
    if (!action || !sessionId || !userId) {
      return createErrorResponse('缺少必要参数', 'MISSING_PARAMS')
    }
    
    // 根据操作类型分发处理
    switch (action) {
      case 'generate':
        return await generateReport(sessionId, userId, timestamp)
      case 'get':
        return await getReport(sessionId, userId)
      default:
        return createErrorResponse('无效的操作类型', 'INVALID_ACTION')
    }
    
  } catch (error) {
    console.error('reportService 云函数执行失败:', error)
    return createErrorResponse(error.message || '服务器内部错误', 'INTERNAL_ERROR')
  }
}

/**
 * 生成学习报告
 * @param {string} sessionId - 会话ID
 * @param {string} userId - 用户ID
 * @param {string} timestamp - 时间戳
 * @returns {Object} 生成结果
 */
async function generateReport(sessionId, userId, timestamp) {
  console.log('开始生成报告...')
  
  try {
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
        data: existingReport.data[0].reportData,
        fromCache: true
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
      return createErrorResponse('会话不存在或未完成', 'SESSION_NOT_FOUND')
    }
    
    const sessionData = sessionResult.data[0]
    console.log('会话数据获取成功')
    
    // 3. 分析对话数据
    const analysisResult = analyzeDialogue(sessionData)
    
    // 4. 使用AI生成详细报告
    console.log('开始AI生成报告...')
    const aiReportResult = await generateAIReport(sessionData, analysisResult)
    
    if (!aiReportResult.success) {
      return createErrorResponse('AI报告生成失败: ' + aiReportResult.error, 'AI_REPORT_FAILED')
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
    
    // 7. 记录用户行为（调用统一的数据服务）
    await recordUserBehavior(userId, 'report_generated', {
      sessionId: sessionId,
      score: reportData.performance?.score || 0,
      learningTime: analysisResult.basicStats.learningTime
    })
    
    console.log('报告生成成功')
    
    return {
      success: true,
      data: reportData,
      fromCache: false
    }
    
  } catch (error) {
    console.error('生成报告失败:', error)
    throw error
  }
}

/**
 * 获取学习报告
 * @param {string} sessionId - 会话ID
 * @param {string} userId - 用户ID
 * @returns {Object} 获取结果
 */
async function getReport(sessionId, userId) {
  console.log('获取报告数据...')
  
  try {
    // 查询报告数据
    const reportResult = await db.collection('learning_reports')
      .where({
        sessionId: sessionId,
        userId: userId
      })
      .get()
    
    if (reportResult.data.length === 0) {
      // 如果没有找到报告，尝试查找会话数据并返回基本信息
      const sessionResult = await db.collection('learning_sessions')
        .where({
          sessionId: sessionId,
          userId: userId
        })
        .get()
      
      if (sessionResult.data.length === 0) {
        return createErrorResponse('未找到相关学习数据', 'DATA_NOT_FOUND')
      }
      
      // 返回会话数据，前端可以使用它来显示基本信息
      return {
        success: true,
        data: {
          sessionData: sessionResult.data[0],
          reportData: null
        },
        message: '未找到报告数据，但返回了会话数据'
      }
    }
    
    // 返回报告数据
    return {
      success: true,
      data: reportResult.data[0]
    }
    
  } catch (error) {
    console.error('获取报告失败:', error)
    throw error
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
    const prompt = buildReportPrompt(sessionData, analysisResult)
    
    const completion = await openai.chat.completions.create({
      model: "qwen-plus",
      messages: [
        {
          role: "system",
          content: "你是希希老师，一位专业的小学数学教育专家。请根据学生的学习过程生成详细的学习报告。"
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 2000,
      temperature: 0.7,
      response_format: { type: "json_object" }
    })
    
    const aiResponse = JSON.parse(completion.choices[0].message.content)
    
    return {
      success: true,
      data: aiResponse
    }
    
  } catch (error) {
    console.error('AI报告生成失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 构建报告生成提示词
 * @param {Object} sessionData - 会话数据
 * @param {Object} analysisResult - 分析结果
 * @returns {string} 提示词
 */
function buildReportPrompt(sessionData, analysisResult) {
  return `请为以下学习会话生成详细的学习报告：

题目：${sessionData.questionText}
学习时长：${analysisResult.basicStats.learningTime}分钟
回答轮次：${analysisResult.basicStats.totalAnswers}/${sessionData.totalRounds}
平均回答长度：${analysisResult.basicStats.avgAnswerLength}字
参与度评分：${analysisResult.basicStats.participationScore}%

学生回答记录：
${analysisResult.dialogueAnalysis.userAnswers.map((answer, index) => 
  `第${answer.round}轮：${answer.content}`
).join('\n')}

请生成JSON格式的学习报告，包含以下字段：
{
  "performance": {
    "score": "综合评分(0-100)",
    "understanding": "理解程度评价",
    "participation": "参与度评价",
    "thinking": "思维能力评价"
  },
  "strengths": ["优点1", "优点2"],
  "improvements": ["改进建议1", "改进建议2"],
  "encouragement": "鼓励话语",
  "nextSteps": ["下一步学习建议1", "下一步学习建议2"]
}`
}

/**
 * 记录用户行为（临时函数，后续会调用统一的dataService）
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

/**
 * 创建错误响应
 * @param {string} message - 错误消息
 * @param {string} code - 错误代码
 * @returns {Object} 错误响应
 */
function createErrorResponse(message, code) {
  return {
    success: false,
    error: message,
    code: code
  }
}