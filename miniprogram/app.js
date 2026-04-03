// app.js
const safeLog = require('./utils/safeLog.js')

App({
  globalData: {
    userInfo: null,
    env: "testenv-7ghpvleu16cc3c93"
  },

  onLaunch: function () {
    if (!wx.cloud) {
      console.error("请使用 2.2.3 或以上的基础库以使用云能力");
    } else {
      wx.cloud.init({
        env: this.globalData.env,
        traceUser: true,
      });
    }

    // 检查登录状态
    this.checkLoginStatus();
  },

  // 检查登录状态
  checkLoginStatus: function() {
    // 直接执行登录，不需要用户授权
    this.login();
  },

  // 微信登录
  login: function() {
    wx.login({
      success: (res) => {
        if (res.code) {
          // 调用云函数获取用户信息
          wx.cloud.callFunction({
            name: 'login',
            data: {
              code: res.code
            },
            success: (cfRes) => {
              const r = cfRes.result
              if (r && r.success && r.userInfo && r.userInfo.openid) {
                this.globalData.userInfo = r.userInfo
                wx.setStorageSync('openid', r.userInfo.openid)
                safeLog.log('登录成功', this.globalData.userInfo)
              } else {
                safeLog.error('登录云函数未返回有效用户信息', r)
              }
            },
            fail: (err) => {
              safeLog.error('登录失败', err)
            }
          });
        } else {
          console.error('获取code失败', res.errMsg);
        }
      }
    });
  },
});
