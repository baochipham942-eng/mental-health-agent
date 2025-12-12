# 项目架构文档

## 一、项目结构

```
心理疗愈agent/
├── app/                          # Next.js App Router
│   ├── api/                      # API路由
│   │   └── chat/
│   │       └── route.ts          # 对话API处理
│   ├── layout.tsx                # 根布局
│   ├── page.tsx                  # 首页（聊天界面）
│   └── globals.css               # 全局样式
│
├── components/                   # React组件
│   └── chat/
│       ├── ChatContainer.tsx    # 聊天主容器
│       ├── MessageList.tsx       # 消息列表
│       ├── MessageBubble.tsx     # 消息气泡
│       ├── ChatInput.tsx         # 输入框
│       └── EmotionIndicator.tsx  # 情绪指示器
│
├── lib/                          # 核心库
│   ├── ai/
│   │   ├── deepseek.ts          # DeepSeek API封装
│   │   ├── prompts.ts            # 提示词模板
│   │   └── emotion.ts            # 情绪识别
│   ├── utils/
│   │   ├── cn.ts                 # className工具
│   │   └── format.ts              # 格式化工具
│   └── constants.ts              # 常量定义
│
├── hooks/                        # 自定义Hooks
│   └── useChat.ts                # 聊天逻辑Hook
│
├── types/                        # TypeScript类型
│   ├── chat.ts                   # 聊天相关类型
│   └── emotion.ts                # 情绪相关类型
│
└── public/                       # 静态资源
```

## 二、核心模块说明

### 1. API路由 (`app/api/chat/route.ts`)

**功能**：处理对话请求

**流程**：
1. 接收用户消息和历史记录
2. 并行执行情绪分析和对话生成
3. 返回AI回复和情绪分析结果

**接口**：
- 请求：`POST /api/chat`
- 请求体：`{ message: string, history?: Array<{role, content}> }`
- 响应：`{ reply: string, emotion?: {label, score}, timestamp: string }`

### 2. DeepSeek集成 (`lib/ai/deepseek.ts`)

**核心函数**：
- `chatCompletion()`: 调用DeepSeek API
- `generateCounselingReply()`: 生成心理咨询回复
- `analyzeEmotion()`: 分析用户情绪

**特点**：
- 使用系统提示词定义AI角色（心理咨询师）
- 支持对话历史上下文
- 情绪分析有后备方案（关键词匹配）

### 3. 提示词工程 (`lib/ai/prompts.ts`)

**提示词类型**：
- `SYSTEM_PROMPT`: 定义心理咨询师角色和行为准则
- `CBT_PROMPT`: CBT干预专用提示词
- `EMOTION_ANALYSIS_PROMPT`: 情绪分析提示词

### 4. 聊天Hook (`hooks/useChat.ts`)

**功能**：
- 管理消息状态
- 处理发送消息逻辑
- 本地存储对话历史
- 错误处理

**状态**：
- `messages`: 消息列表
- `isLoading`: 加载状态
- `error`: 错误信息

### 5. UI组件

**ChatContainer**: 主容器组件
- 管理整体布局
- 处理清空历史功能

**MessageList**: 消息列表
- 显示所有消息
- 自动滚动到底部
- 加载动画

**MessageBubble**: 消息气泡
- 区分用户和AI消息样式
- 显示情绪指示器
- 显示时间戳

**ChatInput**: 输入框
- 支持多行输入
- Enter发送，Shift+Enter换行
- 禁用状态处理

**EmotionIndicator**: 情绪指示器
- 显示情绪标签和颜色
- 显示情绪强度进度条

## 三、数据流

```
用户输入
  ↓
ChatInput组件
  ↓
useChat Hook (sendMessage)
  ↓
POST /api/chat
  ↓
API Route处理
  ├─→ analyzeEmotion() (并行)
  └─→ generateCounselingReply() (并行)
  ↓
DeepSeek API调用
  ↓
返回结果
  ↓
更新messages状态
  ↓
保存到localStorage
  ↓
UI更新
```

## 四、技术决策

### 为什么选择Next.js？
- Vercel原生支持，部署简单
- App Router提供现代化开发体验
- API Routes内置，无需单独后端
- 性能优化（SSR/SSG）

### 为什么选择DeepSeek？
- 中文理解能力强
- API价格合理
- 易于集成
- 响应速度快

### 为什么使用localStorage？
- MVP阶段简化架构
- 无需数据库服务
- 保护用户隐私
- 零成本

### 为什么不用用户认证？
- MVP阶段快速上线
- 降低使用门槛
- 保护隐私（无需注册）

## 五、部署架构

```
Vercel Platform
  ├─→ Next.js App (SSR)
  ├─→ API Routes (Serverless Functions)
  └─→ Static Assets (CDN)
        ↓
DeepSeek API (外部服务)
        ↓
localStorage (客户端存储)
```

## 六、环境变量

```bash
DEEPSEEK_API_KEY      # DeepSeek API密钥（必需）
DEEPSEEK_API_URL      # DeepSeek API地址（可选，有默认值）
```

## 七、扩展方向

### 短期
1. 添加流式响应（Streaming）
2. 优化情绪识别准确度
3. 添加更多CBT技术
4. 改进UI/UX

### 中期
1. 接入数据库（Supabase）
2. 添加用户认证（可选）
3. 情绪趋势分析
4. 危机检测功能

### 长期
1. 多模态输入（语音、图片）
2. 个性化推荐
3. 心理测评工具
4. 专业咨询师转介



