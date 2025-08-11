// 云函数：handleAnswer
// 处理学生回答，生成AI反馈和下一个问题

const cloud = require('wx-server-sdk')
const OpenAI = require('openai')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

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
 * @param {string} event.answer - 学生回答
 * @param {number} event.currentRound - 当前轮次
 * @param {string} event.timestamp - 时间戳
 */
exports.main = async (event, context) => {
  console.log('handleAnswer 云函数开始执行', event)
  
  try {
    const { sessionId, userId, answer, currentRound, timestamp } = event
    
    // 参数验证
    if (!sessionId || !userId || !answer || currentRound === undefined) {
      return createErrorResponse('缺少必要参数', 'MISSING_PARAMS')
    }
    
    // 1. 获取会话数据
    console.log('获取会话数据...')
    const sessionResult = await db.collection('learning_sessions')
      .where({
        sessionId: sessionId,
        userId: userId
      })
      .get()
    
    if (sessionResult.data.length === 0) {
      return createErrorResponse('会话不存在', 'SESSION_NOT_FOUND')
    }
    
    const sessionData = sessionResult.data[0]
    console.log('会话数据:', sessionData)
    
    // 2. AI分析学生回答并生成反馈
    console.log('开始AI分析学生回答...')
    const aiResult = await analyzeAnswerWithAI(
      sessionData.questionText,
      sessionData.aiAnalysis,
      answer,
      currentRound,
      sessionData.dialogue
    )
    
    if (!aiResult.success) {
      return createErrorResponse('AI分析失败: ' + aiResult.error, 'AI_ANALYSIS_FAILED')
    }
    
    // 3. 更新对话记录
    const newDialogue = [
      ...sessionData.dialogue,
      {
        type: 'user',
        content: answer,
        round: currentRound,
        timestamp: timestamp
      },
      {
        type: 'ai',
        content: aiResult.data.feedback,
        nextQuestion: aiResult.data.nextQuestion,
        round: currentRound,
        timestamp: new Date().toISOString()
      }
    ]
    
    // 4. 判断是否完成所有轮次
    const isCompleted = currentRound >= sessionData.totalRounds
    const nextRound = isCompleted ? currentRound : currentRound + 1
    
    // 5. 更新会话数据
    const updateData = {
      dialogue: newDialogue,
      currentRound: nextRound,
      status: isCompleted ? 'completed' : 'active',
      updateTime: timestamp
    }
    
    if (isCompleted) {
      updateData.endTime = timestamp
    }
    
    console.log('更新会话数据...')
    await updateSessionData(sessionData._id, updateData)
    
    // 6. 记录用户行为
    await recordUserBehavior(userId, 'answer_submitted', {
      sessionId: sessionId,
      round: currentRound,
      answerLength: answer.length,
      isCompleted: isCompleted
    })
    
    // 7. 如果完成，生成学习报告
    let reportData = null
    if (isCompleted) {
      console.log('生成学习报告...')
      const reportResult = await generateLearningReport(sessionData, newDialogue)
      if (reportResult.success) {
        reportData = reportResult.data
      }
    }
    
    console.log('handleAnswer 云函数执行成功')
    
    return {
      success: true,
      data: {
        feedback: aiResult.data.feedback,
        nextQuestion: aiResult.data.nextQuestion,
        isCompleted: isCompleted,
        currentRound: nextRound,
        totalRounds: sessionData.totalRounds,
        report: reportData
      }
    }
    
  } catch (error) {
    console.error('handleAnswer 云函数执行失败:', error)
    return createErrorResponse(error.message || '服务器内部错误', 'INTERNAL_ERROR')
  }
}

/**
 * 使用预设问题序列进行追问式教学
 * @param {string} questionText - 原题目
 * @param {Object} aiAnalysis - AI题目分析（包含预设问题）
 * @param {string} answer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Array} dialogue - 对话历史
 * @returns {Object} AI分析结果
 */
async function analyzeAnswerWithAI(questionText, aiAnalysis, answer, currentRound, dialogue) {
  try {
    // 🎯 使用预设的问题序列
    const presetQuestions = aiAnalysis.questions || []
    
    // 根据当前轮次获取下一个问题
    let nextQuestion = null
    if (currentRound < 3 && presetQuestions.length >= currentRound) {
      nextQuestion = presetQuestions[currentRound] // 下一轮的问题
    } else if (currentRound >= 3) {
      nextQuestion = "很棒！你能总结一下解题思路吗？"
    }
    
    // 🤖 生成针对性反馈（保持AI分析学生回答的能力）
    const feedback = await generateFeedbackWithAI(questionText, aiAnalysis, answer, currentRound, dialogue)
    
    return {
      success: true,
      data: {
        feedback: feedback,
        nextQuestion: nextQuestion,
        analysis: {
          understanding_level: 3,
          thinking_quality: 3,
          communication_clarity: 3,
          suggestions: ['继续保持思考的积极性']
        }
      }
    }
    
  } catch (error) {
    console.error('AI分析学生回答失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 生成针对学生回答的个性化反馈
 * @param {string} questionText - 原题目
 * @param {Object} aiAnalysis - AI题目分析
 * @param {string} answer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Array} dialogue - 对话历史
 * @returns {string} 反馈内容
 */
async function generateFeedbackWithAI(questionText, aiAnalysis, answer, currentRound, dialogue) {
  try {
    // 构建对话上下文
    const conversationHistory = dialogue.map(item => ({
      role: item.type === 'user' ? 'user' : 'assistant',
      content: item.content
    }))
    
    // 🎯 优化后的提示词 - 专注于反馈生成
    const systemPrompt = `你是希希老师，专门生成鼓励性反馈。

原题目：${questionText}
关键关系：${aiAnalysis.keyRelation || '数量关系'}
当前轮次：${currentRound}/3

请对学生回答给出简短鼓励性反馈（≤30字）：
1. 肯定正确的部分
2. 温和指出需要思考的地方
3. 语言亲切，适合小学生

只返回反馈文字，不要JSON格式。`
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: answer }
    ]
    
    // 调用AI生成反馈
    const completion = await openai.chat.completions.create({
      model: "qwen-plus",
      messages: messages,
      temperature: 0.7,
      max_tokens: 100, // 限制长度
      top_p: 0.9
    })
    
    return completion.choices[0].message.content.trim()
    
  } catch (error) {
    console.error('生成反馈失败:', error)
    // 返回默认反馈
    const defaultFeedbacks = [
      "很好的思考！让我们继续探索。",
      "你的想法很有意思，再深入想想。",
      "不错的尝试！我们一起总结一下。"
    ]
    return defaultFeedbacks[Math.min(currentRound - 1, 2)]
  }
}

/**
 * 生成学习报告
 * @param {Object} sessionData - 会话数据
 * @param {Array} dialogue - 完整对话
 * @returns {Object} 报告数据
 */
async function generateLearningReport(sessionData, dialogue) {
  try {
    // 分析对话内容
    const userAnswers = dialogue.filter(item => item.type === 'user')
    const aiResponses = dialogue.filter(item => item.type === 'ai')
    
    // 计算学习时长
    const startTime = new Date(sessionData.startTime)
    const endTime = new Date(sessionData.endTime || new Date().toISOString())
    const learningTime = Math.round((endTime - startTime) / (1000 * 60)) // 分钟
    
    // 构建报告提示词
    const reportPrompt = buildReportPrompt(sessionData, userAnswers, aiResponses, learningTime)
    
    const completion = await openai.chat.completions.create({
      model: "qwen-plus",
      messages: [
        {
          role: 'system',
          content: '你是一位专业的教育评估专家，擅长分析学生的学习表现并生成详细的学习报告。'
        },
        {
          role: 'user',
          content: reportPrompt
        }
      ],
      temperature: 0.5,
      max_tokens: 2000,
      top_p: 0.8
    })
    
    const aiResponse = completion.choices[0].message.content
    console.log('AI报告生成响应:', aiResponse)
    
    // 解析报告数据
    const reportData = parseReportData(aiResponse, sessionData)
    
    // 保存报告到数据库
    await saveReportToDatabase(sessionData, reportData)
    
    return {
      success: true,
      data: reportData
    }
    
  } catch (error) {
    console.error('生成学习报告失败:', error)
    return {
      success: false,
      error: error.message
    }
  }
}

/**
 * 构建报告生成提示词
 * @param {Object} sessionData - 会话数据
 * @param {Array} userAnswers - 用户回答
 * @param {Array} aiResponses - AI响应
 * @param {number} learningTime - 学习时长
 * @returns {string} 提示词
 */
function buildReportPrompt(sessionData, userAnswers, aiResponses, learningTime) {
  return `请基于以下学习会话数据生成一份详细的学习报告：

题目：${sessionData.questionText}
学习时长：${learningTime}分钟
对话轮次：${sessionData.totalRounds}

学生回答记录：
${userAnswers.map((item, index) => `第${index + 1}轮：${item.content}`).join('\n')}

AI反馈记录：
${aiResponses.map((item, index) => `第${index + 1}轮：${item.content}`).join('\n')}

请生成JSON格式的学习报告，包含：
{
  "performance": {
    "score": "综合得分(0-100)",
    "strengths": ["优势点列表"],
    "improvements": ["改进建议列表"]
  },
  "thinkingAnalysis": {
    "logicalThinking": "逻辑思维(1-5)",
    "problemSolving": "问题解决(1-5)",
    "communication": "表达能力(1-5)",
    "creativity": "创新思维(1-5)"
  },
  "knowledgePoints": [
    {
      "name": "知识点名称",
      "mastery": "掌握程度百分比",
      "description": "描述"
    }
  ],
  "suggestions": ["学习建议列表"],
  "nextSteps": ["下一步学习计划"]
}`
}

/**
 * 解析AI生成的报告数据
 * @param {string} aiResponse - AI响应
 * @param {Object} sessionData - 会话数据
 * @returns {Object} 解析后的报告数据
 */
function parseReportData(aiResponse, sessionData) {
  let reportData
  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      reportData = JSON.parse(jsonMatch[0])
    } else {
      throw new Error('AI报告响应格式不正确')
    }
  } catch (parseError) {
    console.error('解析AI报告失败:', parseError)
    // 使用默认报告
    reportData = createDefaultReport()
  }
  
  // 添加基础信息
  reportData.questionText = sessionData.questionText
  reportData.startTime = sessionData.startTime
  reportData.endTime = sessionData.endTime
  reportData.completedRounds = sessionData.totalRounds
  reportData.generateTime = new Date().toISOString()
  
  return reportData
}

/**
 * 创建默认报告数据
 * @returns {Object} 默认报告
 */
function createDefaultReport() {
  return {
    performance: {
      score: 75,
      strengths: ['积极思考', '勇于表达'],
      improvements: ['可以更仔细地分析题目', '尝试多种解题方法']
    },
    thinkingAnalysis: {
      logicalThinking: 3,
      problemSolving: 3,
      communication: 3,
      creativity: 3
    },
    knowledgePoints: [
      {
        name: '基础数学运算',
        mastery: 70,
        description: '对基本运算有一定理解'
      }
    ],
    suggestions: [
      '继续保持学习的积极性',
      '多练习类似题型',
      '注意审题的仔细程度'
    ],
    nextSteps: [
      '复习相关基础知识',
      '练习更多同类型题目',
      '培养独立思考能力'
    ]
  }
}

/**
 * 更新会话数据
 * @param {string} sessionId - 会话文档ID
 * @param {Object} updateData - 更新数据
 */
async function updateSessionData(sessionId, updateData) {
  try {
    await db.collection('learning_sessions')
      .doc(sessionId)
      .update({
        data: updateData
      })
  } catch (error) {
    console.error('更新会话数据失败:', error)
    throw error
  }
}

/**
 * 保存报告到数据库
 * @param {Object} sessionData - 会话数据
 * @param {Object} reportData - 报告数据
 */
async function saveReportToDatabase(sessionData, reportData) {
  try {
    await db.collection('learning_reports').add({
      data: {
        sessionId: sessionData.sessionId,
        userId: sessionData.userId,
        reportData: reportData,
        timestamp: new Date().toISOString()
      }
    })
  } catch (error) {
    console.error('保存报告失败:', error)
    throw error
  }
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

/**
 * 创建错误响应
 * @param {string} error - 错误信息
 * @param {string} code - 错误代码
 * @returns {Object} 错误响应
 */
function createErrorResponse(error, code) {
  return {
    success: false,
    error: error,
    code: code
  }
}