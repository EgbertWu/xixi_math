# DataService 云函数使用说明

## 概述

`dataService` 是一个统一的数据服务云函数，整合了用户行为记录、数据同步和会话管理功能。所有其他云函数应该通过调用 `dataService` 来进行数据库操作，而不是直接操作数据库。

## 主要功能

- **用户行为记录**：记录和分析用户在小程序中的各种操作
- **用户数据同步**：同步和维护用户的基本信息、学习统计、设置等
- **会话进度管理**：更新学习会话的对话记录和进度
- **统计数据维护**：实时更新各种用户行为和学习相关的统计数据

## API 接口

### 基本调用格式

```javascript
const result = await cloud.callFunction({
  name: 'dataService',
  data: {
    action: '操作类型',
    data: {
      // 具体参数
    }
  }
})
```

### 1. recordBehavior - 记录用户行为

**功能**：记录用户行为数据到 `user_behaviors` 集合，并自动触发行为分析

**参数**：
```javascript
{
  action: 'recordBehavior',
  data: {
    openid: string,        // 必需：用户ID
    action: string,        // 必需：行为类型
    data: object,          // 可选：行为数据
    page: string,          // 可选：页面路径
    timestamp: string      // 可选：时间戳（ISO格式）
  }
}
```

**支持的行为类型**：
- `page_view`：页面访问
- `learning_start`：学习开始
- `learning_complete`：学习完成
- `question_answered`：问题回答
- `feature_used`：功能使用
- 其他自定义行为类型

**使用示例**：
```javascript
// 记录用户回答问题的行为
const result = await cloud.callFunction({
  name: 'dataService',
  data: {
    action: 'recordBehavior',
    data: {
      openid: 'user123',
      action: 'question_answered',
      data: {
        sessionId: 'session456',
        answer: '用户的答案',
        answerLength: 10,
        isCorrect: true
      },
      page: 'learning',
      timestamp: new Date().toISOString()
    }
  }
})
```

**返回值**：
```javascript
{
  success: true,
  recordId: "记录ID"
}
```

### 2. syncUserData - 同步用户数据

**功能**：同步用户数据到云端 `users` 集合，如果用户不存在则创建新用户

**参数**：
```javascript
{
  action: 'syncUserData',
  data: {
    openid: string,           // 必需：用户ID
    userInfo: object,         // 可选：用户信息
    learningStats: object,    // 可选：学习统计
    settings: object,         // 可选：用户设置
    timestamp: string         // 可选：时间戳
  }
}
```

**userInfo 结构**：
```javascript
{
  nickname: string,    // 用户昵称
  avatar: string,      // 头像URL
  level: number,       // 用户等级
  experience: number   // 经验值
}
```

**learningStats 结构**：
```javascript
{
  totalQuestions: number,      // 总题目数
  completedSessions: number,   // 完成的会话数
  totalLearningTime: number,   // 总学习时长（分钟）
  averageScore: number,        // 平均分数
  bestScore: number,           // 最高分数
  currentStreak: number,       // 当前连续天数
  longestStreak: number        // 最长连续天数
}
```

**使用示例**：
```javascript
// 同步用户学习数据
const result = await cloud.callFunction({
  name: 'dataService',
  data: {
    action: 'syncUserData',
    data: {
      openid: 'user123',
      userInfo: {
        nickname: '小明',
        level: 5,
        experience: 1250
      },
      learningStats: {
        totalQuestions: 50,
        completedSessions: 10,
        averageScore: 85
      }
    }
  }
})
```

**返回值**：
```javascript
{
  success: true,
  data: {用户完整数据},
  action: "updated" | "created"  // 表示是更新还是创建
}
```

### 3. updateSessionProgress - 更新会话进度

**功能**：更新学习会话进度到 `learning_sessions` 集合

**参数**：
```javascript
{
  action: 'updateSessionProgress',
  data: {
    sessionId: string,     // 必需：会话ID
    openid: string,        // 必需：用户ID
    dialogue: array,       // 可选：对话数据
    currentRound: number   // 可选：当前轮次
  }
}
```

**dialogue 结构**：
```javascript
[
  {
    round: number,           // 轮次
    userAnswer: string,      // 用户答案
    aiResponse: string,      // AI回复
    timestamp: string,       // 时间戳
    isCorrect: boolean       // 是否正确
  }
]
```

**使用示例**：
```javascript
// 更新会话对话记录
const result = await cloud.callFunction({
  name: 'dataService',
  data: {
    action: 'updateSessionProgress',
    data: {
      sessionId: 'session456',
      openid: 'user123',
      dialogue: [
        {
          round: 1,
          userAnswer: '2+2=4',
          aiResponse: '正确！很好的回答。',
          timestamp: new Date().toISOString(),
          isCorrect: true
        }
      ],
      currentRound: 2
    }
  }
})
```

**返回值**：
```javascript
{
  success: true,
  updated: number  // 更新的记录数
}
```

## 在其他云函数中的使用示例

### handleAnswer 云函数中的使用

```javascript
// handleAnswer/index.js
const cloud = require('wx-server-sdk')

/**
 * 记录用户行为的封装函数
 */
async function recordUserBehavior(openid, action, data) {
  try {
    const result = await cloud.callFunction({
      name: 'dataService',
      data: {
        action: 'recordBehavior',
        data: {
          openid: openid,
          action: action,
          data: data,
          page: 'learning',
          timestamp: new Date().toISOString()
        }
      }
    })
    return result.result
  } catch (error) {
    console.error('记录用户行为失败:', error)
    return { success: false, error: error.message }
  }
}

/**
 * 更新会话数据的封装函数
 */
async function updateSessionData(sessionId, openid, dialogue, currentRound) {
  try {
    const result = await cloud.callFunction({
      name: 'dataService',
      data: {
        action: 'updateSessionProgress',
        data: {
          sessionId: sessionId,
          openid: openid,
          dialogue: dialogue,
          currentRound: currentRound
        }
      }
    })
    return result.result
  } catch (error) {
    console.error('更新会话进度失败:', error)
    return { success: false, error: error.message }
  }
}

// 主函数中的使用
exports.main = async (event, context) => {
  try {
    const { sessionId, openid, userAnswer, currentRound, dialogue } = event
    
    // 1. 记录用户回答行为
    await recordUserBehavior(openid, 'question_answered', {
      sessionId: sessionId,
      answer: userAnswer,
      round: currentRound,
      answerLength: userAnswer.length
    })
    
    // 2. 处理答案逻辑...
    const answerResult = await checkAnswerCorrectness(userAnswer, correctAnswer)
    
    // 3. 更新对话记录
    const updatedDialogue = [...dialogue, {
      round: currentRound,
      userAnswer: userAnswer,
      aiResponse: aiResponse,
      timestamp: new Date().toISOString(),
      isCorrect: answerResult.isCorrect
    }]
    
    // 4. 更新会话进度
    await updateSessionData(sessionId, openid, updatedDialogue, currentRound + 1)
    
    return {
      success: true,
      data: answerResult
    }
    
  } catch (error) {
    console.error('handleAnswer 执行失败:', error)
    return createErrorResponse(error.message)
  }
}
```

### analyzeQuestion 云函数中的使用

```javascript
// analyzeQuestion/index.js
exports.main = async (event, context) => {
  try {
    const { openid, questionImage } = event
    
    // 记录学习开始行为
    await cloud.callFunction({
      name: 'dataService',
      data: {
        action: 'recordBehavior',
        data: {
          openid: openid,
          action: 'learning_start',
          data: {
            hasImage: !!questionImage,
            imageSize: questionImage ? questionImage.length : 0
          },
          page: 'analysis'
        }
      }
    })
    
    // 其他业务逻辑...
    
  } catch (error) {
    console.error('analyzeQuestion 执行失败:', error)
  }
}
```

## 错误处理

### 标准错误响应格式

```javascript
{
  success: false,
  error: "错误消息",
  code: "错误代码"
}
```

### 常见错误代码

- `MISSING_ACTION`：缺少操作类型
- `INVALID_ACTION`：无效的操作类型
- `MISSING_PARAMS`：缺少必要参数
- `MISSING_USER_ID`：缺少用户ID
- `INTERNAL_ERROR`：服务器内部错误
- `CALL_FAILED`：云函数调用失败

### 错误处理最佳实践

```javascript
/**
 * 安全调用 dataService 的包装函数
 */
async function callDataService(action, data) {
  try {
    const result = await cloud.callFunction({
      name: 'dataService',
      data: {
        action: action,
        data: data
      }
    })
    
    // 检查云函数调用是否成功
    if (result.errCode !== 0) {
      throw new Error(`云函数调用失败: ${result.errMsg}`)
    }
    
    // 检查业务逻辑是否成功
    if (!result.result.success) {
      console.warn('dataService 业务逻辑失败:', result.result.error)
      return result.result
    }
    
    return result.result
    
  } catch (error) {
    console.error('调用 dataService 失败:', error)
    return {
      success: false,
      error: error.message,
      code: 'CALL_FAILED'
    }
  }
}
```

## 数据库集合说明

### user_behaviors 集合
存储用户行为记录，包含：
- 用户操作类型
- 操作数据
- 页面信息
- 微信环境信息
- 时间戳

### users 集合
存储用户基本信息，包含：
- 用户信息（昵称、头像、等级等）
- 学习统计数据
- 用户设置
- 成就信息

### learning_sessions 集合
存储学习会话数据，包含：
- 会话ID和用户ID
- 对话记录
- 当前进度
- 更新时间

### user_stats 集合
存储用户统计数据，包含：
- 页面访问统计
- 学习行为统计
- 功能使用统计
- 每日统计数据

## 注意事项

1. **统一数据操作**：所有云函数都应该通过 dataService 进行数据库操作
2. **异步调用**：所有调用都是异步的，需要使用 `await` 或 `.then()`
3. **错误处理**：务必添加 try-catch 来处理调用失败的情况
4. **参数验证**：调用前确保传递的参数符合要求
5. **性能考虑**：避免在循环中频繁调用云函数
6. **权限控制**：确保调用方云函数有权限调用 dataService

## 版本信息

- 版本：1.0.0
- 最后更新：2024年
- 维护者：TutorAI 开发团队

---

通过使用这个统一的 dataService，可以确保数据操作的一致性和可维护性，避免在多个云函数中重复实现相同的数据库操作逻辑。