# 心理疗愈助手

基于认知行为疗法（CBT）的AI心理咨询聊天机器人，使用DeepSeek模型提供专业的心理健康支持。

## 功能特性

- 🤖 **智能对话咨询**：基于DeepSeek模型，提供专业的心理咨询对话
- 😊 **情绪识别分析**：实时识别用户情绪类型和强度
- 🧠 **CBT干预**：运用认知行为疗法，帮助用户调整认知模式
- 💬 **多轮对话**：支持上下文理解，保持对话连贯性
- 📱 **响应式设计**：支持移动端和桌面端
- 🔒 **隐私保护**：对话历史本地存储，无需注册登录

## 技术栈

- **前端框架**：Next.js 14 (App Router)
- **UI样式**：Tailwind CSS
- **AI模型**：DeepSeek API
- **语言**：TypeScript
- **部署**：Vercel

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

创建 `.env.local` 文件：

```bash
DEEPSEEK_API_KEY=your_deepseek_api_key_here
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
```

### 3. 运行开发服务器

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000) 查看应用。

### 4. 构建生产版本

```bash
npm run build
npm start
```

## 部署到Vercel

### 方法一：通过Vercel Dashboard部署（推荐）

1. **准备代码仓库**
   - 将代码推送到 GitHub、GitLab 或 Bitbucket

2. **导入项目到Vercel**
   - 访问 [Vercel Dashboard](https://vercel.com/dashboard)
   - 点击 "Add New..." → "Project"
   - 选择你的代码仓库
   - Vercel 会自动检测 Next.js 项目

3. **配置项目设置**
   - **Framework Preset**: Next.js（自动检测）
   - **Root Directory**: `./`（默认）
   - **Build Command**: `npm run build`（默认）
   - **Output Directory**: `.next`（默认）
   - **Install Command**: `npm install`（默认）

4. **配置环境变量**
   在 "Environment Variables" 中添加：
   ```
   DEEPSEEK_API_KEY=your_deepseek_api_key_here
   DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
   ```
   > 注意：`DEEPSEEK_API_URL` 是可选的，如果不设置会使用默认值

5. **部署**
   - 点击 "Deploy" 按钮
   - 等待构建完成（通常需要 1-3 分钟）
   - 部署成功后，Vercel 会提供一个 URL（如：`your-project.vercel.app`）

### 方法二：通过Vercel CLI部署

1. **安装Vercel CLI**
   ```bash
   npm i -g vercel
   ```

2. **登录Vercel**
   ```bash
   vercel login
   ```

3. **部署项目**
   ```bash
   vercel
   ```
   首次部署会提示配置：
   - 是否链接到现有项目？选择 `N`（新建项目）
   - 项目名称：输入项目名称
   - 目录：直接回车（使用当前目录）
   - 是否覆盖设置？选择 `N`

4. **配置环境变量**
   ```bash
   vercel env add DEEPSEEK_API_KEY
   vercel env add DEEPSEEK_API_URL
   ```

5. **生产环境部署**
   ```bash
   vercel --prod
   ```

### 重要提示

⚠️ **API超时限制**：
- Vercel Hobby（免费）计划：Serverless Functions 最大超时时间为 **10秒**
- Vercel Pro 计划：最大超时时间为 **60秒**（已配置）

如果遇到超时问题：
1. 升级到 Vercel Pro 计划
2. 或者优化 API 调用，减少响应时间

📝 **环境变量配置**：
- 确保在 Vercel Dashboard 中为所有环境（Production、Preview、Development）都配置了环境变量
- 环境变量名称必须与代码中的 `process.env.XXX` 完全一致

🔍 **调试部署问题**：
- 查看 Vercel Dashboard 中的 "Deployments" → "Functions" 日志
- 检查构建日志中的错误信息

## 项目结构

```
心理疗愈agent/
├── app/                    # Next.js App Router
│   ├── api/               # API路由
│   │   └── chat/          # 对话API
│   ├── layout.tsx         # 根布局
│   ├── page.tsx           # 首页
│   └── globals.css        # 全局样式
├── components/            # React组件
│   └── chat/             # 聊天相关组件
├── lib/                  # 核心库
│   ├── ai/              # AI相关（DeepSeek集成）
│   └── utils/           # 工具函数
├── hooks/               # 自定义Hooks
├── types/               # TypeScript类型定义
└── public/              # 静态资源
```

## 核心功能说明

### 情绪识别

系统会自动分析用户输入的情绪，识别以下类型：
- 焦虑、抑郁、愤怒、悲伤、恐惧、快乐、平静

并给出0-10分的情绪强度评分。

### CBT干预

AI咨询师会：
1. 共情理解用户的感受
2. 识别认知扭曲模式
3. 引导认知重构
4. 提供行为建议

## 开发计划

### MVP阶段 ✅
- [x] 基础对话功能
- [x] 情绪识别
- [x] CBT反馈
- [x] 对话历史本地存储

### 后续迭代
- [ ] 情绪趋势分析
- [ ] 危机检测与干预
- [ ] 心理测评工具
- [ ] 多模态输入（语音）

## 注意事项

- 本项目仅供学习和研究使用
- 不能替代专业心理咨询服务
- 如遇严重心理危机，请及时寻求专业帮助

## License

MIT



