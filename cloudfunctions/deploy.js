#!/usr/bin/env node

/**
 * 希希数学小助手 云函数批量部署脚本
 * 使用方法：node deploy.js [function-name]
 * 不指定函数名则部署所有云函数
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 云函数列表
const CLOUD_FUNCTIONS = [
  'analyzeQuestion',
  'handleAnswer', 
  'generateReport',
  'getUserHistory',
  'recordBehavior',
  'syncUserData'
];

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

function deployFunction(functionName) {
  const functionPath = path.join(__dirname, functionName);
  
  if (!fs.existsSync(functionPath)) {
    log(`❌ 云函数 ${functionName} 不存在`, 'red');
    return false;
  }
  
  try {
    log(`📦 开始部署云函数: ${functionName}`, 'blue');
    
    // 进入云函数目录
    process.chdir(functionPath);
    
    // 安装依赖
    log(`  📥 安装依赖...`, 'yellow');
    execSync('npm install', { stdio: 'inherit' });
    
    // 部署云函数
    log(`  🚀 部署中...`, 'yellow');
    execSync('tcb fn deploy', { stdio: 'inherit' });
    
    log(`✅ 云函数 ${functionName} 部署成功`, 'green');
    return true;
    
  } catch (error) {
    log(`❌ 云函数 ${functionName} 部署失败: ${error.message}`, 'red');
    return false;
  } finally {
    // 返回原目录
    process.chdir(__dirname);
  }
}

function main() {
  const targetFunction = process.argv[2];
  
  log('🎯 希希数学小助手 云函数部署工具', 'blue');
  log('=' * 50, 'blue');
  
  if (targetFunction) {
    // 部署指定云函数
    if (!CLOUD_FUNCTIONS.includes(targetFunction)) {
      log(`❌ 未知的云函数: ${targetFunction}`, 'red');
      log(`可用的云函数: ${CLOUD_FUNCTIONS.join(', ')}`, 'yellow');
      process.exit(1);
    }
    
    const success = deployFunction(targetFunction);
    process.exit(success ? 0 : 1);
    
  } else {
    // 部署所有云函数
    log(`📋 准备部署 ${CLOUD_FUNCTIONS.length} 个云函数`, 'blue');
    
    let successCount = 0;
    let failCount = 0;
    
    for (const functionName of CLOUD_FUNCTIONS) {
      const success = deployFunction(functionName);
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
      log(''); // 空行分隔
    }
    
    // 部署总结
    log('=' * 50, 'blue');
    log(`📊 部署完成统计:`, 'blue');
    log(`  ✅ 成功: ${successCount}`, 'green');
    log(`  ❌ 失败: ${failCount}`, failCount > 0 ? 'red' : 'reset');
    log(`  📈 成功率: ${Math.round(successCount / CLOUD_FUNCTIONS.length * 100)}%`, 'blue');
    
    process.exit(failCount > 0 ? 1 : 0);
  }
}

// 检查是否安装了腾讯云CLI
try {
  execSync('tcb --version', { stdio: 'ignore' });
} catch (error) {
  log('❌ 未检测到腾讯云CLI工具', 'red');
  log('请先安装: npm install -g @cloudbase/cli', 'yellow');
  log('然后登录: tcb login', 'yellow');
  process.exit(1);
}

main();