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
 * @param {string} event.userAnswer - 学生回答
 * @param {number} event.currentRound - 当前轮次
 * @param {string} event.timestamp - 时间戳
 */
exports.main = async (event, context) => {
  console.log('handleAnswer 云函数开始执行', event)
  
  try {
    const { sessionId, userId, userAnswer, currentRound, timestamp } = event
    
    // 参数验证
    if (!sessionId || !userId || !userAnswer || currentRound === undefined) {
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
    console.log('分析学生回答...')
    const aiResult = await analyzeAnswerWithAI(
      sessionData.questionText,
      sessionData.aiAnalysis,
      userAnswer,
      currentRound,
      sessionData.dialogue
    )
    
    if (!aiResult.success) {
      return createErrorResponse('分析失败: ' + aiResult.error, 'AI_ANALYSIS_FAILED')
    }
    
    // 3. 更新对话记录
    const newDialogue = [
      ...sessionData.dialogue,
      {
        type: 'user',
        content: userAnswer,
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
    // 在 exports.main 函数中，找到第4步的判断逻辑，修改为：
    
    // 4. 判断是否完成 - 改为基于答案正确性判断
    const answerCheck = await checkAnswerCorrectness(userAnswer, sessionData.questionText, sessionData.aiAnalysis)
    const isCompleted = answerCheck.isCorrect // 基于答案正确性
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
      answerLength: userAnswer.length,
      isCompleted: isCompleted
    })
    
    console.log('handleAnswer 云函数执行成功')
    
    return {
      success: true,
      data: {
        feedback: aiResult.data.feedback,
        nextQuestion: aiResult.data.nextQuestion,
        isCompleted: isCompleted,
        currentRound: nextRound,
        totalRounds: sessionData.totalRounds
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
 * @param {string} userAnswer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Array} dialogue - 对话历史
 * @returns {Object} AI分析结果
 */
// 在 analyzeAnswerWithAI 函数中修改问题生成逻辑：

/**
 * 使用对话历史进行上下文感知的AI分析
 * @param {string} questionText - 原题目
 * @param {Object} aiAnalysis - AI题目分析
 * @param {string} userAnswer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Array} dialogue - 对话历史
 * @returns {Object} AI分析结果
 */
async function analyzeAnswerWithAI(questionText, aiAnalysis, userAnswer, currentRound, dialogue) {
  try {
    // 构建完整的对话上下文
    const conversationHistory = dialogue.map(item => ({
      role: item.type === 'user' ? 'user' : 'assistant',
      content: item.content
    }))
    
    // 分析学生的学习轨迹
    const learningProgress = analyzeLearningProgress(dialogue)
    
    const systemPrompt = `【角色】你是希希老师，小学数学追问老师，具有上下文记忆能力。

【重要】你必须基于完整的对话历史来回应，体现连贯性和个性化。

【学生学习轨迹分析】
- 理解水平：${learningProgress.comprehensionLevel}
- 常见错误：${learningProgress.commonMistakes.join('、')}
- 学习偏好：${learningProgress.learningStyle}
- 进步趋势：${learningProgress.progressTrend}

【对话上下文】
${conversationHistory.map((msg, index) => `${index + 1}. ${msg.role === 'user' ? '你' : 'AI老师'}：${msg.content}`).join('\n')}

【当前情况】
原题目：${questionText}
关键关系：${aiAnalysis.keyRelation || '数量关系'}
当前轮次：${currentRound}
最新回答：${userAnswer}

【任务】
1. 基于对话历史，给出有针对性的反馈
2. 体现对学生之前回答的记忆和理解
3. 根据学生的学习轨迹调整教学策略
4. 保持对话的连贯性和个性化
5. 语言亲切温和，使用"你"而不是"学生"

请生成：
1. 个性化反馈（基于历史表现）
2. 下一个引导问题（考虑学习轨迹）

返回JSON格式：
{
  "feedback": "基于对话历史的个性化反馈",
  "nextQuestion": "考虑学习轨迹的下一个问题",
  "reasoning": "基于什么历史信息做出的判断"
}`
    
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userAnswer }
    ]
    
    const completion = await openai.chat.completions.create({
      model: "qwen-plus-2025-07-28",
      messages: messages,
      temperature: 0.7,
      max_tokens: 300,
      top_p: 0.9
    })
    
    const result = JSON.parse(completion.choices[0].message.content.trim())
    
    return {
      success: true,
      data: {
        feedback: result.feedback,
        nextQuestion: result.nextQuestion,
        analysis: {
          reasoning: result.reasoning,
          learningProgress: learningProgress
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
 * 分析学生的学习轨迹
 * @param {Array} dialogue - 对话历史
 * @returns {Object} 学习轨迹分析
 */
function analyzeLearningProgress(dialogue) {
  const userAnswers = dialogue.filter(item => item.type === 'user')
  
  // 分析理解水平
  let comprehensionLevel = 'beginner'
  if (userAnswers.length >= 3) {
    const recentAnswers = userAnswers.slice(-3)
    const avgLength = recentAnswers.reduce((sum, ans) => sum + ans.content.length, 0) / recentAnswers.length
    
    if (avgLength > 50) comprehensionLevel = 'advanced'
    else if (avgLength > 20) comprehensionLevel = 'intermediate'
  }
  
  // 识别常见错误模式
  const commonMistakes = []
  userAnswers.forEach(answer => {
    if (answer.content.includes('不知道') || answer.content.includes('不会')) {
      commonMistakes.push('缺乏自信')
    }
    if (answer.content.length < 10) {
      commonMistakes.push('回答过于简短')
    }
  })
  
  // 分析学习偏好
  const learningStyle = userAnswers.some(ans => ans.content.includes('步骤') || ans.content.includes('过程')) 
    ? '喜欢详细步骤' : '偏向直接结果'
  
  // 分析进步趋势
  const progressTrend = userAnswers.length > 2 
    ? (userAnswers[userAnswers.length - 1].content.length > userAnswers[0].content.length ? '逐步改善' : '需要鼓励')
    : '刚开始学习'
  
  return {
    comprehensionLevel,
    commonMistakes: [...new Set(commonMistakes)],
    learningStyle,
    progressTrend
  }
}

/**
 * 生成针对学生回答的个性化反馈
 * @param {string} questionText - 原题目
 * @param {Object} aiAnalysis - AI题目分析
 * @param {string} userAnswer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Array} dialogue - 对话历史
 * @returns {string} 反馈内容
 */
async function generateFeedbackWithAI(questionText, aiAnalysis, userAnswer, currentRound, dialogue) {
  try {
    // 构建对话上下文
    const conversationHistory = dialogue.map(item => ({
      role: item.type === 'user' ? 'user' : 'assistant',
      content: item.content
    }))
    
    // 🎯 统一后的提示词 - 与analyzeQuestion保持一致
    const systemPrompt = `【角色】你是希希老师，小学数学追问老师，绝不直接给出答案。

【规则】
1. 生成鼓励性反馈，文字≤20字
2. 学生答错时，温和引导；答对时，适度鼓励
3. 禁止出现"正确答案是…"
4. 语言亲切温和，适合小学生
5. 语言需要通俗易懂，适合小学生理解

【当前情况】
原题目：${questionText}
关键关系：${aiAnalysis.keyRelation || '数量关系'}
当前轮次：${currentRound}

【任务】
请为学生回答给出简短鼓励性反馈：
1. 肯定正确的部分
2. 温和指出需要思考的地方
3. 引导继续思考，不直接给答案

只返回反馈文字，不要JSON格式。`
    
    const messages = [
      { role: 'system', content: systemPrompt },
      ...conversationHistory,
      { role: 'user', content: userAnswer }
    ]
    
    // 调用AI生成反馈
    const completion = await openai.chat.completions.create({
      model: "qwen-plus-2025-07-28",
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

/**
 * 评估学生回答质量
 * @param {string} answer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Object} aiAnalysis - AI分析数据
 * @returns {Object} 评估结果
 */
async function evaluateAnswerQuality(answer, currentRound, aiAnalysis) {
  try {
    const prompt = `【角色】你是希希老师，小学数学追问老师。

【任务】评估学生回答质量
当前轮次：${currentRound}
学生回答：${answer}
题目关键关系：${aiAnalysis.keyRelation}

【评估标准】
- 第1轮：是否理解数量关系
- 第2轮：是否会列式计算
- 第3及后续轮：是否得出正确答案

请返回JSON格式：
{
  "quality": "high/medium/low",
  "reason": "评估理由"
}`
const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: answer }
    ]
const completion = await openai.chat.completions.create({
      model: "qwen-plus-2025-07-28",
      messages: messages,
      temperature: 0.7,
      max_tokens: 100, // 限制长度
      top_p: 0.9
    })
    
    return JSON.parse(completion.choices[0].message.content.trim())
  } catch (error) {
    console.error('评估回答质量失败:', error)
    return { quality: "medium", reason: "评估失败，使用默认评级" }
  }
}

/**
 * 生成渐进式追问
 * @param {string} answer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Object} aiAnalysis - AI分析数据
 * @returns {string} 追问问题
 */
async function generateProgressiveQuestion(answer, currentRound, aiAnalysis) {
  try {
    const prompt = `【角色】你是希希老师，小学数学追问老师，绝不直接给出答案。

【规则】
1. 一次只问1个问题，文字≤20字
2. 按苏格拉底式提问原则引导思考
3. 语言亲切温和，适合小学生
4. 禁止直接给出答案或计算过程

【当前情况】
学生回答：${answer}
当前轮次：${currentRound}
题目关键关系：${aiAnalysis.keyRelation}

【任务】生成一个渐进式追问，让学生继续思考。`
    
   const completion = await openai.chat.completions.create({
      model: "qwen-plus-2025-07-28",
      messages: messages,
      temperature: 0.7,
      max_tokens: 100, // 限制长度
      top_p: 0.9
    })
    return completion.choices[0].message.content.trim()
  } catch (error) {
    console.error('生成追问失败:', error)
    return "能再仔细想想吗？"
  }
}

/**
 * 生成下一级别问题（高质量回答）
 * @param {string} answer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Object} aiAnalysis - AI分析数据
 * @returns {string} 下一级别问题
 */
async function generateNextLevelQuestion(answer, currentRound, aiAnalysis) {
  try {
    const prompt = `【角色】你是希希老师，小学数学追问老师。

【重要的称呼规范】
1. 始终使用"你"来称呼对话的学生
2. 禁止使用"学生"、"同学"等第三人称
3. 使用"我们一起"、"你觉得"、"你能"等亲切表达
4. 营造温暖的师生对话氛围

【语言风格】
- 亲切温和："你想得很好！"
- 鼓励引导："你能再想想吗？"
- 共同探索："我们一起来看看"
- 个性化关怀："根据你刚才的回答..."

【禁用表达】
❌ "学生回答得很好"
❌ "这位同学的想法"
❌ "该学生需要"

【推荐表达】
✅ "你回答得很好"
✅ "你的想法很棒"
✅ "你需要再想想"

【目标】
1. 如果还没列式，引导列式
2. 如果已列式，引导计算
3. 如果已计算，引导检查答案格式
4. 一次只问1个问题，文字≤20字
5. 语言亲切温和，适合小学生

【禁止】
- 提出与原题无关的新问题
- 改变题目条件或数据
- 发散到其他知识点

生成针对原题目的下一步引导问题：`
    
    const result = await openai.chat.completions.create({
      model: "qwen-plus",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 50
    })
    
    return result.choices[0].message.content.trim()
  } catch (error) {
    console.error('生成下一级别问题失败:', error)
    return "很棒！我们继续解这道题的下一步吧！"
  }
}

/**
 * 生成详细提示（中等质量回答）
 * @param {string} answer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Object} aiAnalysis - AI分析数据
 * @returns {string} 详细提示
 */
async function generateDetailedHint(answer, currentRound, aiAnalysis) {
  try {
    const prompt = `【角色】你是希希老师，小学数学追问老师。

【重要约束】
1. 必须围绕原题目：${aiAnalysis.questionText || '当前题目'}
2. 不能提出新的、无关的题目
3. 目标是让学生得到这道题的最终答案
4. 针对学生回答的不足给出具体提示

【当前情况】
原题目：${aiAnalysis.questionText || '当前题目'}
学生回答：${answer}
当前轮次：${currentRound}
题目关键关系：${aiAnalysis.keyRelation}
解题步骤：${aiAnalysis.solutionSteps || '分析→列式→计算→答案'}

【任务】
学生回答质量中等，给出具体建议：
1. 指出回答中正确的部分
2. 提示需要完善的地方
3. 引导回到解题的正确轨道
4. 一次只问1个问题，文字≤20字
5. 语言亲切温和，适合小学生

【禁止】
- 提出与原题无关的新问题
- 改变题目条件或数据
- 发散到其他知识点

生成针对原题目的具体提示：`
    
    const result = await openai.chat.completions.create({
      model: "qwen-plus",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 50
    })
    
    return result.choices[0].message.content.trim()
  } catch (error) {
    console.error('生成详细提示失败:', error)
    return "思路不错，我们再看看这道题的关键信息！"
  }
}

/**
 * 生成基础引导（低质量回答）
 * @param {string} answer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Object} aiAnalysis - AI分析数据
 * @returns {string} 基础引导
 */
async function generateBasicGuidance(answer, currentRound, aiAnalysis) {
  try {
    const prompt = `【角色】你是希希老师，小学数学追问老师。

【重要约束】
1. 必须围绕原题目：${aiAnalysis.questionText || '当前题目'}
2. 不能提出新的、无关的题目
3. 目标是让学生得到这道题的最终答案
4. 从最基础的理解开始引导

【当前情况】
原题目：${aiAnalysis.questionText || '当前题目'}
学生回答：${answer}
当前轮次：${currentRound}
题目关键关系：${aiAnalysis.keyRelation}
解题步骤：${aiAnalysis.solutionSteps || '分析→列式→计算→答案'}

【任务】
学生回答质量较低，提供基础引导：
1. 引导学生重新读题
2. 帮助理解题目中的关键信息
3. 从最简单的概念开始
4. 一次只问1个问题，文字≤20字
5. 语言温和鼓励，适合小学生

【禁止】
- 提出与原题无关的新问题
- 改变题目条件或数据
- 发散到其他知识点

生成针对原题目的基础引导：`
    
    const result = await openai.chat.completions.create({
      model: "qwen-plus",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 50
    })
    
    return result.choices[0].message.content.trim()
  } catch (error) {
    console.error('生成基础引导失败:', error)
    return "没关系，我们一起重新看看这道题吧！"
  }
}

/**
 * 判断答案正确性
 * @param {string} answer - 学生回答
 * @param {string} questionText - 题目文本
 * @param {Object} aiAnalysis - AI分析数据
 * @returns {Object} 判断结果
 */
async function checkAnswerCorrectness(answer, questionText, aiAnalysis) {
  try {
    const prompt = `【角色】你是希希老师，小学数学追问老师。

【任务】判断学生回答的正确性
题目：${questionText}
学生回答：${answer}
关键关系：${aiAnalysis.keyRelation}

【判断标准】
- 数值计算是否正确
- 单位是否正确
- 表达是否完整

请返回JSON格式：
{
  "isCorrect": true/false,
  "confidence": 0.0-1.0,
  "explanation": "判断理由"
}`
    
    const result = await openai.chat.completions.create({
      model: "qwen-plus",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" }
    })
    
    return JSON.parse(result.choices[0].message.content)
  } catch (error) {
    console.error('判断答案正确性失败:', error)
    return { isCorrect: false, confidence: 0.5, explanation: "判断失败" }
  }
}

// 在handleAnswer云函数中添加结束判断逻辑
function shouldEndSession(userAnswer, currentRound) {
  // 结束条件：
  // 1. 用户明确表示理解（包含关键词）
  // 2. 达到最大轮数
  // 3. 用户给出正确完整答案
  
  const endKeywords = ['明白了', '理解了', '知道了', '会了', '懂了', '谢谢']
  const hasEndKeyword = endKeywords.some(keyword => userAnswer.includes(keyword))
  
  return hasEndKeyword || currentRound >= 5 // 最多5轮对话
}