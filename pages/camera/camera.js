// pages/camera/camera.js
// 希希数学小助手 拍照识别页面逻辑

const app = getApp()

Page({
  /**
   * 页面的初始数据
   */
  data: {
    cameraPosition: 'back', // 摄像头位置：back/front
    flash: 'off', // 闪光灯：off/on/auto
    isRecording: false, // 是否正在录制
    showPreview: false, // 是否显示预览
    imagePath: '', // 拍摄的图片路径
    isProcessing: false, // 是否正在处理
    processingText: '正在识别题目...',
    tips: [
      '确保题目完整清晰',
      '避免反光和阴影',
      '保持手机稳定',
      '光线充足效果更佳'
    ],
    currentTipIndex: 0
  },

  /**
   * 生命周期函数--监听页面加载
   */
  onLoad(options) {
    console.log('拍照页面加载', options)
    
    // 记录页面访问
    app.trackUserBehavior('page_visit', {
      page: 'camera'
    })
    
    // 开始轮播提示
    this.startTipsRotation()
    
    // 检查摄像头权限
    this.checkCameraPermission()
  },

  /**
   * 生命周期函数--监听页面卸载
   */
  onUnload() {
    // 清理定时器
    if (this.tipsTimer) {
      clearInterval(this.tipsTimer)
    }
  },

  /**
   * 检查摄像头权限
   */
  checkCameraPermission() {
    wx.getSetting({
      success: (res) => {
        if (res.authSetting['scope.camera'] === false) {
          // 用户拒绝了摄像头权限
          wx.showModal({
            title: '需要摄像头权限',
            content: '拍照识别题目需要使用摄像头，请在设置中开启摄像头权限',
            confirmText: '去设置',
            cancelText: '返回',
            success: (modalRes) => {
              if (modalRes.confirm) {
                wx.openSetting()
              } else {
                wx.navigateBack()
              }
            }
          })
        }
      }
    })
  },

  /**
   * 开始提示轮播
   */
  startTipsRotation() {
    this.tipsTimer = setInterval(() => {
      const nextIndex = (this.data.currentTipIndex + 1) % this.data.tips.length
      this.setData({
        currentTipIndex: nextIndex
      })
    }, 3000)
  },

  /**
   * 拍照
   */
  takePhoto() {
    const ctx = wx.createCameraContext()
    
    // 记录拍照行为
    app.trackUserBehavior('take_photo')
    
    ctx.takePhoto({
      quality: 'high',
      success: (res) => {
        console.log('拍照成功', res)
        
        this.setData({
          imagePath: res.tempImagePath,
          showPreview: true
        })
        
        // 停止提示轮播
        if (this.tipsTimer) {
          clearInterval(this.tipsTimer)
        }
      },
      fail: (err) => {
        console.error('拍照失败', err)
        app.showError('拍照失败，请重试')
      }
    })
  },

  /**
   * 重新拍照
   */
  retakePhoto() {
    this.setData({
      showPreview: false,
      imagePath: ''
    })
    
    // 重新开始提示轮播
    this.startTipsRotation()
    
    // 记录重拍行为
    app.trackUserBehavior('retake_photo')
  },

  /**
   * 确认使用照片
   */
  confirmPhoto() {
    if (!this.data.imagePath) {
      app.showError('请先拍摄照片')
      return
    }
    
    this.setData({
      isProcessing: true,
      processingText: '正在识别题目...'
    })
    
    // 记录确认照片行为
    app.trackUserBehavior('confirm_photo')
    
    // 开始OCR识别
    this.performOCR()
  },

  /**
   * 执行OCR识别
   */
  performOCR() {
    // 将图片转换为base64
    wx.getFileSystemManager().readFile({
      filePath: this.data.imagePath,
      encoding: 'base64',
      success: (res) => {
        console.log('图片转base64成功')
        
        // 调用云函数进行OCR识别（使用微信OCR）
        wx.cloud.callFunction({
          name: 'analyzeQuestion', // 云函数名称保持不变
          data: {
            imageBase64: res.data,
            userId: app.globalData.userId,
            sessionId: this.generateSessionId(), // 添加sessionId
            timestamp: new Date().toISOString()
          },
          success: (result) => {
            console.log('微信OCR识别成功', result)
            
            if (result.result && result.result.success) {
              const sessionData = result.result.data
              
              // 记录成功识别（更新统计信息）
              app.trackUserBehavior('wechat_ocr_success', {
                textLength: sessionData.questionText.length,
                sessionId: sessionData.sessionId,
                ocrType: 'wechat'
              })
              
              // 跳转到学习页面
              wx.redirectTo({
                url: `/pages/learning/learning?sessionId=${sessionData.sessionId}`
              })
            } else {
              this.handleOCRError(result.result?.error || '识别失败')
            }
          },
          fail: (err) => {
            console.error('微信OCR识别失败', err)
            this.handleOCRError('网络错误，请检查网络连接')
          }
        })
      },
      fail: (err) => {
        console.error('读取图片失败', err)
        this.handleOCRError('图片处理失败')
      }
    })
  },

  /**
   * 生成会话ID
   * @returns {string} 唯一的会话ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  },

  /**
   * 分析题目
   * @param {string} questionText - 识别出的题目文本
   */
  analyzeQuestion(questionText) {
    wx.cloud.callFunction({
      name: 'analyzeQuestion',
      data: {
        questionText: questionText,
        userId: app.globalData.userId,
        imagePath: this.data.imagePath,
        timestamp: new Date().toISOString()
      },
      success: (result) => {
        console.log('题目分析成功', result)
        
        if (result.result && result.result.success) {
          const sessionData = result.result.data
          
          // 保存会话数据到本地
          wx.setStorageSync('currentSession', sessionData)
          
          // 记录成功识别
          app.trackUserBehavior('ocr_success', {
            questionLength: questionText.length,
            sessionId: sessionData.sessionId
          })
          
          // 跳转到学习页面
          wx.redirectTo({
            url: `/pages/learning/learning?sessionId=${sessionData.sessionId}`
          })
        } else {
          this.handleOCRError(result.result?.error || '题目分析失败')
        }
      },
      fail: (err) => {
        console.error('题目分析失败', err)
        this.handleOCRError('分析失败，请重试')
      }
    })
  },

  /**
   * 处理OCR错误
   * @param {string} errorMsg - 错误信息
   */
  handleOCRError(errorMsg) {
    this.setData({
      isProcessing: false
    })
    
    // 记录错误
    app.trackUserBehavior('ocr_error', {
      error: errorMsg
    })
    
    wx.showModal({
      title: '识别失败',
      content: errorMsg + '\n\n建议：\n1. 确保题目清晰完整\n2. 避免反光和模糊\n3. 检查网络连接',
      confirmText: '重新拍照',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          this.retakePhoto()
        } else {
          wx.navigateBack()
        }
      }
    })
  },

  /**
   * 切换摄像头
   */
  switchCamera() {
    const newPosition = this.data.cameraPosition === 'back' ? 'front' : 'back'
    this.setData({
      cameraPosition: newPosition
    })
    
    app.trackUserBehavior('switch_camera', {
      position: newPosition
    })
  },

  /**
   * 切换闪光灯
   */
  toggleFlash() {
    const flashModes = ['off', 'on', 'auto']
    const currentIndex = flashModes.indexOf(this.data.flash)
    const nextIndex = (currentIndex + 1) % flashModes.length
    const newFlash = flashModes[nextIndex]
    
    this.setData({
      flash: newFlash
    })
    
    app.trackUserBehavior('toggle_flash', {
      mode: newFlash
    })
  },

  /**
   * 从相册选择图片
   */
  chooseFromAlbum() {
    wx.chooseImage({
      count: 1,
      sizeType: ['original'],
      sourceType: ['album'],
      success: (res) => {
        console.log('选择图片成功', res)
        
        this.setData({
          imagePath: res.tempFilePaths[0],
          showPreview: true
        })
        
        // 停止提示轮播
        if (this.tipsTimer) {
          clearInterval(this.tipsTimer)
        }
        
        app.trackUserBehavior('choose_from_album')
      },
      fail: (err) => {
        console.error('选择图片失败', err)
        if (err.errMsg !== 'chooseImage:fail cancel') {
          app.showError('选择图片失败')
        }
      }
    })
  },

  /**
   * 返回上一页
   */
  goBack() {
    wx.navigateBack()
  },

  /**
   * 摄像头错误处理
   */
  onCameraError(e) {
    console.error('摄像头错误', e)
    
    app.trackUserBehavior('camera_error', {
      error: e.detail
    })
    
    wx.showModal({
      title: '摄像头错误',
      content: '摄像头启动失败，请检查权限设置或重启应用',
      confirmText: '去设置',
      cancelText: '返回',
      success: (res) => {
        if (res.confirm) {
          wx.openSetting()
        } else {
          wx.navigateBack()
        }
      }
    })
  }
})