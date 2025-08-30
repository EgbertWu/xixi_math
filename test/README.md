# 数据库测试工具使用说明

## 概述

这个数据库测试工具是为了帮助调试和排查 `learning_history` 历史记录无法显示的问题而创建的。它提供了全面的数据库查询测试功能，帮助开发者快速定位问题所在。

## 文件结构

```
miniprogram/
├── test/
│   ├── database-test.js     # 数据库测试核心逻辑
│   └── README.md           # 使用说明文档
└── pages/test/
    ├── test.js             # 测试页面逻辑
    ├── test.wxml           # 测试页面结构
    ├── test.wxss           # 测试页面样式
    └── test.json           # 测试页面配置
```

## 功能特性

### 1. 用户身份验证测试
- 检查 `openid` 是否正确获取
- 验证用户登录状态
- 自动重新获取 `openid`（如果失败）

### 2. 数据库集合测试
- **learning_history 集合测试**：检查是否存在该集合及用户数据
- **learning_sessions 集合测试**：检查是否存在该集合及用户数据
- **其他集合测试**：测试 users、user_stats、learning_reports 等集合

### 3. 云函数测试
- **dataService 云函数**：测试 `getLearningHistory` 功能
- **getUserHistory 云函数**：测试历史记录获取功能

### 4. 实时日志监控
- 捕获所有 `console.log` 输出
- 实时显示测试进度
- 支持日志复制到剪贴板

### 5. 智能建议系统
- 根据测试结果提供修复建议
- 推荐使用合适的数据库集合
- 指出潜在的配置问题

## 使用方法

### 方法一：通过小程序页面使用

1. 在微信开发者工具中打开小程序
2. 导航到测试页面：`pages/test/test`
3. 点击相应的测试按钮：
   - **运行完整测试**：执行所有测试项目
   - **测试learning_history**：仅测试 learning_history 集合
   - **测试learning_sessions**：仅测试 learning_sessions 集合

### 方法二：通过代码调用

```javascript
// 在其他页面中引入测试模块
const databaseTest = require('../../test/database-test.js')

// 运行完整测试
const results = await databaseTest.quickTest()
console.log('测试结果:', results)

// 仅测试 learning_history
const historyResult = await databaseTest.testLearningHistoryOnly()
console.log('learning_history测试结果:', historyResult)

// 仅测试 learning_sessions
const sessionsResult = await databaseTest.testLearningSessionsOnly()
console.log('learning_sessions测试结果:', sessionsResult)
```

### 方法三：直接使用测试类

```javascript
const { DatabaseTester } = require('../../test/database-test.js')

const tester = new DatabaseTester()

// 测试用户openid
const openid = await tester.testOpenId()

// 测试特定集合
const result = await tester.testLearningHistoryCollection(openid)
```

## 测试结果解读

### 成功情况

```json
{
  "success": true,
  "userDataCount": 5,
  "totalDataCount": 100,
  "userData": [...],
  "allData": [...]
}
```

- `success: true`：表示集合存在且查询成功
- `userDataCount`：当前用户的数据条数
- `totalDataCount`：集合中的总数据条数
- `userData`：用户的具体数据
- `allData`：集合中的所有数据（限制条数）

### 失败情况

```json
{
  "success": false,
  "error": "collection 'learning_history' not found",
  "errorCode": -1
}
```

- `success: false`：表示查询失败
- `error`：具体的错误信息
- `errorCode`：错误代码

## 常见问题排查

### 1. openid 获取失败

**症状**：测试显示 "无法获取openid"

**解决方案**：
- 检查 `login` 云函数是否正常部署
- 确认小程序已正确配置云开发
- 检查网络连接是否正常

### 2. 集合不存在

**症状**：测试显示 "collection not found"

**解决方案**：
- 检查云数据库中是否创建了相应集合
- 确认集合名称拼写正确
- 检查数据库权限设置

### 3. 数据为空

**症状**：集合存在但用户数据为0

**解决方案**：
- 确认用户已进行过学习活动
- 检查数据保存逻辑是否正常
- 验证 `openid` 字段是否正确设置

### 4. 云函数调用失败

**症状**：云函数测试返回错误

**解决方案**：
- 检查云函数是否正确部署
- 确认云函数代码无语法错误
- 检查云函数权限配置

## 调试技巧

### 1. 查看详细日志

在测试页面中，点击"复制日志"按钮，将完整的测试日志复制到剪贴板，然后粘贴到文本编辑器中查看详细信息。

### 2. 分步测试

不要一开始就运行完整测试，建议按以下顺序进行：
1. 先测试 `learning_sessions` 集合（这是确定存在的）
2. 再测试 `learning_history` 集合
3. 最后运行完整测试

### 3. 对比数据结构

如果两个集合都有数据，对比它们的数据结构，选择更适合的集合用于历史记录显示。

### 4. 检查字段映射

确认前端代码中的字段映射是否与数据库中的实际字段名称一致。

## 修复建议

根据测试结果，工具会自动提供修复建议：

- ✅ **建议使用 learning_history 集合**：如果该集合有用户数据
- ✅ **建议使用 learning_sessions 集合**：如果 learning_history 无数据但 learning_sessions 有数据
- ⚠️ **需要先创建学习记录**：如果两个集合都没有用户数据

## 注意事项

1. **权限问题**：确保小程序有访问云数据库的权限
2. **网络环境**：在良好的网络环境下进行测试
3. **数据隐私**：测试工具不会修改任何数据，仅进行读取操作
4. **性能影响**：大量测试可能会消耗云开发资源，建议适度使用

## 技术支持

如果在使用过程中遇到问题，请：

1. 首先查看测试日志中的详细错误信息
2. 参考本文档的常见问题排查部分
3. 检查云开发控制台中的错误日志
4. 确认代码是否有语法错误或逻辑问题

---

**创建时间**：2024年12月
**版本**：1.0.0
**用途**：调试 learning_history 历史记录显示问题