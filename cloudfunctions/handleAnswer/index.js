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
 * @param {string} event.openid - 用户ID
 * @param {string} event.userAnswer - 学生回答
 * @param {number} event.currentRound - 当前轮次
 * @param {string} event.timestamp - 时间戳
 */
exports.main = async (event, context) => {
  try {
    const { sessionId, openid, userAnswer, currentRound, timestamp } = event
    
    // 参数验证
    if (!sessionId || !openid || !userAnswer || currentRound === undefined) {
      return createErrorResponse('缺少必要参数', 'MISSING_PARAMS')
    }
    
    // 1. 获取会话数据 - 增强查询逻辑
    
    // 首先尝试精确匹配
    let sessionResult = await db.collection('learning_sessions')
      .where({
        sessionId: sessionId,
        openid: openid
      })
      .get()
    
    // 如果精确匹配失败，尝试只用sessionId查询（用于调试）
    if (sessionResult.data.length === 0) {
      const sessionOnlyResult = await db.collection('learning_sessions')
        .where({ sessionId: sessionId })
        .get()
      
      
      // 如果找到了会话但openid不匹配，返回详细错误信息
      if (sessionOnlyResult.data.length > 0) {
        const foundSession = sessionOnlyResult.data[0]
        return createErrorResponse(
          `会话存在但用户ID不匹配。期望: ${openid}, 实际: ${foundSession.openid}`,
          'USER_ID_MISMATCH'
        )
      }
      
      return createErrorResponse('会话不存在', 'SESSION_NOT_FOUND')
    }
    
    const sessionData = sessionResult.data[0]
    
    // 2. 判断答案正确性
    const answerCheck = await checkAnswerCorrectness(userAnswer, sessionData.questionText, sessionData.aiAnalysis)
    
    let aiResult
    let isCompleted = false
    
    // 3. 根据答案正确性进行条件分支处理
    if (answerCheck.isCorrect) {
      // 答案正确：生成最终鼓励反馈
      aiResult = await generateFinalEncouragementFeedback(
        sessionData.questionText,
        sessionData.aiAnalysis,
        userAnswer,
        currentRound,
        sessionData.dialogue,
        answerCheck
      )
      isCompleted = true
    } else {
      // 答案错误：继续分析回答质量并提供指导
      aiResult = await analyzeAnswerWithAI(
        sessionData.questionText,
        sessionData.aiAnalysis,
        userAnswer,
        currentRound,
        sessionData.dialogue,
        answerCheck
      )
      isCompleted = shouldEndSession(userAnswer) // 检查用户是否表示理解
    }
    
    // 增强错误处理：如果AI分析失败但有fallbackResponse，使用备用响应
    if (!aiResult.success && aiResult.fallbackResponse) {
      aiResult.success = true
      aiResult.data = {
        feedback: aiResult.fallbackResponse.feedback,
        nextQuestion: aiResult.fallbackResponse.nextQuestion,
        analysis: aiResult.fallbackResponse.analysis
      }
    }
    
    if (!aiResult.success) {
      return createErrorResponse('分析失败: ' + aiResult.error, 'AI_ANALYSIS_FAILED')
    }
    
    // 4. 更新对话记录
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
    
    const nextRound = isCompleted ? currentRound : currentRound + 1
    
    // 5. 使用dataService更新会话进度
    const updateResult = await cloud.callFunction({
      name: 'dataService',
      data: {
        action: 'updateSessionProgress',
        data: {
          sessionId: sessionId,
          openid: openid,
          dialogue: newDialogue,
          currentRound: nextRound,
          status: isCompleted ? 'completed' : 'active',  // ✅ 正确设置状态
          updateTime: timestamp,
          lastAnswerCheck: {
            isCorrect: answerCheck.isCorrect,
            confidence: answerCheck.confidence,
            method: answerCheck.method
          },
          ...(isCompleted && {
            endTime: timestamp,  // ✅ 完成时设置结束时间
            completionReason: answerCheck.isCorrect ? 'correct_answer' : 'user_indicated_understanding'
          })
        }
      }
    })
    
    if (!updateResult.result.success) {
      console.error('更新会话进度失败:', updateResult.result.error)
    }
    
    // 6. 使用dataService记录用户行为
    const behaviorResult = await cloud.callFunction({
      name: 'dataService',
      data: {
        action: 'recordBehavior',
        data: {
          openid: openid,
          action: 'question_answered',
          data: {
            sessionId: sessionId,
            round: currentRound,
            answerLength: userAnswer.length,
            isCompleted: isCompleted,
            answerCorrect: answerCheck.isCorrect,
            answerConfidence: answerCheck.confidence,
            answerQuality: aiResult.data.analysis?.answerQuality?.quality || 'unknown'
          },
          page: 'learning',
          timestamp: new Date().toISOString()
        }
      }
    })
    
    if (!behaviorResult.result.success) {
      console.error('记录用户行为失败:', behaviorResult.result.error)
    }
    
    
    return {
      success: true,
      data: {
        feedback: aiResult.data.feedback,
        nextQuestion: aiResult.data.nextQuestion,
        isCompleted: isCompleted,
        currentRound: nextRound,
        totalRounds: sessionData.totalRounds,
        answerCorrect: answerCheck.isCorrect
      }
    }
    
  } catch (error) {
    console.error('handleAnswer 云函数执行失败:', error)
    return createErrorResponse(error.message || '服务器内部错误', 'INTERNAL_ERROR')
  }
}

async function callLLM(systemContent, userPrompt, maxTokens = 200, temperature = 0.7) {
  try {
    const completion = await openai.chat.completions.create({
      model: "qwen-plus-2025-07-28",
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userPrompt }
      ],
      temperature: temperature,
      max_tokens: maxTokens
    })
    
    return {
      success: true,
      content: completion.choices[0].message.content,
      usage: completion.usage
    }
  } catch (error) {
    console.error('调用千问AI失败:', error)
    return {
      success: false,
      error: error.message,
      content: null
    }
  }
}


/**
 * 使用AI智能判断学生回答是否包含正确的最终答案
 * @param {string} answer - 学生回答（可能包含完整解题过程）
 * @param {string} questionText - 题目文本
 * @param {Object} aiAnalysis - AI题目分析（包含finalAnswer）
 * @returns {Object} 判断结果
 */
async function checkAnswerCorrectness(answer, questionText, aiAnalysis) {
  try {
    const studentAnswer = answer.trim()
    
    // 如果没有标准答案，无法判断
    if (!aiAnalysis.finalAnswer) {
      return {
        isCorrect: false,
        confidence: 0.0,
        explanation: '缺少标准答案，无法判断正确性',
        method: 'no_reference',
        extractedAnswer: null
      }
    }
    
    // 使用AI进行智能答案判断
    const aiJudgment = await callLLM(
      `你是一个数学老师，需要判断学生的回答是否包含正确的最终答案。
      
【任务】
1. 分析学生的完整回答，理解其解题过程
2. 从回答中提取最终答案
3. 判断提取的答案是否与标准答案一致
4. 考虑数学等价性（如：2.5 = 5/2 = 2½）

【题目】${questionText}
【标准答案】${aiAnalysis.finalAnswer}
【学生回答】${studentAnswer}

【判断标准】
- 如果学生回答中包含正确的最终答案，即使过程有误，也判定为正确
- 考虑不同的数学表达形式（小数、分数、百分数等）
- 忽略单位差异（如：米 vs m）
- 关注数值的数学等价性

请返回JSON格式：
{
  "isCorrect": true/false,
  "confidence": 0.0-1.0,
  "extractedAnswer": "从学生回答中提取的最终答案",
  "explanation": "判断理由和过程分析",
  "reasoning": "详细的分析过程"
}`,
      studentAnswer,
      500,
      0.1
    )
    
    // 解析AI响应
    let aiResult
    try {
      const responseContent = aiJudgment.content.trim()
      
      // 尝试提取JSON（支持markdown代码块格式）
      let jsonContent = responseContent
      const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
      if (jsonMatch) {
        jsonContent = jsonMatch[1]
      }
      
      aiResult = JSON.parse(jsonContent)
      
      // 验证必要字段
      if (!aiResult.hasOwnProperty('isCorrect') || 
          typeof aiResult.confidence !== 'number') {
        throw new Error('AI响应格式不正确')
      }
      
    } catch (parseError) {
      console.error('AI判断结果解析失败:', parseError)
      
      // 降级到基础规则判断
      return await fallbackToRuleBasedCheck(answer, questionText, aiAnalysis)
    }
    
    // 返回AI判断结果
    return {
      isCorrect: aiResult.isCorrect,
      confidence: Math.max(0, Math.min(1, aiResult.confidence)), // 确保在0-1范围内
      explanation: aiResult.explanation || '答案判断完成',
      method: 'ai_semantic_analysis',
      extractedAnswer: aiResult.extractedAnswer,
      reasoning: aiResult.reasoning,
      originalAnswer: studentAnswer
    }
    
  } catch (error) {
    console.error('AI答案判断失败:', error)
    
    // 降级到基础规则判断
    return await fallbackToRuleBasedCheck(answer, questionText, aiAnalysis)
  }
}

/**
 * 降级的基于规则的答案判断（作为AI判断失败时的备选方案）
 * @param {string} answer - 学生回答
 * @param {string} questionText - 题目文本
 * @param {Object} aiAnalysis - AI题目分析
 * @returns {Object} 判断结果
 */
async function fallbackToRuleBasedCheck(answer, questionText, aiAnalysis) {
  try {
    const studentAnswer = answer.trim()
    const correctAnswer = aiAnalysis.finalAnswer.toString().trim()
    
    // 提取数字进行比较
    const studentNumbers = extractNumbers(studentAnswer)
    const correctNumbers = extractNumbers(correctAnswer)
    
    // 如果都有数字，比较数字
    if (studentNumbers.length > 0 && correctNumbers.length > 0) {
      const isCorrect = Math.abs(studentNumbers[studentNumbers.length - 1] - correctNumbers[0]) < 0.01
      
      return {
        isCorrect: isCorrect,
        confidence: 0.7, // 规则判断的置信度较低
        explanation: isCorrect ? 
          `检测到正确答案：${studentNumbers[studentNumbers.length - 1]}` : 
          `答案不匹配：检测到${studentNumbers[studentNumbers.length - 1]}，正确答案${correctNumbers[0]}`,
        method: 'fallback_number_extraction',
        extractedAnswer: studentNumbers[studentNumbers.length - 1]?.toString(),
        originalAnswer: studentAnswer
      }
    }
    
    // 文本匹配
    const isTextMatch = studentAnswer.toLowerCase().includes(correctAnswer.toLowerCase())
    
    return {
      isCorrect: isTextMatch,
      confidence: isTextMatch ? 0.6 : 0.3,
      explanation: isTextMatch ? 
        '在回答中找到了匹配的答案' : 
        '未找到匹配的答案',
      method: 'fallback_text_matching',
      extractedAnswer: isTextMatch ? correctAnswer : null,
      originalAnswer: studentAnswer
    }
    
  } catch (error) {
    console.error('降级判断也失败:', error)
    return {
      isCorrect: false,
      confidence: 0.0,
      explanation: `判断失败：${error.message}`,
      method: 'error',
      extractedAnswer: null,
      originalAnswer: answer
    }
  }
}

/**
 * 改进的数字提取函数，能更好地处理数学表达式
 * @param {string} text - 输入文本
 * @returns {Array} 提取的数字数组
 */
function extractNumbers(text) {
  // 匹配各种数字格式：整数、小数、分数、百分数
  const patterns = [
    /\b\d+\.\d+\b/g,           // 小数
    /\b\d+\/\d+\b/g,          // 分数
    /\b\d+%\b/g,              // 百分数
    /\b\d+\b/g                // 整数
  ]
  
  const numbers = []
  
  patterns.forEach(pattern => {
    const matches = text.match(pattern)
    if (matches) {
      matches.forEach(match => {
        if (match.includes('/')) {
          // 处理分数
          const [numerator, denominator] = match.split('/')
          numbers.push(parseFloat(numerator) / parseFloat(denominator))
        } else if (match.includes('%')) {
          // 处理百分数
          numbers.push(parseFloat(match.replace('%', '')) / 100)
        } else {
          // 处理普通数字
          numbers.push(parseFloat(match))
        }
      })
    }
  })
  
  return numbers
}

// 在handleAnswer云函数中添加结束判断逻辑
function shouldEndSession(userAnswer) {
  // 结束条件：
  // 1. 用户明确表示理解（包含关键词）
  // 2. 用户给出正确完整答案
  
  const endKeywords = ['明白了', '理解了', '知道了', '会了', '懂了']
  const hasEndKeyword = endKeywords.some(keyword => userAnswer.includes(keyword))
  
  return hasEndKeyword
}

/**
 * 生成默认鼓励反馈
 * @param {number} currentRound - 当前轮次
 * @param {Object} learningJourney - 学习过程分析
 * @returns {Object} 默认鼓励反馈
 */
function generateDefaultEncouragementFeedback(currentRound, learningJourney) {
  const encouragements = [
    "太棒了！你答对了！你的思考过程很清晰，解题思路完全正确！继续保持这样的学习态度！",
    "非常好！经过思考和努力，你成功解出了这道题！你的坚持和认真让老师很欣慰！",
    "优秀！虽然经历了一些思考过程，但你最终找到了正确答案！这种不放弃的精神值得表扬！"
  ]
  
  const index = Math.min(Math.floor((currentRound - 1) / 2), 2)
  
  return {
    success: true,
    data: {
      feedback: encouragements[index],
      nextQuestion: null,
      analysis: {
        reasoning: '使用默认鼓励反馈模板',
        learningJourney: learningJourney,
        finalEncouragement: true
      }
    }
  }
}

/**
 * 使用AI智能分析学生回答质量并生成针对性反馈和引导
 * @param {string} questionText - 原题目文本
 * @param {Object} aiAnalysis - AI题目分析结果
 * @param {string} userAnswer - 学生当前回答
 * @param {number} currentRound - 当前轮次
 * @param {Array} dialogue - 完整对话历史
 * @param {Object} answerCheck - 答案正确性判断结果
 * @returns {Object} AI分析结果
 */
async function analyzeAnswerWithAI(questionText, aiAnalysis, userAnswer, currentRound, dialogue, answerCheck) {
  try {
    // 1. 分析学生的学习轨迹和回答质量
    const learningProgress = analyzeLearningProgress(dialogue, currentRound)
    const answerQuality = evaluateAnswerQuality(userAnswer, currentRound, dialogue)
    
    // 2. 构建智能分析的系统提示
    const systemPrompt = `你是希希老师，一位专业且温暖的小学数学教师。请根据学生的完整学习过程，提供个性化的反馈和引导。

【核心任务】
1. 综合分析学生整个对话过程中的学习表现
2. 基于当前回答质量给出针对性判断和引导
3. 提供温暖鼓励的反馈，激发学习兴趣
4. 设计合适的下一步引导问题

【题目信息】
题目：${questionText}
标准答案：${aiAnalysis.finalAnswer}
解题思路：${aiAnalysis.solutionSteps?.join('; ') || '暂无'}

【学生当前回答】
回答内容：${userAnswer}
答案正确性：${answerCheck.isCorrect ? '正确' : '错误'}
置信度：${answerCheck.confidence}
判断方法：${answerCheck.method}
${answerCheck.extractedAnswer ? `提取答案：${answerCheck.extractedAnswer}` : ''}

【学习过程分析】
当前轮次：${currentRound}
学习轨迹：${learningProgress.trajectory}
理解水平：${learningProgress.comprehensionLevel}
常见错误：${learningProgress.commonErrors.join(', ') || '无'}
学习风格：${learningProgress.learningStyle}
进步趋势：${learningProgress.progressTrend}

【回答质量评估】
质量等级：${answerQuality.quality}
详细程度：${answerQuality.detail}
逻辑性：${answerQuality.logic}
参与度：${answerQuality.engagement}
评估原因：${answerQuality.reason}

【对话历史概要】
${dialogue.slice(-6).map((item, index) => 
  `${item.type === 'user' ? '学生' : '老师'}：${item.content.substring(0, 100)}${item.content.length > 100 ? '...' : ''}`
).join('\n')}

【反馈策略】
- 如果答案错误：分析错误原因，提供温和纠正和具体指导
- 如果理解困难：降低难度，提供更多提示和示例
- 如果进步明显：给予积极鼓励，适当提高挑战
- 如果多次尝试：保持耐心，换个角度解释

【输出要求】
请返回JSON格式，包含以下字段：
{
  "feedback": "温暖鼓励的反馈，分析学习过程，指出进步和需要改进的地方",
  "nextQuestion": "针对性的引导问题或提示，帮助学生继续思考",
  "analysis": {
    "answerQuality": {
      "quality": "excellent/good/fair/poor",
      "strengths": ["回答的优点列表"],
      "improvements": ["需要改进的地方"],
      "reasoning": "详细的质量分析"
    },
    "learningProgress": {
      "currentLevel": "当前理解水平",
      "progressMade": "本轮取得的进步",
      "nextSteps": "建议的下一步学习方向"
    },
    "guidanceStrategy": "采用的引导策略说明",
    "encouragementLevel": "high/medium/low"
  }
}`
    
    // 3. 调用AI进行智能分析
    const aiResponse = await callLLM(systemPrompt, userAnswer, 800, 0.8)
    
    if (aiResponse.success) {
      try {
        // 解析AI响应
        const responseContent = aiResponse.content.trim()
        
        // 尝试提取JSON（支持markdown代码块格式）
        let jsonContent = responseContent
        const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          jsonContent = jsonMatch[1]
        }
        
        const result = JSON.parse(jsonContent)
        
        // 验证必要字段
        if (!result.feedback || !result.analysis) {
          throw new Error('AI响应缺少必要字段')
        }
        
        return {
          success: true,
          data: {
            feedback: result.feedback,
            nextQuestion: result.nextQuestion,
            analysis: {
              ...result.analysis,
              answerCheck: answerCheck,
              learningProgress: learningProgress,
              answerQuality: answerQuality,
              reasoning: 'AI智能分析完成'
            }
          }
        }
        
      } catch (parseError) {
        console.error('AI响应解析失败:', parseError)
        console.log('原始AI响应:', aiResponse.content)
        
        // 降级到智能默认反馈
        return generateIntelligentFallbackFeedback(answerCheck, answerQuality, learningProgress, currentRound, aiAnalysis)
      }
    } else {
      console.error('AI调用失败:', aiResponse.error)
      
      // 降级到智能默认反馈
      return generateIntelligentFallbackFeedback(answerCheck, answerQuality, learningProgress, currentRound, aiAnalysis)
    }
    
  } catch (error) {
    console.error('analyzeAnswerWithAI执行失败:', error)
    
    // 最终降级方案
    return {
      success: false,
      error: error.message,
      fallbackResponse: {
        feedback: '老师正在分析你的回答，请稍等片刻...',
        nextQuestion: '请再次尝试回答这道题目。',
        analysis: {
          reasoning: '系统错误，使用默认响应',
          answerCheck: answerCheck
        }
      }
    }
  }
}

/**
 * 分析学生的学习进度和轨迹
 * @param {Array} dialogue - 对话历史
 * @param {number} currentRound - 当前轮次
 * @returns {Object} 学习进度分析
 */
function analyzeLearningProgress(dialogue, currentRound) {
  const userAnswers = dialogue.filter(item => item.type === 'user')
  
  // 分析理解水平趋势
  let comprehensionLevel = 'beginner'
  if (currentRound <= 2) {
    comprehensionLevel = 'exploring'
  } else if (currentRound <= 4) {
    comprehensionLevel = 'developing'
  } else if (currentRound <= 6) {
    comprehensionLevel = 'practicing'
  } else {
    comprehensionLevel = 'struggling'
  }
  
  // 分析学习轨迹
  let trajectory = 'initial_attempt'
  if (userAnswers.length > 1) {
    const answerLengths = userAnswers.map(answer => answer.content.length)
    const avgLength = answerLengths.reduce((a, b) => a + b, 0) / answerLengths.length
    
    if (avgLength > 50) {
      trajectory = 'detailed_exploration'
    } else if (answerLengths[answerLengths.length - 1] > answerLengths[0]) {
      trajectory = 'progressive_improvement'
    } else {
      trajectory = 'consistent_effort'
    }
  }
  
  // 识别常见错误模式
  const commonErrors = []
  const recentAnswers = userAnswers.slice(-3).map(item => item.content.toLowerCase())
  
  if (recentAnswers.some(answer => answer.includes('不知道') || answer.includes('不会'))) {
    commonErrors.push('缺乏信心')
  }
  if (recentAnswers.some(answer => answer.length < 10)) {
    commonErrors.push('回答过于简短')
  }
  if (recentAnswers.some(answer => /\d+/.test(answer) && !/[+\-*/=]/.test(answer))) {
    commonErrors.push('缺少解题过程')
  }
  
  // 判断学习风格
  let learningStyle = 'balanced'
  const hasNumbers = recentAnswers.some(answer => /\d+/.test(answer))
  const hasWords = recentAnswers.some(answer => answer.replace(/\d+/g, '').trim().length > 10)
  
  if (hasNumbers && !hasWords) {
    learningStyle = 'numerical_focused'
  } else if (hasWords && !hasNumbers) {
    learningStyle = 'verbal_focused'
  } else if (hasNumbers && hasWords) {
    learningStyle = 'comprehensive'
  }
  
  // 评估进步趋势
  let progressTrend = 'stable'
  if (userAnswers.length >= 2) {
    const recent = userAnswers.slice(-2)
    if (recent[1].content.length > recent[0].content.length * 1.5) {
      progressTrend = 'improving'
    } else if (recent[1].content.length < recent[0].content.length * 0.7) {
      progressTrend = 'declining'
    }
  }
  
  return {
    trajectory,
    comprehensionLevel,
    commonErrors,
    learningStyle,
    progressTrend,
    totalAttempts: userAnswers.length,
    averageResponseLength: userAnswers.length > 0 ? 
      Math.round(userAnswers.reduce((sum, answer) => sum + answer.content.length, 0) / userAnswers.length) : 0
  }
}

/**
 * 评估当前回答的质量
 * @param {string} userAnswer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Array} dialogue - 对话历史
 * @returns {Object} 回答质量评估
 */
function evaluateAnswerQuality(userAnswer, currentRound, dialogue) {
  const answer = userAnswer.trim()
  const length = answer.length
  
  // 基础质量评估
  let quality = 'poor'
  let detail = 'minimal'
  let logic = 'unclear'
  let engagement = 'low'
  
  // 长度评估
  if (length > 100) {
    detail = 'comprehensive'
  } else if (length > 50) {
    detail = 'adequate'
  } else if (length > 20) {
    detail = 'basic'
  }
  
  // 内容质量评估
  const hasNumbers = /\d+/.test(answer)
  const hasMathSymbols = /[+\-*/=]/.test(answer)
  const hasExplanation = answer.length > 30 && !/^\d+$/.test(answer)
  const hasQuestionWords = /为什么|怎么|如何|因为|所以/.test(answer)
  
  // 逻辑性评估
  if (hasNumbers && hasMathSymbols && hasExplanation) {
    logic = 'clear'
    quality = 'excellent'
  } else if (hasNumbers && hasExplanation) {
    logic = 'developing'
    quality = 'good'
  } else if (hasNumbers || hasExplanation) {
    logic = 'basic'
    quality = 'fair'
  }
  
  // 参与度评估
  if (hasQuestionWords || answer.includes('我觉得') || answer.includes('我认为')) {
    engagement = 'high'
  } else if (length > 20) {
    engagement = 'medium'
  }
  
  // 综合评估原因
  let reason = ''
  if (quality === 'excellent') {
    reason = '回答详细完整，包含数字计算和清晰解释'
  } else if (quality === 'good') {
    reason = '回答较好，有一定的解题思路'
  } else if (quality === 'fair') {
    reason = '回答基本合理，但缺少详细过程'
  } else {
    reason = '回答过于简单，需要更多思考和解释'
  }
  
  return {
    quality,
    detail,
    logic,
    engagement,
    reason,
    length,
    hasNumbers,
    hasMathSymbols,
    hasExplanation
  }
}

/**
 * 生成智能降级反馈（当AI调用失败时使用）
 * @param {Object} answerCheck - 答案正确性判断
 * @param {Object} answerQuality - 回答质量评估
 * @param {Object} learningProgress - 学习进度分析
 * @param {number} currentRound - 当前轮次
 * @param {Object} aiAnalysis - AI题目分析
 * @returns {Object} 智能降级反馈
 */
function generateIntelligentFallbackFeedback(answerCheck, answerQuality, learningProgress, currentRound, aiAnalysis) {
  let feedback = ''
  let nextQuestion = ''
  
  // 根据答案正确性和质量生成反馈
  if (answerCheck.isCorrect) {
    feedback = `太棒了！你的答案是正确的！${answerCheck.extractedAnswer ? `老师看到你得出了 ${answerCheck.extractedAnswer}` : ''}`
    if (answerQuality.quality === 'excellent') {
      feedback += '你的解题过程很完整，思路清晰，继续保持！'
    } else {
      feedback += '下次可以试着写出更详细的解题步骤哦！'
    }
    nextQuestion = null // 答案正确时不需要下一个问题
  } else {
    // 根据学习进度调整反馈语气
    if (learningProgress.comprehensionLevel === 'struggling') {
      feedback = '老师看到你一直在努力思考，这很棒！让我们换个角度来看这道题。'
    } else {
      feedback = '你的想法很有意思！不过答案还需要再仔细想想。'
    }
    
    // 根据回答质量给出具体建议
    if (answerQuality.quality === 'poor') {
      feedback += '可以试着写出你的思考过程，这样老师能更好地帮助你。'
      nextQuestion = '你能告诉老师，你是怎么想这道题的吗？'
    } else if (answerQuality.hasNumbers) {
      feedback += '老师看到你已经在计算了，这是个好开始！'
      nextQuestion = '你能检查一下计算步骤，看看哪里可能需要调整吗？'
    } else {
      feedback += '你的思路不错，现在试着用数字来验证一下你的想法。'
      nextQuestion = generateGuidanceQuestion(currentRound, aiAnalysis)
    }
  }
  
  return {
    success: true,
    data: {
      feedback,
      nextQuestion,
      analysis: {
        answerQuality,
        learningProgress,
        answerCheck,
        guidanceStrategy: 'intelligent_fallback',
        encouragementLevel: answerCheck.isCorrect ? 'high' : 'medium',
        reasoning: 'AI调用失败，使用智能降级反馈'
      }
    }
  }
}

/**
 * 根据轮次和题目分析生成引导问题
 * @param {number} currentRound - 当前轮次
 * @param {Object} aiAnalysis - AI题目分析
 * @returns {string} 引导问题
 */
function generateGuidanceQuestion(currentRound, aiAnalysis) {
  const questions = [
    '你能先找出题目中的关键信息吗？',
    '这道题要求我们计算什么？',
    '你觉得应该用什么方法来解决这个问题？',
    '让我们一步一步来，第一步应该做什么？',
    '你能画个图或者列个式子来帮助思考吗？'
  ]
  
  const index = Math.min(currentRound - 1, questions.length - 1)
  return questions[index]
}

/**
 * 生成最终鼓励反馈（当答案正确时调用）
 * @param {string} questionText - 题目文本
 * @param {Object} aiAnalysis - AI题目分析
 * @param {string} userAnswer - 学生回答
 * @param {number} currentRound - 当前轮次
 * @param {Array} dialogue - 对话历史
 * @param {Object} answerCheck - 答案正确性判断
 * @returns {Object} 最终鼓励反馈
 */
async function generateFinalEncouragementFeedback(questionText, aiAnalysis, userAnswer, currentRound, dialogue, answerCheck) {
  try {
    // 分析学习过程
    const learningJourney = analyzeLearningJourney(dialogue, currentRound)
    
    const systemPrompt = `你是希希老师，学生刚刚答对了题目！请生成温暖鼓励的最终反馈。

【题目信息】
题目：${questionText}
正确答案：${aiAnalysis.finalAnswer}
学生答案：${userAnswer}

【学习过程】
总轮次：${currentRound}
学习表现：${learningJourney.performance}
主要收获：${learningJourney.keyLearnings.join(', ')}
进步轨迹：${learningJourney.progressTrajectory}

【答案分析】
置信度：${answerCheck.confidence}
提取答案：${answerCheck.extractedAnswer}

请生成JSON格式的最终鼓励反馈：
{
  "feedback": "温暖的祝贺和鼓励，总结学习过程中的亮点和进步",
  "analysis": {
    "learningJourney": "学习过程总结",
    "finalEncouragement": true,
    "reasoning": "反馈生成理由"
  }
}`
    
    const aiResponse = await callLLM(systemPrompt, userAnswer, 400, 0.9)
    
    if (aiResponse.success) {
      try {
        const responseContent = aiResponse.content.trim()
        let jsonContent = responseContent
        const jsonMatch = responseContent.match(/```(?:json)?\s*([\s\S]*?)\s*```/)
        if (jsonMatch) {
          jsonContent = jsonMatch[1]
        }
        
        const result = JSON.parse(jsonContent)
        
        return {
          success: true,
          data: {
            feedback: result.feedback,
            nextQuestion: null,
            analysis: {
              ...result.analysis,
              learningJourney,
              answerCheck
            }
          }
        }
        
      } catch (parseError) {
        console.error('最终反馈解析失败:', parseError)
        return generateDefaultEncouragementFeedback(currentRound, learningJourney)
      }
    } else {
      console.error('最终反馈AI调用失败:', aiResponse.error)
      return generateDefaultEncouragementFeedback(currentRound, learningJourney)
    }
    
  } catch (error) {
    console.error('generateFinalEncouragementFeedback失败:', error)
    return generateDefaultEncouragementFeedback(currentRound, { performance: '努力学习', keyLearnings: ['坚持思考'], progressTrajectory: '稳步前进' })
  }
}

/**
 * 分析学习过程和收获
 * @param {Array} dialogue - 对话历史
 * @param {number} currentRound - 当前轮次
 * @returns {Object} 学习过程分析
 */
function analyzeLearningJourney(dialogue, currentRound) {
  const userAnswers = dialogue.filter(item => item.type === 'user')
  
  let performance = ''
  if (currentRound === 1) {
    performance = '一次就答对了，真是太棒了！'
  } else if (currentRound <= 3) {
    performance = '经过思考和努力，成功解出了题目'
  } else if (currentRound <= 5) {
    performance = '虽然经历了一些挑战，但坚持不懈，最终成功了'
  } else {
    performance = '展现了极大的耐心和毅力，这种学习精神值得表扬'
  }
  
  const keyLearnings = []
  if (userAnswers.some(answer => answer.content.length > 50)) {
    keyLearnings.push('学会了详细表达思考过程')
  }
  if (userAnswers.some(answer => /\d+/.test(answer.content))) {
    keyLearnings.push('掌握了数字计算')
  }
  if (userAnswers.length > 2) {
    keyLearnings.push('培养了坚持不懈的学习态度')
  }
  if (keyLearnings.length === 0) {
    keyLearnings.push('积极参与学习过程')
  }
  
  let progressTrajectory = ''
  if (currentRound <= 2) {
    progressTrajectory = '快速理解并解决问题'
  } else if (currentRound <= 4) {
    progressTrajectory = '稳步思考，逐步改进'
  } else {
    progressTrajectory = '持续努力，最终突破'
  }
  
  return {
    performance,
    keyLearnings,
    progressTrajectory,
    totalRounds: currentRound,
    engagementLevel: userAnswers.length > 0 ? 
      Math.min(5, Math.round(userAnswers.reduce((sum, answer) => sum + answer.content.length, 0) / userAnswers.length / 20)) : 1
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
    code: code,
    timestamp: new Date().toISOString()
  }
}

// ... existing code ...

