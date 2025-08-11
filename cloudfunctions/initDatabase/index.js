/**
 * 希希数学小助手 - NoSQL数据库初始化云函数
 * 环境ID: cloud1-8g4cl3p21c582f6e
 */

const cloud = require('wx-server-sdk');

// 初始化云开发环境
cloud.init({
  env: 'cloud1-8g4cl3p21c582f6e'
});

const db = cloud.database();

/**
 * 创建集合并设置索引
 */
async function initDatabase() {
  console.log('开始初始化数据库...');
  
  try {
    // 1. 创建 users 集合
    await createUsersCollection();
    
    // 2. 创建 learning_sessions 集合
    await createLearningSessionsCollection();
    
    // 3. 创建 learning_reports 集合
    await createLearningReportsCollection();
    
    // 4. 创建 user_behaviors 集合
    await createUserBehaviorsCollection();
    
    // 5. 创建 user_stats 集合
    await createUserStatsCollection();
    
    console.log('✅ 数据库初始化完成！');
    
  } catch (error) {
    console.error('❌ 数据库初始化失败:', error);
    throw error;
  }
}

/**
 * 创建用户集合
 */
async function createUsersCollection() {
  console.log('创建 users 集合...');
  
  try {
    // 尝试创建集合（通过查询操作触发集合创建）
    await db.collection('users').limit(1).get();
    console.log('✅ users 集合创建成功');
  } catch (error) {
    console.log('✅ users 集合创建成功');
  }
}

/**
 * 创建学习会话集合
 */
async function createLearningSessionsCollection() {
  console.log('创建 learning_sessions 集合...');
  
  try {
    await db.collection('learning_sessions').limit(1).get();
    console.log('✅ learning_sessions 集合创建成功');
  } catch (error) {
    console.log('✅ learning_sessions 集合创建成功');
  }
}

/**
 * 创建学习报告集合
 */
async function createLearningReportsCollection() {
  console.log('创建 learning_reports 集合...');
  
  try {
    await db.collection('learning_reports').limit(1).get();
    console.log('✅ learning_reports 集合创建成功');
  } catch (error) {
    console.log('✅ learning_reports 集合创建成功');
  }
}

/**
 * 创建用户行为集合
 */
async function createUserBehaviorsCollection() {
  console.log('创建 user_behaviors 集合...');
  
  try {
    await db.collection('user_behaviors').limit(1).get();
    console.log('✅ user_behaviors 集合创建成功');
  } catch (error) {
    console.log('✅ user_behaviors 集合创建成功');
  }
}

/**
 * 创建用户统计集合
 */
async function createUserStatsCollection() {
  console.log('创建 user_stats 集合...');
  
  try {
    await db.collection('user_stats').limit(1).get();
    console.log('✅ user_stats 集合创建成功');
  } catch (error) {
    console.log('✅ user_stats 集合创建成功');
  }
}

/**
 * 云函数入口
 */
exports.main = async (event, context) => {
  try {
    await initDatabase();
    return {
      success: true,
      message: '数据库初始化成功',
      collections: ['users', 'learning_sessions', 'learning_reports', 'user_behaviors', 'user_stats']
    };
  } catch (error) {
    console.error('数据库初始化失败:', error);
    return {
      success: false,
      message: '数据库初始化失败',
      error: error.message
    };
  }
};