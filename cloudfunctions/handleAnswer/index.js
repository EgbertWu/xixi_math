// 云函数：handleAnswer
// 处理学生回答，生成AI反馈和下一个问题

const cloud = require('wx-server-sdk')
const axios = require('axios')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()
const _ = db.command

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
      return {
        success: false,
        error: '缺少必要参数',
        code: 'MISSING_PARAMS'
      }
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
      return {
        success: false,
        error: '会话不存在',
        code: 'SESSION_NOT_FOUND'
      }
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
      return {
        success: false,
        error: 'AI分析失败: ' + aiResult.error,
        code: 'AI_ANALYSIS_FAILED'
      }
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
    await db.collection('learning_sessions')
      .doc(sessionData._id)
      .update({
        data: updateData
      })
    
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
    
    return {
      success: false,
      error: error.message || '服务器内部错误',
      code: 'INTERNAL_ERROR'
    }
  }
}

/**
 * 使用AI分析学生回答
 * @param {string} questionText - 原题目
 * @param {Object} aiAnalysis - AI题目分析
 * @param {string} answer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Array} dialogue - 对话历史
 * @returns {Object} AI分析结果
 */
async function analyzeAnswerWithAI(questionText, aiAnalysis, answer, currentRound, dialogue) {
  try {
    // 构建对话上下文
    const conversationHistory = dialogue.map(item => {
      return {
        role: item.type === 'user' ? 'user' : 'assistant',
        content: item.content
      }
    })
    
    // 构建系统提示
    const systemPrompt = `你是一位经验丰富的小学数学老师，正在使用苏格拉底式教学法指导学生。

原题目：${questionText}
题目分析：${JSON.stringify(aiAnalysis)}
当前轮次：${currentRound}/3

请根据学生的回答给出反馈，并提出下一个启发式问题。要求：
1. 对学生的回答给予积极的反馈，指出正确的部分
2. 如果有错误，不要直接指出，而是通过问题引导学生发现
3. 根据轮次调整问题难度：第1轮基础理解，第2轮深入分析，第3轮综合应用
4. 语言要鼓励性，适合小学生
5. 如果是第3轮，可以引导学生总结解题思路

请以JSON格式返回：
{
  "feedback": "对学生回答的反馈",
  "nextQuestion": "下一个启发式问题",
  "analysis": {
    "understanding_level": "理解程度(1-5)",
    "thinking_quality": "思维质量(1-5)",
    "communication_clarity": "表达清晰度(1-5)",
    "suggestions": ["改进建议"]
  }
}`
    
    const messages = [
      {
        role: 'system',
        content: systemPrompt
      },
      ...conversationHistory,
      {
        role: 'user',
        content: answer
      }
    ]
    
    // 调用通义千问API
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      {
        model: 'qwen-turbo',
        input: {
          messages: messages
        },
        parameters: {
          temperature: 0.7,
          max_tokens: 1000,
          top_p: 0.9
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.QWEN_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    )
    
    if (response.data.code) {
      throw new Error(`通义千问API错误: ${response.data.message}`)
    }
    
    const aiResponse = response.data.output.choices[0].message.content
    console.log('AI原始响应:', aiResponse)
    
    // 解析AI响应
    let responseData
    try {
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        responseData = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('AI响应格式不正确')
      }
    } catch (parseError) {
      console.error('解析AI响应失败:', parseError)
      // 使用默认响应
      responseData = {
        feedback: '很好的思考！让我们继续深入探讨这个问题。',
        nextQuestion: currentRound < 3 ? 
          '你能再详细说说你的想法吗？' : 
          '现在你能总结一下解决这道题的完整思路吗？',
        analysis: {
          understanding_level: 3,
          thinking_quality: 3,
          communication_clarity: 3,
          suggestions: ['继续保持思考的积极性']
        }
      }
    }
    
    return {
      success: true,
      data: responseData
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
    
    // 使用AI生成详细报告
    const reportPrompt = `请基于以下学习会话数据生成一份详细的学习报告：

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
    
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      {
        model: 'qwen-turbo',
        input: {
          messages: [
            {
              role: 'system',
              content: '你是一位专业的教育评估专家，擅长分析学生的学习表现并生成详细的学习报告。'
            },
            {
              role: 'user',
              content: reportPrompt
            }
          ]
        },
        parameters: {
          temperature: 0.5,
          max_tokens: 2000,
          top_p: 0.8
        }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.QWEN_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000
      }
    )
    
    if (response.data.code) {
      throw new Error(`通义千问API错误: ${response.data.message}`)
    }
    
    const aiResponse = response.data.output.choices[0].message.content
    console.log('AI报告生成响应:', aiResponse)
    
    // 解析报告数据
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
      reportData = {
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
    
    // 添加基础信息
    reportData.questionText = sessionData.questionText
    reportData.startTime = sessionData.startTime
    reportData.endTime = sessionData.endTime
    reportData.completedRounds = sessionData.totalRounds
    reportData.generateTime = new Date().toISOString()
    
    // 保存报告到数据库
    await db.collection('learning_reports').add({
      data: {
        sessionId: sessionData.sessionId,
        userId: sessionData.userId,
        reportData: reportData,
        timestamp: new Date().toISOString()
      }
    })
    
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