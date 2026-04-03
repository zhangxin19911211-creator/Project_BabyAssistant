---
trigger: always_on
---
# BabyAssistant 项目开发规则

## 官方文档参考（优先查阅）

开发微信小程序时，优先查阅以下官方文档：

### 1. 组件文档
**URL**: https://developers.weixin.qq.com/miniprogram/dev/component/

查询内容：
- 视图容器（view、scroll-view、swiper 等）
- 基础内容（text、icon、progress 等）
- 表单组件（button、form、input、textarea 等）
- 导航（navigator）
- 媒体组件（image、video、audio 等）
- 地图、画布等特殊组件

### 2. API 文档
**URL**: https://developers.weixin.qq.com/miniprogram/dev/api/

查询内容：
- 网络（request、downloadFile、uploadFile 等）
- 媒体（图片、录音、音频、视频）
- 存储（storage）
- 位置（getLocation、openLocation 等）
- 设备（系统信息、网络状态、加速度计等）
- 界面（交互反馈、导航栏、动画等）
- 开放接口（登录、授权、用户信息等）

## 开发规范

### 组件使用原则
1. 优先使用微信小程序原生组件
2. 复杂交互可引入自定义组件
3. 注意组件的兼容性（基础库版本要求）

### API 调用原则
1. 异步 API 使用 Promise 或 async/await
2. 注意 API 的权限要求（需在 app.json 中声明）
3. 处理 API 调用失败的情况

### 性能优化
1. 避免频繁调用 setData
2. 图片资源使用合适的尺寸
3. 列表渲染使用 key 属性

## 参考资料优先级

1. **第一优先级**: 微信小程序官方文档（组件、API）
2. **第二优先级**: CloudBase 技能文档（miniprogram-development、auth-wechat 等）
3. **第三优先级**: 项目历史经验和记忆
