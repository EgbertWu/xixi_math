# 希希数学小助手 云函数开发指南

## 📋 项目概述

希希数学小助手是一个面向小学生5-6年级的AI数学辅导微信小程序。通过苏格拉底式教学法，引导学生独立思考和解决数学问题。

## 🏗️ 云函数架构

### 核心云函数

| 云函数名称 | 功能描述 | 主要技术 |
|-----------|----------|----------|
| `analyzeQuestion` | 分析题目图片，OCR识别+AI分析 | 微信OCR、通义千问API |
| `handleAnswer` | 处理学生回答，生成AI反馈 | 通义千问API、对话管理 |
| `generateReport` | 生成详细的学习报告 | AI分析、数据统计 |
| `getUserHistory` | 获取用户学习历史记录 | 数据查询、分页处理 |
| `recordBehavior` | 记录用户行为数据 | 行为分析、统计更新 |
| `syncUserData` | 同步用户数据到云端 | 数据同步、用户管理 |

### 数据库集合

| 集合名称 | 用途 | 主要字段 |
|---------|------|----------|
| `users` | 用户信息 | userId, userInfo, settings, achievements |
| `learning_sessions` | 学习会话 | sessionId, questionText, dialogue, status |
| `learning_reports` | 学习报告 | sessionId, reportData, performance |
| `user_behaviors` | 用户行为 | userId, action, data, timestamp |
| `user_stats` | 用户统计 | userId, learningStats, pageViews |

## 🚀 快速开始

### 1. 环境准备

```bash
# 安装腾讯云CLI
npm install -g @cloudbase/cli

# 登录腾讯云
tcb login

# 配置环境变量
cp .env.example .env
# 编辑 .env 文件，填入API密钥
```

### 2. 数据库初始化

```bash
# 初始化数据库集合
node init-database.js
```

### 3. 部署云函数

```bash
# 部署所有云函数
node deploy.js

# 部署指定云函数
node deploy.js analyzeQuestion
```

### 4. 测试云函数

```bash
# 测试所有云函数
node test-functions.js

# 测试指定云函数
node test-functions.js syncUserData
```

## 🔧 开发配置

### API密钥配置

在 `.env` 文件中配置以下密钥：

```env
# 通义千问API密钥
QWEN_API_KEY=your_qwen_api_key_here

# 微信小程序配置
WECHAT_APPID=your_wechat_appid
WECHAT_SECRET=your_wechat_secret

# 云开发环境ID
CLOUD_ENV_ID=your_cloud_env_id
```

### 权限配置

在 `config.json` 中已配置必要的API权限：

- `ocr.printedText` - OCR文字识别
- `customerServiceMessage.send` - 客服消息
- `templateMessage.send` - 模板消息
- `wxacode.get` - 小程序码生成

## 📚 云函数详细说明

### analyzeQuestion - 题目分析

**功能**: 使用微信OCR识别题目图片，通过AI分析生成启发式问题

**输入参数**:
```javascript
{
  imageBase64: "图片base64数据",
  userId: "用户ID", 
  sessionId: "会话ID",
  timestamp: "时间戳"
}
```

**返回数据**:
```javascript
{
  success: true,
  data: {
    sessionId: "会话ID",
    questionText: "识别的题目文字",
    aiAnalysis: {
      subject: "数学主题",
      difficulty: "难度等级",
      concepts: ["涉及概念"],
      questions: ["启发式问题"],
      hints: ["提示信息"]
    },
    firstQuestion: "第一个问题"
  }
}
```

### handleAnswer - 处理回答

**功能**: 分析学生回答，生成个性化反馈和下一个问题

**输入参数**:
```javascript
{
  sessionId: "会话ID",
  userId: "用户ID",
  answer: "学生回答",
  currentRound: 1,
  timestamp: "时间戳"
}
```

**返回数据**:
```javascript
{
  success: true,
  data: {
    feedback: "AI反馈",
    nextQuestion: "下一个问题",
    isCompleted: false,
    currentRound: 2,
    totalRounds: 3,
    report: null // 完成时包含学习报告
  }
}
```

### generateReport - 生成报告

**功能**: 基于完整学习会话生成详细的学习评估报告

**输入参数**:
```javascript
{
  sessionId: "会话ID",
  userId: "用户ID",
  timestamp: "时间戳"
}
```

**返回数据**:
```javascript
{
  success: true,
  data: {
    performance: {
      score: 85,
      level: "良好",
      strengths: ["优势点"],
      improvements: ["改进建议"]
    },
    thinkingAnalysis: {
      logicalThinking: 4,
      problemSolving: 3,
      communication: 4,
      creativity: 3
    },
    knowledgePoints: [
      {
        name: "知识点",
        mastery: 80,
        description: "掌握情况"
      }
    ],
    suggestions: ["学习建议"],
    nextSteps: ["下一步计划"]
  }
}
```

## 🔍 调试和监控

### 日志查看

```bash
# 查看云函数日志
tcb fn log analyzeQuestion

# 实时查看日志
tcb fn log analyzeQuestion --tail
```

### 性能监控

- 在云开发控制台查看云函数调用统计
- 监控API调用次数和响应时间
- 关注错误率和异常情况

## 🛠️ 常见问题

### 1. OCR识别失败

**原因**: 图片格式不支持或内容不清晰
**解决**: 检查图片格式，确保文字清晰可读

### 2. AI API调用失败

**原因**: API密钥错误或调用次数超限
**解决**: 检查环境变量配置，确认API额度

### 3. 数据库操作失败

**原因**: 权限不足或集合不存在
**解决**: 检查数据库权限设置，运行初始化脚本

### 4. 云函数部署失败

**原因**: 依赖安装失败或代码语法错误
**解决**: 检查package.json配置，修复代码错误

## 📈 性能优化

### 1. 冷启动优化

- 减少依赖包大小
- 使用连接池复用数据库连接
- 预热关键云函数

### 2. 并发处理

- 合理设置云函数并发限制
- 使用异步处理非关键操作
- 实现请求去重和缓存

### 3. 成本控制

- 监控API调用次数
- 优化数据库查询
- 合理设置云函数超时时间

## 🔄 版本更新

### 更新流程

1. 修改云函数代码
2. 更新版本号
3. 运行测试脚本
4. 部署到测试环境
5. 验证功能正常
6. 部署到生产环境

### 回滚策略

- 保留历史版本
- 快速回滚机制
- 数据库迁移脚本

## 📞 技术支持

如有问题，请联系开发团队：

- 项目仓库: [GitHub链接]
- 技术文档: [文档链接]
- 问题反馈: [Issue链接]

---

**希希数学小助手开发团队**  
*让每个孩子都能享受数学学习的乐趣*