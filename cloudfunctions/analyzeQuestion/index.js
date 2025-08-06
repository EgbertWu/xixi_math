// 云函数：analyzeQuestion
// 分析题目图片，提取文字并生成AI问题 - 使用微信云OCR

const cloud = require('wx-server-sdk')
// 移除：const axios = require('axios')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 云函数入口函数
 * @param {Object} event - 事件参数
 * @param {string} event.imageBase64 - 图片base64数据
 * @param {string} event.userId - 用户ID
 * @param {string} event.sessionId - 会话ID
 * @param {string} event.timestamp - 时间戳
 */
exports.main = async (event, context) => {
  console.log('analyzeQuestion 云函数开始执行', event)
  
  try {
    const { imageBase64, userId, sessionId, timestamp } = event
    
    // 参数验证
    if (!imageBase64 || !userId || !sessionId) {
      return {
        success: false,
        error: '缺少必要参数',
        code: 'MISSING_PARAMS'
      }
    }
    
    // 1. OCR识别图片文字
    console.log('开始OCR识别...')
    const ocrResult = await performOCR(imageBase64)
    
    if (!ocrResult.success) {
      return {
        success: false,
        error: 'OCR识别失败: ' + ocrResult.error,
        code: 'OCR_FAILED'
      }
    }
    
    const questionText = ocrResult.text
    console.log('OCR识别结果:', questionText)
    
    // 2. AI分析题目并生成启发式问题
    console.log('开始AI分析...')
    const aiResult = await analyzeWithAI(questionText)
    
    if (!aiResult.success) {
      return {
        success: false,
        error: 'AI分析失败: ' + aiResult.error,
        code: 'AI_ANALYSIS_FAILED'
      }
    }
    
    // 3. 保存会话数据到数据库
    const sessionData = {
      sessionId: sessionId,
      userId: userId,
      questionText: questionText,
      questionImage: imageBase64,
      aiAnalysis: aiResult.data,
      currentRound: 1,
      totalRounds: 3,
      status: 'active',
      startTime: timestamp,
      updateTime: timestamp,
      dialogue: []
    }
    
    console.log('保存会话数据...')
    await db.collection('learning_sessions').add({
      data: sessionData
    })
    
    // 4. 记录用户行为
    await recordUserBehavior(userId, 'question_analyzed', {
      sessionId: sessionId,
      questionLength: questionText.length,
      hasImage: true
    })
    
    console.log('analyzeQuestion 云函数执行成功')
    
    return {
      success: true,
      data: {
        sessionId: sessionId,
        questionText: questionText,
        aiAnalysis: aiResult.data,
        firstQuestion: aiResult.data.questions[0] || '请告诉我你对这道题的理解？'
      }
    }
    
  } catch (error) {
    console.error('analyzeQuestion 云函数执行失败:', error)
    
    return {
      success: false,
      error: error.message || '服务器内部错误',
      code: 'INTERNAL_ERROR'
    }
  }
}

/**
 * 执行OCR识别
 * @param {string} imageBase64 - 图片base64数据
 * @returns {Object} OCR结果
 */
/**
 * 执行OCR识别 - 使用微信云OCR API
 * @param {string} imageBase64 - 图片base64数据
 * @returns {Object} OCR结果
 */
async function performOCR(imageBase64) {
  try {
    console.log('开始微信OCR识别...')
    
    // 使用微信云OCR API进行通用印刷体识别
    const result = await cloud.openapi.ocr.printedText({
      img: imageBase64  // 微信OCR支持base64格式
    })
    
    console.log('微信OCR识别结果:', result)
    
    // 检查识别结果
    if (!result.items || result.items.length === 0) {
      throw new Error('未识别到文字内容')
    }
    
    // 提取识别的文字内容
    const recognizedText = result.items.map(item => item.text).join('\n')
    
    if (!recognizedText.trim()) {
      throw new Error('识别到的文字内容为空')
    }
    
    return {
      success: true,
      text: recognizedText.trim(),
      confidence: result.items.length, // 使用识别到的文字块数量作为置信度
      items: result.items // 保留位置信息，可用于后续优化
    }
    
  } catch (error) {
    console.error('微信OCR识别失败:', error)
    
    // 根据错误类型提供更友好的错误信息
    let errorMessage = error.message
    if (error.errCode) {
      switch (error.errCode) {
        case 45009:
          errorMessage = 'API调用次数超限，请稍后重试'
          break
        case 47001:
          errorMessage = '图片格式不支持，请重新拍照'
          break
        case 54001:
          errorMessage = '图片内容不合规'
          break
        default:
          errorMessage = `OCR识别失败: ${error.errMsg || error.message}`
      }
    }
    
    return {
      success: false,
      error: errorMessage
    }
  }
}

/**
 * 获取百度API访问令牌
 * @returns {string} 访问令牌
 */
// 删除以下函数（第171-196行）
// async function getBaiduAccessToken() {
//   try {
//     const response = await axios.post(
//       'https://aip.baidubce.com/oauth/2.0/token',
//       null,
//       {
//         params: {
//           grant_type: 'client_credentials',
//           client_id: process.env.BAIDU_API_KEY,
//           client_secret: process.env.BAIDU_SECRET_KEY
//         },
//         timeout: 10000
//       }
//     )
//     
//     if (response.data.error) {
//       throw new Error(`获取访问令牌失败: ${response.data.error_description}`)
//     }
//     
//     return response.data.access_token
//     
//   } catch (error) {
//     console.error('获取百度访问令牌失败:', error)
//     throw error
//   }
// }

/**
 * 使用AI分析题目
 * @param {string} questionText - 题目文字
 * @returns {Object} AI分析结果
 */
async function analyzeWithAI(questionText) {
  try {
    // 使用通义千问API
    const response = await axios.post(
      'https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation',
      {
        model: 'qwen-turbo',
        input: {
          messages: [
            {
              role: 'system',
              content: `你是一位经验丰富的小学数学老师，擅长使用苏格拉底式教学法。请分析学生提供的数学题目，然后设计3个循序渐进的问题，引导学生独立思考和解决问题。

              要求：
              1. 不要直接给出答案
              2. 问题要有层次性，从基础理解到深入分析
              3. 鼓励学生表达自己的思考过程
              4. 语言要亲切、鼓励性
              5. 适合小学生的认知水平

              请以JSON格式返回，包含：
- subject: 题目涉及的数学主题
- difficulty: 难度等级(1-5)
- concepts: 涉及的数学概念数组
- questions: 3个启发式问题数组
- hints: 对应的提示数组
- solution_steps: 解题步骤概要数组`
            },
            {
              role: 'user',
              content: `请分析这道数学题：\n${questionText}`
            }
          ]
        },
        parameters: {
          temperature: 0.7,
          max_tokens: 1500,
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
    let analysisData
    try {
      // 尝试解析JSON
      const jsonMatch = aiResponse.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        analysisData = JSON.parse(jsonMatch[0])
      } else {
        throw new Error('AI响应格式不正确')
      }
    } catch (parseError) {
      console.error('解析AI响应失败:', parseError)
      // 使用默认结构
      analysisData = {
        subject: '数学',
        difficulty: 3,
        concepts: ['基础运算'],
        questions: [
          '你能告诉我这道题在问什么吗？',
          '你觉得解决这道题需要用到什么数学知识？',
          '你有什么想法来解决这个问题？'
        ],
        hints: [
          '仔细读题，找出关键信息',
          '想想你学过的相关数学概念',
          '试着画图或列式子来帮助思考'
        ],
        solution_steps: [
          '理解题意',
          '分析数据',
          '选择方法',
          '计算求解',
          '检验答案'
        ]
      }
    }
    
    return {
      success: true,
      data: analysisData
    }
    
  } catch (error) {
    console.error('AI分析失败:', error)
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

// 在analyzeQuestion云函数中替换百度OCR
// 删除第334-363行的重复代码
// const cloud = require('wx-server-sdk')
// cloud.init()
// async function wechatOCR(imgUrl) {
//   try {
//     const result = await cloud.openapi.ocr.printedText({
//       imgUrl: imgUrl
//     })
//     
//     // 提取识别的文字内容
//     const recognizedText = result.items.map(item => item.text).join('\n')
//     
//     return {
//       success: true,
//       text: recognizedText,
//       items: result.items // 包含位置信息
//     }
//   } catch (error) {
//     console.error('微信OCR识别失败:', error)
//     return {
//       success: false,
//       error: error.message
//     }
//   }
// }