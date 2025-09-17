// 云函数：analyzeQuestion
// 分析题目图片，提取文字并生成AI问题 - 使用微信云OCR

const cloud = require('wx-server-sdk')
const OpenAI = require('openai')
const axios = require('axios')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 云函数入口函数
 * @param {Object} event - 事件参数
 * @param {string} event.imageFileID - 云存储图片ID
 * @param {string} event.openid - 用户ID
 * @param {string} event.sessionId - 会话ID
 */
exports.main = async (event, context) => {
  const { imageFileID, openid, sessionId } = event;
  
  try {
    // 验证必要参数
    if (!imageFileID) {
      return {
        success: false,
        error: '缺少图片文件ID'
      };
    }
    
      
    console.log('开始处理云存储图片:', imageFileID);
    
    // 从云存储下载图片
    const downloadResult = await cloud.downloadFile({
      fileID: imageFileID
    });

    // 添加下载结果验证
    if (!downloadResult || !downloadResult.fileContent) {
      console.error('云存储下载失败:', downloadResult);
      return {
        success: false,
        error: '图片下载失败，请重新上传图片'
      };
    }
    
    const maxSize = 900 * 1024; // 900KB，留出余量
    if (downloadResult.fileContent.length > maxSize) {
      return {
        success: false,
        error: `图片文件过大（${Math.round(downloadResult.fileContent.length / 1024)}KB），请压缩后重试`
      };
    }
    
    console.log(`图片大小: ${Math.round(downloadResult.fileContent.length / 1024)}KB`);
    
    // 将图片转换为Base64
    const imageBase64 = downloadResult.fileContent.toString('base64');
    
    // 使用Base64数据调用qwen-vl-max模型
    const analysisResult = await analyzeWithQwenVLMax(imageBase64);
    
    if (!analysisResult.success) {
      throw new Error(analysisResult.error || '图像识别分析失败');
    }

    // 🚀 优化：并行执行数据库操作，不阻塞主流程
    const sessionData = {
      sessionId: sessionId,
      openid: openid,
      questionText: analysisResult.data.questionText,
      questionImage: 'imageBase64',
      aiAnalysis: analysisResult.data,
      dialogue: [],
      createdAt: new Date(),
      status: 'active'
    };

    // 并行执行数据库操作（不等待完成）
    Promise.all([
      saveSessionToDatabase(sessionData),
      recordUserBehavior({
        openid: openid,
        action: 'analyze_question',
        sessionId: sessionId,
        timestamp: new Date(),
        details: {
          gradeLevel: analysisResult.data.gradeLevel,  // 修复：使用正确的字段名
          difficulty: analysisResult.data.difficulty
        }
      })
    ]).catch(error => {
      console.error('后台数据库操作失败:', error);
      // 不影响主流程，只记录错误
    });

    // 立即返回结果，不等待数据库操作完成
    return {
      success: true,
      data: {
        sessionId: sessionId,
        ...analysisResult.data
      }
    };

  } catch (error) {
    console.error('analyzeQuestion 云函数执行失败:', error);
    return {
      success: false,
      error: error.message || '未知错误'
    };
  }
};

/**
 * 保存会话数据到数据库
 * @param {Object} sessionData - 会话数据
 */
async function saveSessionToDatabase(sessionData) {
  try {
    await db.collection('learning_sessions').add({
      data: sessionData
    });
    console.log('初始会话数据保存成功:', sessionData);
  } catch (error) {
    console.error('保存会话数据失败:', error);
    throw error;
  }
}

/**
 * 记录用户行为
 * @param {Object} behaviorData - 行为数据
 */
async function recordUserBehavior(behaviorData) {
  try {
    await db.collection('user_behaviors').add({
      data: behaviorData
    });
  } catch (error) {
    console.error('记录用户行为失败:', error);
    // 不影响主流程
  }
}

/**
 * 构建优化后的智能提示词 - 追问式教学版
 * @returns {string} 优化后的提示词
 */
function buildIntelligentPrompt() {
  return `【角色】你是希希老师，小学数学追问老师，绝不直接给出答案。

【规则】
1. 一次只问1个问题，文字≤20字
2. 学生答错时，降低提示梯度；答对时，提高梯度
3. 禁止出现"正确答案是…"
4. 语言亲切温和，适合小学生
5. 语言需要通俗易懂，适合小学生理解

【流程】
1. 追问1：引导学生发现题目中的数量关系

【输出JSON格式】
{
  "questionText": "题目描述",
  "gradeLevel": "年级",
  "difficulty": 1-5,
  "keyNumbers": ["关键数字"],
  "keyRelation": "核心数量关系",
  "finalAnswer": "最终答案(用于系统验证，不显示给学生)",
  "questions": [
    "追问1：(≤20字)"
  ]
}

要求：分析图片题目，返回JSON，问题简短有效。
【任务说明】
- 先分析输入的数学应用题，提炼题干信息和关键数字。
- 按照苏格拉底式提问原则，生成三个循序渐进的问题。
- 生成的 JSON 必须满足字段完整、格式正确、内容科学合理。
- 问题语言简洁有趣，鼓励学生思考。

【输入示例】
某商店一周售出60套运动服，一共收入多少钱？（上衣75元，裤子45元）

【输出示例】
{
  "questionText": "某商店一周售出60套运动服，一共收入多少钱？（上衣75元，裤子45元）",
  "gradeLevel": "四年级",
  "difficulty": 2,
  "keyNumbers": ["60", "75", "45"],
  "keyRelation": "一套运动服=上衣+裤子，总价=单价×数量",
  "finalAnswer": "7200元",
  "questions": [
    "一套运动服多少钱？"
  ]
}`;
}

/**
 * 使用通义千问qwen-vl-max进行多模态分析
 * @param {string} imageBase64 - 图片Base64数据
 * @returns {Object} 分析结果
 */
async function analyzeWithQwenVLMax(imageBase64) {
  try {
    // 使用OpenAI兼容接口访问通义千问API
    const openai = new OpenAI({
      apiKey: process.env.QWEN_API_KEY,
      baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1"
    })

    
    // 构建智能提示词
    const systemPrompt = buildIntelligentPrompt();
    
    const completion = await openai.chat.completions.create({
      model: "qwen-vl-plus-2025-05-07",  // 使用qwen-vl-max多模态模型
      messages: [
        {
          role: "system",
          content: "你是希希老师，一位温和耐心的小学数学老师。请用适合小学生的语言分析题目，并返回JSON格式的教学引导。" + systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "希希老师，请帮我分析这道数学题，用小朋友能理解的方式来引导学习。"
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/jpeg;base64,${imageBase64}`
              }
            }
          ]
        }
      ],
      max_tokens: 4000,
      temperature: 0.8,
      response_format: { type: "json_object" }  // 强制JSON格式输出
    });
  
    
    // 解析AI响应
    let analysisData;
    try {
      // 由于设置了response_format为json_object，直接解析JSON
      analysisData = JSON.parse(completion.choices[0].message.content);
    } catch (parseError) {
      console.error('解析AI响应失败:', parseError);
      // 使用默认结构
      analysisData = createDefaultAnalysis();
    }
    
    // 验证和增强分析数据
    const validatedData = validateAndEnhanceAnalysis(analysisData);
    
    return {
      success: true,
      data: validatedData
    };
    
  } catch (error) {
    console.error('qwen-vl-max分析失败:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

/**
 * 简化版数据验证 - 追问式教学版
 * @param {Object} analysisData - 原始分析数据
 * @returns {Object} 验证后的分析数据
 */
function validateAndEnhanceAnalysis(analysisData) {
  const defaultData = createDefaultAnalysis();
  
  return {
    questionText: analysisData.questionText || defaultData.questionText,
    gradeLevel: analysisData.gradeLevel || defaultData.gradeLevel,
    difficulty: (analysisData.difficulty >= 1 && analysisData.difficulty <= 5) ? analysisData.difficulty : 3,
    keyNumbers: Array.isArray(analysisData.keyNumbers) ? analysisData.keyNumbers : defaultData.keyNumbers,
    keyRelation: analysisData.keyRelation || defaultData.keyRelation,
    finalAnswer: analysisData.finalAnswer || defaultData.finalAnswer,
    questions: Array.isArray(analysisData.questions) ? analysisData.questions : 
               (analysisData.questions ? [analysisData.questions] : defaultData.questions)
  };
}

/**
 * 创建默认分析结果 - 追问式教学版
 * @returns {Object} 默认的分析数据结构
 */
function createDefaultAnalysis() {
  return {
    questionText: "请重新拍照，图片不够清晰哦",
    gradeLevel: "三年级",
    difficulty: 3,
    keyNumbers: ["暂无"],
    keyRelation: "需要分析数量关系",
    finalAnswer: "无法计算",
    questions: [
      "你能找到题目中的数字吗？"
    ]
  };
}