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

  // 拍照
  takePhoto: function() {
    if (!this.data.hasPermission) {
      wx.showToast({
        title: '请先授权摄像头权限',
        icon: 'none'
      });
      return;
    }
    
    if (!this.data.cameraReady) {
      wx.showToast({
        title: '相机未准备好，请稍候',
        icon: 'none'
      });
      return;
    }
    
    wx.showLoading({
      title: '拍照中...',
      mask: true
    });
    
    this.data.cameraContext.takePhoto({
      quality: 'high',
      success: (res) => {
        wx.hideLoading();
        this.setData({
          imagePath: res.tempImagePath,
          showPreview: true
        });
      },
      fail: (error) => {
        wx.hideLoading();
        console.error('拍照失败:', error);
        wx.showToast({
          title: '拍照失败，请重试',
          icon: 'none'
        });
      }
    });
  },

  // 从相册选择
  chooseFromAlbum: function() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      success: (res) => {
        this.setData({
          imagePath: res.tempFiles[0].tempFilePath,
          showPreview: true
        });
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
  
  
    // 将图片保存到全局变量
    app.globalData = app.globalData || {};
    app.globalData.questionImage = this.data.imagePath;
  
    // 将图片转换为Base64格式
    this.convertImageToBase64(this.data.imagePath)
      .then((base64Data) => {
        console.log('图片转换为Base64成功');
        
        // 更新处理步骤
        this.setData({
          processingStep: 1,
          processingText: '分析内容'
        });
        
        // 直接调用analyzeQuestion云函数，传递Base64数据
        wx.cloud.callFunction({
          name: 'analyzeQuestion',
          data: {
            imageBase64: base64Data,
            openid: wx.getStorageSync('openid') || 'anonymous_' + Date.now(),
            sessionId: 'session_' + Date.now()
          },
          success: (res) => {
            console.log('云函数调用成功:', res);
            // 移除wx.hideLoading()，因为我们没有显示弹窗
            
            // 更新处理步骤
            this.setData({
              processingStep: 2,
              processingText: '生成问题'
            });
            
            if (res.result.success) {
              const analysisData = res.result.data;
              
              // 创建学习会话数据
              const sessionData = {
                sessionId: res.result.data.sessionId || 'session_' + Date.now(),
                questionText: analysisData.questionText || '识别到的题目',
                questionImage: this.data.imagePath,
                startTime: new Date().toISOString(),
                currentRound: 1,
                maxRounds: 3,
                // 使用AI分析结果中的questions作为第一个问题
                firstQuestion: analysisData.questions && analysisData.questions.length > 0 
                  ? analysisData.questions[0] 
                  : '你好！我是希希老师。让我们一起来解决这道数学题吧！首先，你能告诉我这道题目要求我们做什么吗？',
                // 保存完整的AI分析结果
                aiAnalysis: {
                  gradeLevel: analysisData.gradeLevel,
                  difficulty: analysisData.difficulty,
                  keyNumbers: analysisData.keyNumbers,
                  keyRelation: analysisData.keyRelation,
                  questions: analysisData.questions
                },
                messages: []
              };
              
              // 保存会话数据到本地存储
              wx.setStorageSync('currentSession', sessionData);
              
              // 短暂延迟后跳转，让用户看到完成状态
              setTimeout(() => {
                // 跳转到学习页面
                wx.navigateTo({
                  url: `/pages/learning/learning?sessionId=${sessionData.sessionId}&mode=new`,
                  success: () => {
                    this.setData({
                      isProcessing: false,
                      showPreview: false,
                      cameraReady: false
                    });
                  },
                  fail: (err) => {
                    console.error('跳转失败:', err);
                    this.setData({ isProcessing: false });
                    wx.showToast({
                      title: '跳转失败，请重试',
                      icon: 'none'
                    });
                  }
                });
              }, 800); // 延迟800ms让用户看到处理完成
            } else {
              // 云函数调用失败，使用默认数据
              console.error('图像识别失败:', res.result.error);
              this.handleAnalysisFailure();
            }
          },
          fail: (err) => {
            console.error('云函数调用失败:', err);
            // 移除wx.hideLoading()，因为我们没有显示弹窗
            this.handleAnalysisFailure();
          }
        });
      })
      .catch((error) => {
        console.error('图片转换Base64失败:', error);
        // 移除wx.hideLoading()，因为我们没有显示弹窗
        this.handleAnalysisFailure();
      });
  },

  /**
   * 将图片转换为Base64格式
   * @param {string} imagePath - 图片的本地路径
   * @returns {Promise<string>} - 返回Base64编码的图片数据
   */
  convertImageToBase64: function(imagePath) {
    return new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath: imagePath,
        encoding: 'base64',
        success: (res) => {
          // 只返回纯Base64数据，不添加前缀
          resolve(res.data);
        },
        fail: (error) => {
          console.error('读取文件失败:', error);
          reject(error);
        }
      });
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
  }
});
