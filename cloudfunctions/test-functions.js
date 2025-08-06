#!/usr/bin/env node

/**
 * 希希数学小助手 云函数测试脚本
 * 用于测试各个云函数的基本功能
 */

const cloud = require('wx-server-sdk');

// 初始化云开发
cloud.init({
  env: process.env.CLOUD_ENV_ID || cloud.DYNAMIC_CURRENT_ENV
});

// 颜色输出
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// 测试数据
const TEST_DATA = {
  userId: 'test_user_001',
  sessionId: 'test_session_' + Date.now(),
  timestamp: new Date().toISOString(),
  sampleQuestion: '小明有5个苹果，吃了2个，还剩几个？',
  sampleAnswer: '我觉得应该是5-2=3个苹果'
};

// 测试用例
const TEST_CASES = [
  {
    name: 'syncUserData',
    description: '测试用户数据同步',
    params: {
      userId: TEST_DATA.userId,
      userInfo: {
        nickname: '测试用户',
        avatar: 'https://example.com/avatar.jpg',
        level: 1,
        experience: 0
      },
      timestamp: TEST_DATA.timestamp
    }
  },
  {
    name: 'recordBehavior',
    description: '测试用户行为记录',
    params: {
      userId: TEST_DATA.userId,
      action: 'test_action',
      data: { test: true },
      page: '/pages/index/index',
      timestamp: TEST_DATA.timestamp
    }
  },
  {
    name: 'getUserHistory',
    description: '测试获取用户历史',
    params: {
      userId: TEST_DATA.userId,
      page: 1,
      pageSize: 10,
      type: 'all'
    }
  }
];

async function testCloudFunction(testCase) {
  const { name, description, params } = testCase;
  
  try {
    log(`🧪 测试云函数: ${name}`, 'blue');
    log(`   描述: ${description}`, 'reset');
    log(`   参数: ${JSON.stringify(params, null, 2)}`, 'yellow');
    
    const startTime = Date.now();
    const result = await cloud.callFunction({
      name: name,
      data: params
    });
    const endTime = Date.now();
    
    if (result.result.success) {
      log(`✅ 测试成功 (${endTime - startTime}ms)`, 'green');
      log(`   返回数据: ${JSON.stringify(result.result.data, null, 2)}`, 'reset');
    } else {
      log(`❌ 测试失败: ${result.result.error}`, 'red');
      log(`   错误代码: ${result.result.code}`, 'red');
    }
    
    return result.result.success;
    
  } catch (error) {
    log(`❌ 测试异常: ${error.message}`, 'red');
    return false;
  }
}

async function runAllTests() {
  log('🎯 希希数学小助手 云函数测试工具', 'blue');
  log('=' * 60, 'blue');
  
  log(`📋 准备测试 ${TEST_CASES.length} 个云函数`, 'blue');
  log('');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const testCase of TEST_CASES) {
    const success = await testCloudFunction(testCase);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    log(''); // 空行分隔
  }
  
  // 测试总结
  log('=' * 60, 'blue');
  log(`📊 测试完成统计:`, 'blue');
  log(`  ✅ 成功: ${successCount}`, 'green');
  log(`  ❌ 失败: ${failCount}`, failCount > 0 ? 'red' : 'reset');
  log(`  📈 成功率: ${Math.round(successCount / TEST_CASES.length * 100)}%`, 'blue');
  
  return failCount === 0;
}

async function testSpecificFunction(functionName) {
  const testCase = TEST_CASES.find(tc => tc.name === functionName);
  
  if (!testCase) {
    log(`❌ 未找到云函数测试用例: ${functionName}`, 'red');
    log(`可用的测试用例: ${TEST_CASES.map(tc => tc.name).join(', ')}`, 'yellow');
    return false;
  }
  
  log(`🎯 测试指定云函数: ${functionName}`, 'blue');
  log('=' * 40, 'blue');
  
  const success = await testCloudFunction(testCase);
  return success;
}

// 主函数
async function main() {
  const targetFunction = process.argv[2];
  
  try {
    let success;
    
    if (targetFunction) {
      success = await testSpecificFunction(targetFunction);
    } else {
      success = await runAllTests();
    }
    
    process.exit(success ? 0 : 1);
    
  } catch (error) {
    log(`❌ 测试执行失败: ${error.message}`, 'red');
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  runAllTests,
  testSpecificFunction,
  TEST_CASES
};