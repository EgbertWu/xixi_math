// 云函数：analyzeQuestion
// 分析题目图片，提取文字并生成AI问题 - 使用微信云OCR

const cloud = require('wx-server-sdk')
const OpenAI = require('openai')

// 初始化云开发
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

/**
 * 云函数入口函数
 * @param {Object} event - 事件参数
 * @param {string} event.imageBase64 - 图片Base64数据
 * @param {string} event.userId - 用户ID
 * @param {string} event.sessionId - 会话ID
 */
exports.main = async (event, context) => {
  const { imageBase64, userId, sessionId } = event;
  
  try {
    // 验证必要参数
    if (!imageBase64) {
      return {
        success: false,
        error: '缺少图片数据'
      };
    }

    console.log('开始分析图片，用户ID:', userId, '会话ID:', sessionId);
    
    // 直接使用Base64数据调用qwen-vl-max模型
    const analysisResult = await analyzeWithQwenVLMax(imageBase64);
    
    if (!analysisResult.success) {
      throw new Error(analysisResult.error || '图像分析失败');
    }

    // 🚀 优化：并行执行数据库操作，不阻塞主流程
    const sessionData = {
      sessionId: sessionId,
      userId: userId,
      questionText: analysisResult.data.questionText,
      questionImage: 'base64_image',
      aiAnalysis: analysisResult.data,
      createdAt: new Date(),
      status: 'active'
    };

    // 并行执行数据库操作（不等待完成）
    Promise.all([
      saveSessionToDatabase(sessionData),
      recordUserBehavior({
        userId: userId,
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
    console.log('会话数据保存成功');
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

【流程】
1. 追问1：让学生发现"数量关系"
2. 追问2：提示画图或列式
3. 追问3：请学生总结答案并检验

【输出JSON格式】
{
  "questionText": "题目描述",
  "gradeLevel": "年级",
  "difficulty": 1-5,
  "keyNumbers": ["关键数字"],
  "keyRelation": "核心数量关系",
  "questions": [
    "追问1：引导发现关系(≤20字)",
    "追问2：提示方法(≤20字)", 
    "追问3：总结检验(≤20字)"
  ]
}

要求：分析图片题目，返回JSON，问题简短有效。`;
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

    console.log('调用通义千问qwen-vl-max API...');
    
    // 构建智能提示词
    const systemPrompt = buildIntelligentPrompt();
    
    const completion = await openai.chat.completions.create({
      model: "qwen-vl-max",  // 使用qwen-vl-max多模态模型
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
      temperature: 0,    // 改为0以获得更确定的输出
      response_format: { type: "json_object" }  // 强制JSON格式输出
    });
    
    console.log('qwen-vl-max原始响应:', completion.choices[0].message.content);
    
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
    questions: Array.isArray(analysisData.questions) && analysisData.questions.length >= 3 
      ? analysisData.questions.slice(0, 3) 
      : defaultData.questions
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
    questions: [
      "你能找到题目中的数字吗？",
      "试试画个图帮助思考？",
      "算出答案了吗？检查一下"
    ]
  };
}