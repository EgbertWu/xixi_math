#!/usr/bin/env node

/**
 * 希希学习小助手 云函数更新脚本
 * 使用方法：node update.js [function-name]
 * 功能：安装依赖 -> 部署云函数 -> 验证部署
 */

const { execSync, spawn } = require('child_process');
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
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m'
};

function log(message, color = 'reset') {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`${colors[color]}[${timestamp}] ${message}${colors.reset}`);
}

function checkPackageJson(functionPath) {
  const packagePath = path.join(functionPath, 'package.json');
  if (!fs.existsSync(packagePath)) {
    log(`⚠️  未找到 package.json`, 'yellow');
    return false;
  }
  
  try {
    const packageData = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    log(`📋 包名: ${packageData.name}`, 'cyan');
    log(`📋 版本: ${packageData.version}`, 'cyan');
    
    const deps = packageData.dependencies || {};
    const depCount = Object.keys(deps).length;
    log(`📋 依赖数量: ${depCount}`, 'cyan');
    
    if (depCount > 0) {
      log(`📋 依赖列表:`, 'cyan');
      Object.entries(deps).forEach(([name, version]) => {
        log(`   - ${name}: ${version}`, 'cyan');
      });
    }
    
    return true;
  } catch (error) {
    log(`❌ package.json 格式错误: ${error.message}`, 'red');
    return false;
  }
}

function installDependencies(functionPath) {
  const packagePath = path.join(functionPath, 'package.json');
  const nodeModulesPath = path.join(functionPath, 'node_modules');
  
  if (!fs.existsSync(packagePath)) {
    log(`⚠️  跳过依赖安装 (无 package.json)`, 'yellow');
    return true;
  }
  
  try {
    // 清理旧的 node_modules
    if (fs.existsSync(nodeModulesPath)) {
      log(`🧹 清理旧依赖...`, 'yellow');
      fs.rmSync(nodeModulesPath, { recursive: true, force: true });
    }
    
    log(`📦 安装依赖...`, 'blue');
    execSync('npm install --production', { 
      stdio: 'inherit',
      cwd: functionPath 
    });
    
    log(`✅ 依赖安装完成`, 'green');
    return true;
    
  } catch (error) {
    log(`❌ 依赖安装失败: ${error.message}`, 'red');
    return false;
  }
}

function getCloudEnvironment() {
  try {
    // 优先从.env文件读取云环境ID
    const envFilePath = path.join(__dirname, '.env');
    if (fs.existsSync(envFilePath)) {
      const envContent = fs.readFileSync(envFilePath, 'utf8');
      const envMatch = envContent.match(/CLOUD_ENV_ID\s*=\s*(.+)/);
      if (envMatch && envMatch[1].trim()) {
        const envId = envMatch[1].trim();
        log(`🌍 从.env文件读取云环境: ${envId}`, 'green');
        return envId;
      }
    }
    
    // 如果.env文件中没有配置，尝试从CLI获取
    log(`📋 .env文件中未找到CLOUD_ENV_ID，尝试自动获取...`, 'yellow');
    
    const envListResult = execSync('tcb env list --json', { encoding: 'utf8', stdio: 'pipe' });
    const envList = JSON.parse(envListResult);
    
    if (envList && envList.length > 0) {
      // 如果只有一个环境，直接使用
      if (envList.length === 1) {
        const envId = envList[0].EnvId;
        log(`🌍 自动选择云环境: ${envId}`, 'green');
        return envId;
      }
      
      // 如果有多个环境，选择第一个或查找默认环境
      const defaultEnv = envList.find(env => env.IsDefault) || envList[0];
      const envId = defaultEnv.EnvId;
      log(`🌍 选择云环境: ${envId} ${defaultEnv.IsDefault ? '(默认)' : ''}`, 'green');
      return envId;
    }
    
    throw new Error('未找到可用的云环境');
    
  } catch (error) {
    log(`❌ 获取云环境失败: ${error.message}`, 'red');
    log(`💡 请在.env文件中配置CLOUD_ENV_ID，或确保已创建云开发环境`, 'yellow');
    return null;
  }
}

function deployFunction(functionName) {
  const functionPath = path.join(__dirname, functionName);
  
  if (!fs.existsSync(functionPath)) {
    log(`❌ 云函数 ${functionName} 不存在`, 'red');
    return false;
  }
  
  try {
    log(`🚀 开始更新云函数: ${functionName}`, 'magenta');
    log(`📁 函数路径: ${functionPath}`, 'cyan');
    
    // 获取云环境ID
    const envId = getCloudEnvironment();
    if (!envId) {
      return false;
    }
    
    // 检查 package.json
    if (!checkPackageJson(functionPath)) {
      return false;
    }
    
    // 进入云函数目录
    const originalDir = process.cwd();
    process.chdir(functionPath);
    
    // 安装依赖
    if (!installDependencies(functionPath)) {
      return false;
    }
    
    // 部署云函数（指定环境ID）
    log(`🚀 部署云函数到云端环境: ${envId}`, 'blue');
    execSync(`tcb fn deploy --force --envId ${envId}`, { stdio: 'inherit' });
    
    // 返回原目录
    process.chdir(originalDir);
    
    log(`✅ 云函数 ${functionName} 更新成功`, 'green');
    return true;
    
  } catch (error) {
    log(`❌ 云函数 ${functionName} 更新失败: ${error.message}`, 'red');
    return false;
  }
}

function verifyDeployment(functionName) {
  try {
    log(`🔍 验证云函数 ${functionName} 部署状态...`, 'blue');
    
    const result = execSync(`tcb fn list | grep ${functionName}`, { 
      encoding: 'utf8',
      stdio: 'pipe'
    });
    
    if (result.includes(functionName)) {
      log(`✅ 云函数 ${functionName} 部署验证成功`, 'green');
      return true;
    } else {
      log(`⚠️  云函数 ${functionName} 部署验证失败`, 'yellow');
      return false;
    }
    
  } catch (error) {
    log(`⚠️  无法验证云函数 ${functionName} 部署状态`, 'yellow');
    return false;
  }
}

function updateFunction(functionName) {
  log(`\n${'='.repeat(60)}`, 'blue');
  log(`🎯 更新云函数: ${functionName}`, 'magenta');
  log(`${'='.repeat(60)}`, 'blue');
  
  const success = deployFunction(functionName);
  
  if (success) {
    // 验证部署
    verifyDeployment(functionName);
  }
  
  return success;
}

function showUsage() {
  log(`\n🎯 希希学习小助手 云函数更新工具`, 'magenta');
  log(`${'='.repeat(50)}`, 'blue');
  log(`使用方法:`, 'cyan');
  log(`  node update.js                    # 更新所有云函数`, 'cyan');
  log(`  node update.js [function-name]    # 更新指定云函数`, 'cyan');
  log(``, 'reset');
  log(`可用的云函数:`, 'cyan');
  CLOUD_FUNCTIONS.forEach(name => {
    log(`  - ${name}`, 'cyan');
  });
  log(``, 'reset');
}

function main() {
  const targetFunction = process.argv[2];
  
  // 显示帮助信息
  if (targetFunction === '--help' || targetFunction === '-h') {
    showUsage();
    return;
  }
  
  log(`🎯 希希学习小助手 云函数更新工具`, 'magenta');
  log(`⏰ 开始时间: ${new Date().toLocaleString()}`, 'cyan');
  
  if (targetFunction) {
    // 更新指定云函数
    if (!CLOUD_FUNCTIONS.includes(targetFunction)) {
      log(`❌ 未知的云函数: ${targetFunction}`, 'red');
      log(`可用的云函数: ${CLOUD_FUNCTIONS.join(', ')}`, 'yellow');
      showUsage();
      process.exit(1);
    }
    
    const success = updateFunction(targetFunction);
    
    log(`\n${'='.repeat(60)}`, 'blue');
    log(`📊 更新结果: ${success ? '✅ 成功' : '❌ 失败'}`, success ? 'green' : 'red');
    log(`⏰ 完成时间: ${new Date().toLocaleString()}`, 'cyan');
    
    process.exit(success ? 0 : 1);
    
  } else {
    // 更新所有云函数
    log(`📋 准备更新 ${CLOUD_FUNCTIONS.length} 个云函数`, 'blue');
    
    let successCount = 0;
    let failCount = 0;
    const results = [];
    
    for (const functionName of CLOUD_FUNCTIONS) {
      const success = updateFunction(functionName);
      results.push({ name: functionName, success });
      
      if (success) {
        successCount++;
      } else {
        failCount++;
      }
    }
    
    // 更新总结
    log(`\n${'='.repeat(60)}`, 'blue');
    log(`📊 更新完成统计:`, 'magenta');
    log(`  ✅ 成功: ${successCount}`, 'green');
    log(`  ❌ 失败: ${failCount}`, failCount > 0 ? 'red' : 'reset');
    log(`  📈 成功率: ${Math.round(successCount / CLOUD_FUNCTIONS.length * 100)}%`, 'blue');
    
    // 详细结果
    log(`\n📋 详细结果:`, 'cyan');
    results.forEach(({ name, success }) => {
      const status = success ? '✅' : '❌';
      const color = success ? 'green' : 'red';
      log(`  ${status} ${name}`, color);
    });
    
    log(`⏰ 完成时间: ${new Date().toLocaleString()}`, 'cyan');
    
    process.exit(failCount > 0 ? 1 : 0);
  }
}

// 检查环境
function checkEnvironment() {
  // 检查是否安装了腾讯云CLI
  try {
    execSync('tcb --version', { stdio: 'ignore' });
    log(`✅ 腾讯云CLI工具检查通过`, 'green');
  } catch (error) {
    log(`❌ 未检测到腾讯云CLI工具`, 'red');
    log(`请先安装: npm install -g @cloudbase/cli`, 'yellow');
    log(`然后登录: tcb login`, 'yellow');
    process.exit(1);
  }
  
  // 检查是否已登录
  try {
    execSync('tcb env list', { stdio: 'ignore' });
    log(`✅ 腾讯云登录状态检查通过`, 'green');
  } catch (error) {
    log(`❌ 未登录腾讯云`, 'red');
    log(`请先登录: tcb login`, 'yellow');
    process.exit(1);
  }
  
  // 检查Node.js版本
  const nodeVersion = process.version;
  log(`✅ Node.js版本: ${nodeVersion}`, 'green');
  
  // 检查npm版本
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    log(`✅ npm版本: ${npmVersion}`, 'green');
  } catch (error) {
    log(`⚠️  无法获取npm版本`, 'yellow');
  }
}

// 程序入口
log(`🔍 检查运行环境...`, 'blue');
checkEnvironment();
log(`✅ 环境检查完成\n`, 'green');

main();