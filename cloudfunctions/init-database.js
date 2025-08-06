#!/usr/bin/env node

/**
 * 希希数学小助手 数据库初始化脚本
 * 创建必要的数据库集合和索引
 */

const cloud = require('wx-server-sdk');

// 初始化云开发
cloud.init({
  env: process.env.CLOUD_ENV_ID || cloud.DYNAMIC_CURRENT_ENV
});

const db = cloud.database();

// 数据库集合配置
const COLLECTIONS = [
  {
    name: 'users',
    description: '用户信息表',
    indexes: [
      { keys: { openid: 1 }, unique: true },
      { keys: { createTime: -1 } },
      { keys: { lastSyncTime: -1 } }
    ]
  },
  {
    name: 'learning_sessions',
    description: '学习会话表',
    indexes: [
      { keys: { sessionId: 1 }, unique: true },
      { keys: { userId: 1, startTime: -1 } },
      { keys: { status: 1 } },
      { keys: { startTime: -1 } }
    ]
  },
  {
    name: 'learning_reports',
    description: '学习报告表',
    indexes: [
      { keys: { sessionId: 1 }, unique: true },
      { keys: { userId: 1, timestamp: -1 } },
      { keys: { timestamp: -1 } }
    ]
  },
  {
    name: 'user_behaviors',
    description: '用户行为记录表',
    indexes: [
      { keys: { userId: 1, timestamp: -1 } },
      { keys: { action: 1 } },
      { keys: { timestamp: -1 } },
      { keys: { platform: 1 } }
    ]
  },
  {
    name: 'user_stats',
    description: '用户统计数据表',
    indexes: [
      { keys: { userId: 1 }, unique: true },
      { keys: { lastActiveTime: -1 } }
    ]
  }
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

async function createCollection(collectionConfig) {
  const { name, description, indexes } = collectionConfig;
  
  try {
    log(`📦 创建集合: ${name} (${description})`, 'blue');
    
    // 检查集合是否已存在
    try {
      await db.collection(name).limit(1).get();
      log(`  ℹ️  集合 ${name} 已存在，跳过创建`, 'yellow');
    } catch (error) {
      if (error.errCode === -502005) {
        // 集合不存在，需要创建
        log(`  🆕 集合 ${name} 不存在，将在首次写入时自动创建`, 'yellow');
      } else {
        throw error;
      }
    }
    
    // 创建索引
    if (indexes && indexes.length > 0) {
      log(`  📋 为集合 ${name} 创建 ${indexes.length} 个索引...`, 'yellow');
      
      for (let i = 0; i < indexes.length; i++) {
        const index = indexes[i];
        try {
          // 注意：微信云开发的索引创建需要在控制台手动操作
          // 这里只是记录需要创建的索引信息
          const indexName = Object.keys(index.keys).join('_');
          log(`    - 索引 ${i + 1}: ${indexName} ${index.unique ? '(唯一)' : ''}`, 'reset');
        } catch (indexError) {
          log(`    ❌ 索引创建失败: ${indexError.message}`, 'red');
        }
      }
    }
    
    log(`✅ 集合 ${name} 配置完成`, 'green');
    return true;
    
  } catch (error) {
    log(`❌ 集合 ${name} 配置失败: ${error.message}`, 'red');
    return false;
  }
}

async function initializeDatabase() {
  log('🎯 希希数学小助手 数据库初始化工具', 'blue');
  log('=' * 60, 'blue');
  
  log(`📋 准备初始化 ${COLLECTIONS.length} 个数据库集合`, 'blue');
  log('');
  
  let successCount = 0;
  let failCount = 0;
  
  for (const collection of COLLECTIONS) {
    const success = await createCollection(collection);
    if (success) {
      successCount++;
    } else {
      failCount++;
    }
    log(''); // 空行分隔
  }
  
  // 初始化总结
  log('=' * 60, 'blue');
  log(`📊 数据库初始化完成统计:`, 'blue');
  log(`  ✅ 成功: ${successCount}`, 'green');
  log(`  ❌ 失败: ${failCount}`, failCount > 0 ? 'red' : 'reset');
  log(`  📈 成功率: ${Math.round(successCount / COLLECTIONS.length * 100)}%`, 'blue');
  
  // 输出索引创建提示
  log('');
  log('📝 重要提示:', 'yellow');
  log('  由于微信云开发的限制，数据库索引需要在云开发控制台手动创建。', 'yellow');
  log('  请登录云开发控制台 -> 数据库 -> 对应集合 -> 索引管理，按照上述信息创建索引。', 'yellow');
  
  return failCount === 0;
}

// 主函数
async function main() {
  try {
    const success = await initializeDatabase();
    process.exit(success ? 0 : 1);
  } catch (error) {
    log(`❌ 数据库初始化失败: ${error.message}`, 'red');
    process.exit(1);
  }
}

// 如果直接运行此脚本
if (require.main === module) {
  main();
}

module.exports = {
  initializeDatabase,
  COLLECTIONS
};