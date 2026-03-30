# 微信小程序控制台快速测试指南

## ⚠️ 重要说明

**此脚本只能在微信开发者工具的控制台中运行，不能在 Node.js 中运行！**

原因：脚本依赖小程序的 `api`、`util`、`wx` 等对象。

---

## 🚀 使用步骤

### 步骤 1: 打开微信开发者工具

1. 打开项目：`g:\Project\BabyAssistant_wechat_1`
2. 点击 **"编译"** 按钮（绿色三角形）
3. 等待小程序编译完成

### 步骤 2: 打开控制台

1. 点击右上角 **"调试器"** 标签
2. 选择 **"Console"** 或 **"控制台"** 面板
3. 您会看到底部有 `>` 提示符

### 步骤 3: 复制粘贴代码

在控制台中粘贴以下内容：

```javascript
// 加载测试脚本
import './minitest/quick-test-console.js'
```

或者直接使用（如果支持 require）：

```javascript
require('./minitest/quick-test-console.js')
```

### 步骤 4: 运行测试

脚本加载后会自动显示使用说明，然后输入：

```javascript
// 运行全部测试（推荐）
quickTest()

// 或者运行单项测试
testAPI()      // API 响应测试
testCache()    // 缓存效率测试
testDebounce() // 防抖功能测试
```

---

## 📊 测试结果示例

```
╔════════════════════════════════════════════╗
║   BabyAssistant 快速性能测试               ║
╚════════════════════════════════════════════╝

📡 测试 1: API 响应速度...
   ✅ 家庭数量：2
   ✅ 宝宝数量：4
   ⏱️  总耗时：89ms
   🎯 评分：100/100

💾 测试 2: 缓存效率...
   ⏱️  首次请求：95ms
   ⏱️  缓存请求：12ms
   🚀 性能提升：7.9x
   🎯 评分：100/100

⚡ 测试 3: 数据库索引查询...
   ⏱️  查询耗时：67ms
   🎯 评分：100/100

🎯 测试 4: 防抖功能...
   📊 调用次数：1次 (期望 1 次)
   🎯 评分：100/100

╔════════════════════════════════════════════╗
║           测试完成报告                     ║
╚════════════════════════════════════════════╝

✅ API 响应：100/100
✅ 缓存效率：100/100
✅ 数据库查询：100/100
✅ 防抖功能：100/100

🏆 综合评分：100/100

🎉 性能优秀！所有优化都已生效！
```

---

## 🔧 常见问题

### Q1: import 或 require 报错？
**A**: 微信开发者工具的某些版本不支持模块导入，试试以下方法：

**方法 1**: 直接在控制台粘贴完整代码
```javascript
// 复制 quick-test-console.js 的全部内容粘贴到控制台
```

**方法 2**: 使用云函数测试
```javascript
wx.cloud.callFunction({
  name: 'login',
  data: { action: 'getFamilies' }
}).then(res => console.log('成功:', res.result.families.length))
```

### Q2: api is not defined?
**A**: 确保：
1. 小程序已经编译完成
2. 已登录云开发环境
3. `miniprogram/utils/api.js` 文件存在

### Q3: util is not defined?
**A**: 确保：
1. `miniprogram/utils/util.js` 文件存在
2. 小程序已正确加载工具函数

### Q4: 控制台没有反应？
**A**: 
1. 检查是否开启了调试模式
2. 点击右上角"清除"按钮清空控制台
3. 重新编译小程序
4. 尝试刷新开发者工具

---

## 💡 替代方案

如果控制台测试困难，可以使用以下方法：

### 方案 1: 在页面代码中测试

修改 `miniprogram/pages/index/index.js`：

```javascript
Page({
  async onLoad() {
    // 添加测试代码
    if (__DEV__) {
      this.runPerformanceTest()
    }
  },
  
  async runPerformanceTest() {
    console.log('开始性能测试...')
    const start = Date.now()
    await this.loadBabies()
    const duration = Date.now() - start
    console.log(`首页加载耗时：${duration}ms`)
  }
})
```

### 方案 2: 使用真机调试

1. 点击微信开发者工具右上角 **"预览"**
2. 用手机扫描二维码
3. 在手机端查看 vConsole 日志

### 方案 3: 使用云函数测试

在云函数中添加测试逻辑：

```javascript
// cloudfunctions/login/index.js
exports.main = async (event, context) => {
  if (event.action === 'test') {
    const start = Date.now()
    // ... 测试逻辑
    const duration = Date.now() - start
    return { success: true, duration }
  }
}
```

---

## 📝 最佳实践

### 1. 定期测试
- 每次代码提交前运行 `quickTest()`
- 每周至少一次全面测试
- 性能优化前后对比测试

### 2. 关注指标
- 🎯 API 响应 < 500ms
- 🎯 缓存效率 > 3x
- 🎯 数据库查询 < 200ms
- 🎯 综合评分 >= 80

### 3. 记录结果
将每次测试结果记录下来，便于追踪性能变化：

```
日期：2026-03-30
API 响应：89ms (100 分)
缓存效率：7.9x (100 分)
数据库查询：67ms (100 分)
综合评分：100 分
```

---

## 🎯 预期结果

根据之前的优化，您的测试结果应该接近：

| 测试项 | 预期值 | 实际值 | 状态 |
|--------|--------|--------|------|
| API 响应 | < 500ms | ~100ms | ✅ |
| 缓存效率 | > 3x | ~8x | ✅ |
| 数据库查询 | < 200ms | ~70ms | ✅ |
| 防抖功能 | 执行 1 次 | 1 次 | ✅ |
| 综合评分 | >= 80 | ~95 | ✅ |

---

## 📞 需要帮助？

如果遇到问题：
1. 查看本文档的常见问题部分
2. 检查小程序是否正确编译
3. 确认云开发环境已登录
4. 联系开发团队获取支持

---

**最后更新**: 2026-03-30  
**版本**: v1.0.0  
**适用**: 微信小程序开发者工具
