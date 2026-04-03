# 宝宝助手 - 微信小程序

一款专为家庭设计的宝宝成长记录工具，支持多成员协作，帮助您轻松追踪宝宝的成长数据。

## 功能特性

### 核心功能
- **家庭管理**：创建家庭、加入家庭、退出家庭、修改家庭名称
- **宝宝信息管理**：添加、查看、修改、删除宝宝信息（每个家庭最多 3 个宝宝）
- **成长记录追踪**：记录宝宝的身高、体重等数据
- **成长曲线分析**：通过图表直观展示宝宝的成长趋势，区分性别使用国家卫健委标准
- **心情日历**：按宝宝记录每日心情与备忘，支持日历浏览、收藏与语音输入（微信同声传译插件 WechatSI）
- **多成员协作**：支持邀请家庭成员，分配不同权限角色
- **多家庭支持**：用户可以加入多个家庭，在不同家庭中拥有不同身份
- **用户信息管理**：统一管理头像和用户名，同步更新到所有家庭
- **微信一键登录**：使用微信账号快速登录
- **云端数据存储**：数据安全存储在腾讯云开发（CloudBase）

### 权限系统
- **一级助教**：最高权限，可添加/删除宝宝、管理成员权限、邀请成员
- **二级助教**：可添加成长记录，无法添加/删除宝宝或调整权限
- **围观吃瓜**：只能查看宝宝数据，无法进行其他操作

### 技术特点
- **微信原生开发**：小程序原生框架，Tab 使用自定义 `custom-tab-bar`
- **腾讯云开发**：云函数 + 云数据库，无需自建服务器
- **按需注入**：`lazyCodeLoading: requiredComponents`，减小首包与启动成本
- **数据安全**：用户数据隔离，云端权限校验
- **响应式设计**：适配常见手机屏幕
- **性能与体验**：并行请求、短时缓存、防抖节流、图表按需初始化与增量刷新（ECharts / `ec-canvas`）
- **色彩与动效**：统一温馨背景色，宝宝卡片渐变与 header 装饰

## 技术栈

- **前端**：微信小程序（WXML / WXSS / JavaScript）
- **后端**：腾讯云开发云函数
- **数据库**：云开发文档型数据库（NoSQL）
- **图表**：ECharts 小程序版（`ec-canvas`）
- **扩展**：微信同声传译插件（`WechatSI`，需在小程序后台配置）

## 快速开始

### 环境要求
- [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)（建议稳定版）
- 已开通的腾讯云开发环境
- Node.js（云函数目录安装依赖、本地调试时使用）

### 部署步骤

1. **克隆仓库**
   ```bash
   git clone https://github.com/zhangxin19911211-creator/Project_BabyAssistant.git
   cd Project_BabyAssistant
   ```
   若本地目录名不同，在开发者工具中打开对应根目录即可（需包含 `miniprogram/` 与 `project.config.json`）。

2. **配置云开发环境**
   - 用微信开发者工具打开项目根目录
   - 开通或选择云开发环境，将**环境 ID** 填入 `miniprogram/app.js` 中 `App.globalData.env`

3. **配置小程序后台**
   - 在 [微信公众平台](https://mp.weixin.qq.com/) 为小程序添加 **微信同声传译** 插件，并与 `miniprogram/app.json` 中 `plugins.WechatSI` 的 `provider` 一致

4. **部署云函数**（在开发者工具中「上传并部署：云端安装依赖」）
   - `cloudfunctions/login`：登录、家庭/宝宝/记录、心情、反馈等业务入口
   - `cloudfunctions/sendFeedbackEmail`：反馈邮件（SMTP，需配置环境变量，详见 `wiki`）

5. **数据库集合**（在云开发控制台创建，名称需与代码一致）
   - `babies`、`records`、`users`、`families`、`inviteCodes`
   - `moods`、`userFavorites`、`activityLogs`（心情与动态相关）
   - `feedback`（用户反馈）

6. **运行**
   - 开发者工具中点击「编译」；真机调试需使用已配置 AppID 的合法测试号/体验版

### 文档

- 仓库内详细说明：[wiki/](wiki/)（与代码同步的 Markdown）
- 在线浏览：[GitHub Wiki](https://github.com/zhangxin19911211-creator/Project_BabyAssistant/wiki)

## 项目结构

```
Project_BabyAssistant/        # 或你本地的克隆目录名
├── cloudfunctions/
│   ├── login/                # 主业务云函数
│   └── sendFeedbackEmail/    # 反馈邮件云函数
├── miniprogram/
│   ├── components/
│   │   └── ec-canvas/        # ECharts 图表组件
│   ├── custom-tab-bar/       # 自定义底部导航（宝宝 / 心情 / 家庭）
│   ├── images/
│   ├── pages/
│   │   ├── index/            # 首页（宝宝列表）
│   │   ├── mood/             # 心情日历
│   │   ├── baby-add/
│   │   ├── baby-detail/
│   │   ├── record-add/
│   │   └── family/           # 家庭与成员
│   ├── utils/
│   │   ├── api.js
│   │   ├── safeLog.js
│   │   └── util.js
│   ├── app.js
│   ├── app.json
│   └── app.wxss
├── wiki/                     # 项目文档（可同步到 GitHub Wiki）
├── project.config.json
└── README.md
```

## 使用说明（摘要）

### 家庭与用户
- **创建 / 加入家庭**：首次可创建家庭；他人可通过邀请码加入
- **邀请与权限**：一级助教可邀请成员、调整角色；邀请码有时效与使用规则
- **头像与昵称**：在家庭页 header 修改，可同步到多家庭身份展示

### 宝宝与记录
- **添加宝宝**：首页选择家庭并填写信息，可选头像
- **成长记录**：在宝宝详情页添加身高、体重等，查看曲线与标准线对比
- **心情**：在「心情」Tab 选择宝宝，按日记录心情与备忘，支持语音输入（需插件）

### 反馈
- 在家庭页等入口提交反馈；内容由 `login` 云函数校验与落库，并可由 `sendFeedbackEmail` 发邮件（需控制台配置 SMTP 相关环境变量）

## 数据安全

- **隔离与鉴权**：按家庭与角色校验，敏感操作在云函数侧完成
- **事务与一致性**：关键删除等使用事务或顺序清理，减少脏数据
- **登录**：微信官方 `wx.login` + 云函数换用户信息
- **邀请码**：短时有效，使用后按业务规则失效或删除

## 版本更新

**当前版本：v3.0.0**

### v3.0.0
- **心情日历**：新 Tab 与日历视图，心情评分、备注与收藏；集合 `moods`、`userFavorites`、`activityLogs` 等
- **自定义 TabBar**：宝宝 / 心情 / 家庭，选中动效与图标状态
- **微信同声传译（WechatSI）**：心情备注语音输入（需小程序后台配置插件）
- **安全与反馈**：反馈收口 `login` 云函数（`submitFeedback`、限流、写 `feedback`）；可选 `sendFeedbackEmail`；图片上传大小限制；`safeLog` 生产日志
- **性能**：心情页并行拉取、缓存策略优化；成长记录分页；`ec-canvas` 按需与最小刷新；`lazyCodeLoading` 按需注入组件
- **体验与 UI**：心情与品牌色统一、家庭页等细节优化；批量关注限并发
- **文档**：仓库 `wiki/` 与 [GitHub Wiki](https://github.com/zhangxin19911211-creator/Project_BabyAssistant/wiki) 对齐

### v2.2.0
- 宝宝卡片 UI 与字体优化
- 性能与数据库索引优化；冗余代码清理

### v2.1.0
- 家庭页 header 与多家庭身份展示
- 统一用户信息修改入口
- 用户反馈能力

### v2.0.0
- 家庭管理、多成员协作、权限体系
- 成长曲线按性别与国标数据展示
- 邀请码与用户名同步

### v1.0.0
- 宝宝信息、成长记录、成长曲线、微信登录与云开发基础能力

## 贡献

欢迎通过 Issue / Pull Request 反馈问题或提交改进。

## 许可证

MIT License

## 联系我们

如有问题或建议，欢迎联系维护者。

---

**让我们一起记录宝宝的每一步成长！**
