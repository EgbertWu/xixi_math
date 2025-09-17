// pages/camera/camera.js
const app = getApp();

Page({
  data: {
    cameraPosition: 'back',
    flash: 'off',
    showPreview: false,
    isProcessing: false,
    imagePath: '',
    processingText: '识别题目',
    processingStep: 0,
    showTips: true,
    tips: [
      '将题目放在屏幕中央',
      '整个屏幕区域都会被识别',
      '保持光线充足效果更佳'
    ],
    currentTipIndex: 0,
    cameraContext: null,
    cameraReady: false,
    hasPermission: false  // 新增：权限状态
  },

  onLoad: function(options) {
    // 检查摄像头权限
    this.checkCameraPermission();
  },
  
  // 新增：检查摄像头权限的方法
  checkCameraPermission: function() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.camera']) {
          // 已授权，初始化摄像头
          this.initCamera();
        } else {
          // 未授权，请求授权
          this.requestCameraPermission();
        }
      },
      fail: (err) => {
        console.error('获取设置失败:', err);
        this.showPermissionError();
      }
    });
  },
  
  //请求摄像头权限
  requestCameraPermission: function() {
    wx.authorize({
      scope: 'scope.camera',
      success: () => {
        this.initCamera();
      },
      fail: () => {
        // 用户拒绝授权，显示引导
        this.showPermissionGuide();
      }
    });
  },
  
  // 新增：初始化摄像头
  initCamera: function() {
    this.setData({
      hasPermission: true,
      cameraContext: wx.createCameraContext()
    });
    
    // 定期切换提示
    this.tipInterval = setInterval(() => {
      let nextIndex = (this.data.currentTipIndex + 1) % this.data.tips.length;
      this.setData({
        currentTipIndex: nextIndex
      });
    }, 3000);
    
    // 设置一个定时器，在一段时间后隐藏提示
    setTimeout(() => {
      this.setData({
        showTips: false
      });
    }, 9000);
  },
  
  // 显示权限引导
  showPermissionGuide: function() {
    wx.showModal({
      title: '需要摄像头权限',
      content: '请在设置中开启摄像头权限，以便拍摄数学题目',
      confirmText: '去设置',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          wx.openSetting({
            success: (settingRes) => {
              if (settingRes.authSetting['scope.camera']) {
                this.initCamera();
              } else {
                wx.navigateBack();
              }
            }
          });
        } else {
          wx.navigateBack();
        }
      }
    });
  },
  
  // 显示权限错误
  showPermissionError: function() {
    wx.showToast({
      title: '无法获取摄像头权限',
      icon: 'none',
      duration: 2000
    });
    setTimeout(() => {
      wx.navigateBack();
    }, 2000);
  },
  
  onReady: function() {
    this.setData({
      cameraReady: true
    });
  },

  onUnload: function() {
    // 清除定时器
    if (this.tipInterval) {
      clearInterval(this.tipInterval);
    }
    if (this.processingInterval) {
      clearInterval(this.processingInterval);
    }
    
    // 关闭摄像头
    if (this.data.cameraContext) {
      this.data.cameraContext.stopRecord();
    }
    
    // 重置摄像头相关状态
    this.setData({
      cameraReady: false,
      hasPermission: false,
      cameraContext: null
    });
    
    console.log('摄像头已关闭，页面卸载完成');
  },

  // 切换闪光灯
  toggleFlash: function() {
    this.setData({
      flash: this.data.flash === 'on' ? 'off' : 'on'
    });
  },

  // 切换摄像头
  switchCamera: function() {
    this.setData({
      cameraPosition: this.data.cameraPosition === 'back' ? 'front' : 'back'
    });
  },

  /**
 * 检查并压缩图片
 * @param {string} tempFilePath 临时文件路径
 * @returns {Promise<string>} 处理后的文件路径
 */
  async checkAndCompressImage(tempFilePath) {
    try {
      // 获取图片信息
      const imageInfo = await new Promise((resolve, reject) => {
        wx.getImageInfo({
          src: tempFilePath,
          success: resolve,
          fail: reject
        });
      });
      
      console.log('原始图片信息:', imageInfo);
      // 检查图片大小（1MB = 1024 * 1024 字节）
      const maxSize = 800 * 1024; // 800KB 限制，为云函数调用留出余量
    // 如果图片过大，进行压缩
      if (imageInfo.width * imageInfo.height > 1000000 || this.estimateFileSize(imageInfo) > maxSize) {
        return await this.compressImage(tempFilePath, imageInfo);
      }
      return tempFilePath;
    } catch (error) {
      console.error('图片检查失败:', error);
      throw new Error('图片处理失败，请重试');
    }
  },

/**
 * 估算图片文件大小
 * @param {Object} imageInfo 图片信息
 * @returns {number} 估算的文件大小（字节）
 */
  estimateFileSize(imageInfo) {
    // 粗略估算：宽度 × 高度 × 3（RGB） × 压缩率
    return imageInfo.width * imageInfo.height * 3 * 0.3;
  },

/**
 * 压缩图片
 * @param {string} src 源图片路径
 * @param {Object} imageInfo 图片信息
 * @returns {Promise<string>} 压缩后的图片路径
 */
  async compressImage(src, imageInfo) {
    try {
      // 计算压缩后的尺寸
      let { width, height } = imageInfo;
      const maxDimension = 1500; // 最大边长
      
      if (width > maxDimension || height > maxDimension) {
        const ratio = Math.min(maxDimension / width, maxDimension / height);
        width = Math.floor(width * ratio);
        height = Math.floor(height * ratio);
      }
      
      // 使用 canvas 压缩图片
      const canvas = wx.createCanvasContext('compressCanvas', this);
      
      return await new Promise((resolve, reject) => {
        // 绘制压缩后的图片
      canvas.drawImage(src, 0, 0, width, height);
      canvas.draw(false, () => {
        wx.canvasToTempFilePath({
          canvasId: 'compressCanvas',
          width: width,
          height: height,
          destWidth: width,
          destHeight: height,
          quality: 0.8, // 压缩质量
          success: (res) => {
            console.log('图片压缩成功:', res.tempFilePath);
            resolve(res.tempFilePath);
          },
          fail: reject
        }, this);
      });
    });
  } catch (error) {
    console.error('图片压缩失败:', error);
    throw new Error('图片压缩失败');
  }
},

  // 拍照
  takePhoto() {
  const ctx = wx.createCameraContext();
  ctx.takePhoto({
    quality: 'normal',
    success: async (res) => {
      try {
        wx.showLoading({ title: '处理图片中...' });
        
        // 检查并压缩图片
        const processedPath = await this.checkAndCompressImage(res.tempImagePath);
        
        this.setData({
          imagePath: processedPath,
          showPreview: true
        });
        
        wx.hideLoading();
      } catch (error) {
        wx.hideLoading();
        wx.showToast({
          title: error.message || '图片处理失败',
          icon: 'none'
        });
      }
    },
    fail: (error) => {
      console.error('拍照失败:', error);
      wx.showToast({
        title: '拍照失败，请重试',
        icon: 'none'
      });
    }
  });
},

  // 从相册选择
  chooseFromAlbum(){
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      maxDuration: 30,
      camera: 'back',
      success: async (res) => {
        try {
          wx.showLoading({ title: '处理图片中...' });
          
          // 检查并压缩图片
          const processedPath = await this.checkAndCompressImage(res.tempFiles[0].tempFilePath);
          
          this.setData({
            imagePath: processedPath,
            showPreview: true
          });
          
          wx.hideLoading();
        } catch (error) {
          wx.hideLoading();
          wx.showToast({
            title: error.message || '图片处理失败',
            icon: 'none'
          });
        }
      },
      fail: (error) => {
        console.error('选择图片失败:', error);
        wx.showToast({
          title: '选择图片失败',
          icon: 'none'
        });
      }
    });
  },

  // 返回
  goBack: function() {
    if (this.data.showPreview) {
      this.setData({
        showPreview: false
      });
    } else {
      wx.navigateBack();
    }
  },

  // 重新拍照
  retakePhoto: function() {
    this.setData({
      showPreview: false
    });
  },

  // 确认使用照片
  confirmPhoto: function() {
    if (this.data.isProcessing) return;
    
    this.setData({
      isProcessing: true,
      processingStep: 0,
      processingText: '识别题目'
    });

    // 上传图片到云存储
    this.uploadImageToCloud(this.data.imagePath)
    .then((fileID) => {
      console.log('图片上传成功，fileID:', fileID);
      // 更新处理步骤
      this.setData({
        processingStep: 1,
        processingText: '分析内容'
      });
      
      // 调用云函数进行分析
      return wx.cloud.callFunction({
        name: 'analyzeQuestion',
        data: {
          imageFileID: fileID, // 传递云存储文件ID
          openid: wx.getStorageSync('openid') || 'anonymous_' + Date.now(),
          sessionId: 'session_' + Date.now()
        }
      });
    })
    .then((res) => {
      console.log('analyzeQuestion云函数调用成功:', res);

      this.setData({
        processingStep: 2,
        processingText: '生成问题'
      });
      
      if (res.result.success) {
        const analysisData = res.result.data;


        console.log('analysisData:', analysisData);
        console.log('analysisData.questions:', analysisData.questions);
        console.log('analysisData.questions类型:', typeof analysisData.questions);
        console.log('analysisData.questions是否为数组:', Array.isArray(analysisData.questions));
        
        // 创建学习会话数据
        const sessionData = {
          sessionId: res.result.data.sessionId || 'session_' + Date.now(),
          questionText: analysisData.questionText || '识别到的题目',
          questionImage: this.data.imagePath, // 本地预览用
          questionImageFileID: res.result.data.imageFileID, // 云存储文件ID
          imageUploadTime: new Date().toISOString(), // 记录上传时间，用于清理
          startTime: new Date().toISOString(),
          currentRound: 1,
          maxRounds: 3,
          firstQuestion: (analysisData.questions && Array.isArray(analysisData.questions) && analysisData.questions.length > 0)
            ? analysisData.questions[0] 
            : '你好！我是希希老师。让我们一起来解决这道数学题吧！首先，你能告诉我这道题目问了什么问题吗？',
          aiAnalysis: {
              gradeLevel: analysisData.gradeLevel || '未知',
              difficulty: analysisData.difficulty || '中等',
              keyNumbers: analysisData.keyNumbers || [],
              keyRelation: analysisData.keyRelation || '未知关系',
              questions: (analysisData.questions && Array.isArray(analysisData.questions)) 
                ? analysisData.questions 
                : []
          },
          messages: []
        };
        
        // 保存会话数据
        wx.setStorageSync('currentSession', sessionData);
        
        // 跳转到学习页面
        setTimeout(() => {
          wx.navigateTo({
            url: `/pages/learning/learning?sessionId=${sessionData.sessionId}&mode=new`,
            success: () => {
              console.log('页面跳转成功，传递参数:', {
                sessionId: sessionData.sessionId,
                mode: 'new'
              });
              this.setData({ isProcessing: false });
            },
            fail: (error) => {
              console.error('页面跳转失败:', error);
              this.setData({ isProcessing: false });
              wx.showToast({
                title: '跳转失败，请重试',
                icon: 'none'
              });
            }
          });
        }, 800);
      } else {
        console.error('图像识别失败:', res.result.error);
        this.handleAnalysisFailure();
      }
    })
    .catch((error) => {
      console.error('处理失败:', error);
      this.handleAnalysisFailure();
    });
  },

  /**
 * 上传图片到云存储
 * @param {string} imagePath - 本地图片路径
 * @returns {Promise<string>} - 返回云存储文件ID
 * 改动原因：实现图片云存储上传，使用时间戳和随机字符串生成唯一文件名
 */
  uploadImageToCloud: function(imagePath) {
    return new Promise((resolve, reject) => {
      // 生成唯一文件名，包含时间戳便于后续清理
      const timestamp = Date.now();
      const randomStr = Math.random().toString(36).substring(2, 8);
      const cloudPath = `question-images/${timestamp}_${randomStr}.jpg`;
      
      console.log('开始上传图片到云存储:', cloudPath);
      
      wx.cloud.uploadFile({
        cloudPath: cloudPath,
        filePath: imagePath,
        success: (uploadRes) => {
        console.log('图片上传成功:', uploadRes);
        resolve(uploadRes.fileID);
      },
      fail: (error) => {
        console.error('图片上传失败:', error);
        wx.showToast({
          title: '图片上传失败，请重试',
          icon: 'none'
        });
        reject(error);
      }
    });
  });
},
// 添加图片大小提示
showImageSizeInfo(filePath) {
  wx.getFileInfo({
    filePath: filePath,
    success: (res) => {
      const sizeKB = Math.round(res.size / 1024);
      if (sizeKB > 500) {
        wx.showToast({
          title: `图片较大(${sizeKB}KB)，正在优化...`,
          icon: 'loading',
          duration: 2000
        });
      }
    }
  });
},

  // 处理分析失败的情况
  handleAnalysisFailure: function() {
    wx.showToast({
      title: '识别失败，请重试',
      icon: 'none',
      duration: 2000
    });
    
    this.setData({
      isProcessing: false
    });
    
    // 可以选择使用默认数据继续，或者让用户重新拍照
    setTimeout(() => {
      wx.showModal({
        title: '识别失败',
        content: '图像识别失败，是否重新拍照？',
        confirmText: '重新拍照',
        cancelText: '返回',
        success: (res) => {
          if (res.confirm) {
            this.setData({
              showPreview: false
            });
          } else {
            wx.navigateBack();
          }
        }
      });
    }, 2000);
  },
    
  // 相机错误处理
  onCameraError: function(e) {
    console.error('相机错误:', e.detail);
    
    // 根据错误类型给出不同提示
    let errorMsg = '相机启动失败';
    if (e.detail.errMsg && e.detail.errMsg.includes('authorize')) {
      errorMsg = '请授权摄像头权限';
      this.showPermissionGuide();
      return;
    }
    
    wx.showToast({
      title: errorMsg,
      icon: 'none',
      duration: 2000
    });
  },
  handleImageError(error, context) {
  console.error(`${context}失败:`, error);
  
  let message = '操作失败，请重试';
  
  if (error.message.includes('大小')) {
    message = '图片过大，请选择较小的图片或重新拍照';
  } else if (error.message.includes('格式')) {
    message = '图片格式不支持，请选择 JPG 或 PNG 格式';
  } else if (error.message.includes('网络')) {
    message = '网络连接异常，请检查网络后重试';
  }
  
  wx.showModal({
    title: '提示',
    content: message,
    showCancel: false
  });
}
});
