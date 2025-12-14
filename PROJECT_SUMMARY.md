# 心理疗愈Agent项目总结

## 一、项目概述

**项目名称**：心理疗愈助手（Mental Health Agent）  
**项目类型**：基于认知行为疗法（CBT）的AI心理咨询聊天机器人  
**技术栈**：Next.js 14 + TypeScript + Tailwind CSS + DeepSeek API  
**部署平台**：Vercel  
**开发状态**：MVP阶段已完成

---

## 二、核心能力

### 2.1 智能对话咨询
- **功能描述**：基于DeepSeek模型提供专业的心理咨询对话
- **技术实现**：
  - 使用DeepSeek Chat API (`deepseek-chat`模型)
  - 系统提示词定义AI角色为专业心理咨询师
  - 支持多轮对话，保持上下文连贯性（最近10轮对话）
  - 回复长度控制在200字以内，简洁专业
- **特点**：
  - 使用第二人称"你"，拉近距离
  - 避免专业术语，语言通俗易懂
  - 适时提问，引导用户深入思考

### 2.2 情绪识别分析
- **功能描述**：实时识别用户输入的情绪类型和强度
- **识别的情绪类型**（7种）：
  - 焦虑、抑郁、愤怒、悲伤、恐惧、快乐、平静
- **技术实现**：
  - 主要方法：调用DeepSeek API进行情绪分析（JSON格式返回）
  - 后备方案：关键词匹配（当API解析失败时）
  - 情绪强度评分：0-10分（0=几乎没有，10=非常强烈）
- **显示方式**：
  - 情绪标签（带颜色标识）
  - 情绪强度进度条
  - 显示在用户消息气泡中

### 2.3 CBT干预技术
- **功能描述**：运用认知行为疗法帮助用户调整认知模式
- **核心原则**：
  1. **共情理解**：首先理解并共情用户的感受
  2. **专业引导**：识别和改变不合理的认知模式
  3. **温和鼓励**：用温和、鼓励的语气，避免说教
  4. **结构化思考**：引导用户从情境-认知-情绪-行为（SCEB）角度分析
  5. **实用建议**：提供具体、可操作的建议和练习
- **识别的认知扭曲类型**：
  - 灾难化思维、过度概括、非黑即白思维
  - 情绪化推理、应该思维、标签化、心理过滤
- **干预方法**：
  - 认知重构：帮助用户看到不同视角，挑战不合理信念
  - 行为建议：行为激活、放松训练、暴露练习

### 2.4 对话历史管理
- **功能描述**：本地存储对话历史，无需注册登录
- **技术实现**：
  - 使用浏览器localStorage存储
  - 自动保存每次对话
  - 页面刷新后自动恢复历史记录
  - 支持手动清空对话历史
- **隐私保护**：
  - 数据仅存储在用户本地浏览器
  - 无需服务器数据库
  - 无需用户注册认证

### 2.5 响应式UI设计
- **功能描述**：支持移动端和桌面端访问
- **UI组件**：
  - ChatContainer：主容器，管理整体布局
  - MessageList：消息列表，自动滚动到底部
  - MessageBubble：消息气泡，区分用户和AI消息样式
  - ChatInput：输入框，支持多行输入（Enter发送，Shift+Enter换行）
  - EmotionIndicator：情绪指示器，显示情绪标签和强度
- **设计特点**：
  - 使用Tailwind CSS实现现代化UI
  - 情绪标签使用不同颜色区分（符合WCAG对比度要求）
  - 加载状态和错误提示完善

---

## 三、系统架构

### 3.1 技术架构

```
前端层 (Next.js App Router)
  ├── 页面组件 (app/page.tsx)
  ├── UI组件 (components/chat/)
  └── 自定义Hooks (hooks/useChat.ts)
        ↓
API层 (Next.js API Routes)
  └── /api/chat (app/api/chat/route.ts)
        ↓
业务逻辑层 (lib/)
  ├── AI集成 (lib/ai/)
  │   ├── deepseek.ts - DeepSeek API封装
  │   ├── emotion.ts - 情绪分析入口
  │   └── prompts.ts - 提示词模板
  └── 工具函数 (lib/utils/)
        ↓
外部服务
  └── DeepSeek API (https://api.deepseek.com)
```

### 3.2 数据流

```
用户输入消息
  ↓
ChatInput组件捕获
  ↓
useChat Hook (sendMessage函数)
  ├── 添加用户消息到状态
  ├── 保存到localStorage
  └── 发送POST请求到 /api/chat
        ↓
API Route处理 (app/api/chat/route.ts)
  ├── 验证消息内容
  └── 并行执行两个任务：
        ├── analyzeEmotion() - 情绪分析
        └── generateCounselingReply() - 生成咨询回复
              ↓
DeepSeek API调用
  ├── 情绪分析API调用（temperature: 0.3, max_tokens: 200）
  └── 咨询回复API调用（temperature: 0.8, max_tokens: 500）
        ↓
返回结果
  ├── emotion: { label, score }
  └── reply: string
        ↓
API Route组装响应
  └── 返回 { reply, emotion, timestamp }
        ↓
useChat Hook接收响应
  ├── 添加AI消息到状态
  ├── 保存到localStorage
  └── 更新UI
        ↓
MessageList组件渲染
  └── 显示消息和情绪指示器
```

### 3.3 核心模块详解

#### 3.3.1 API路由 (`app/api/chat/route.ts`)
- **功能**：处理对话请求的HTTP端点
- **请求格式**：
  ```typescript
  {
    message: string;  // 用户消息
    history?: Array<{  // 可选：对话历史（最近10轮）
      role: 'user' | 'assistant';
      content: string;
    }>;
  }
  ```
- **响应格式**：
  ```typescript
  {
    reply: string;  // AI回复
    emotion?: {  // 可选：情绪分析结果
      label: string;  // 情绪类型
      score: number;  // 0-10分
    };
    timestamp: string;  // ISO时间戳
  }
  ```
- **特点**：
  - 并行执行情绪分析和回复生成（使用Promise.all）
  - 完整的错误处理
  - 输入验证

#### 3.3.2 DeepSeek集成 (`lib/ai/deepseek.ts`)
- **核心函数**：
  1. `chatCompletion()`: 通用DeepSeek API调用函数
     - 支持自定义temperature、max_tokens、stream参数
     - 完整的错误处理
  2. `generateCounselingReply()`: 生成心理咨询回复
     - 使用SYSTEM_PROMPT定义AI角色
     - 支持对话历史上下文
     - temperature: 0.8（平衡创造性和准确性）
     - max_tokens: 500（控制回复长度）
  3. `analyzeEmotion()`: 分析用户情绪
     - 使用EMOTION_ANALYSIS_PROMPT
     - 尝试解析JSON格式响应
     - 失败时使用关键词匹配后备方案
     - temperature: 0.3（更确定性）
     - max_tokens: 200

#### 3.3.3 提示词工程 (`lib/ai/prompts.ts`)
- **SYSTEM_PROMPT**：定义心理咨询师角色
  - 工作原则（共情、专业引导、温和鼓励等）
  - 回复要求（简洁、通俗、提问引导等）
- **CBT_PROMPT**：CBT干预专用提示词
  - 认知扭曲类型列表
  - 认知重构方法
  - 行为建议类型
- **EMOTION_ANALYSIS_PROMPT**：情绪分析提示词
  - 7种情绪类型定义
  - 情绪强度评分标准
  - JSON格式返回要求

#### 3.3.4 聊天Hook (`hooks/useChat.ts`)
- **状态管理**：
  - `messages`: Message[] - 消息列表
  - `isLoading`: boolean - 加载状态
  - `error`: string | null - 错误信息
- **核心方法**：
  - `sendMessage()`: 发送消息
    - 构建对话历史（最近10轮）
    - 调用API
    - 更新状态和localStorage
  - `clearHistory()`: 清空对话历史
- **持久化**：
  - 组件挂载时从localStorage加载历史
  - 每次消息更新后保存到localStorage

#### 3.3.5 UI组件架构
- **ChatContainer**：主容器
  - 管理整体布局（头部、消息列表、输入框）
  - 处理清空历史功能
  - 显示错误提示
- **MessageList**：消息列表
  - 渲染所有消息
  - 自动滚动到底部（新消息）
  - 显示加载动画
- **MessageBubble**：消息气泡
  - 区分用户和AI消息样式
  - 显示情绪指示器（仅用户消息）
  - 显示时间戳
- **ChatInput**：输入框
  - 多行文本输入
  - Enter发送，Shift+Enter换行
  - 加载时禁用
- **EmotionIndicator**：情绪指示器
  - 显示情绪标签（带颜色）
  - 显示情绪强度进度条（0-10分）

### 3.4 数据存储

#### 3.4.1 本地存储（localStorage）
- **存储键**：`chat_history`
- **存储内容**：Message[]数组（JSON序列化）
- **Message结构**：
  ```typescript
  {
    id: string;  // 唯一ID
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;  // ISO格式
    emotion?: {  // 仅用户消息可能有
      label: string;
      score: number;
    };
  }
  ```
- **特点**：
  - 仅存储在用户浏览器
  - 页面刷新后自动恢复
  - 支持手动清空

#### 3.4.2 无服务器端存储
- 不使用数据库
- 不使用用户认证系统
- 所有数据在客户端

### 3.5 部署架构

```
Vercel Platform
  ├── Next.js App (SSR/SSG)
  │   ├── 静态页面 (app/page.tsx)
  │   └── API Routes (Serverless Functions)
  │       └── /api/chat (超时限制：Hobby 10s, Pro 60s)
  ├── Static Assets (CDN)
  └── Environment Variables
        ├── DEEPSEEK_API_KEY (必需)
        └── DEEPSEEK_API_URL (可选，有默认值)
              ↓
DeepSeek API (外部服务)
  └── https://api.deepseek.com/v1/chat/completions
              ↓
localStorage (客户端存储)
  └── 浏览器本地存储
```

---

## 四、技术栈详情

### 4.1 前端技术
- **框架**：Next.js 14 (App Router)
  - 使用最新的App Router架构
  - 支持Server Components和Client Components
  - 内置API Routes
- **语言**：TypeScript 5.3.3
  - 完整的类型定义
  - 类型安全
- **UI框架**：Tailwind CSS 3.4.1
  - 实用优先的CSS框架
  - 响应式设计
  - 自定义配置
- **React版本**：18.3.0
  - 使用Hooks（useState, useEffect, useCallback）
  - Client Components（'use client'指令）

### 4.2 AI服务
- **模型**：DeepSeek Chat API
  - 模型名称：`deepseek-chat`
  - API地址：`https://api.deepseek.com/v1/chat/completions`
  - 特点：中文理解能力强，价格合理，响应速度快

### 4.3 工具库
- **clsx**：条件类名工具
- **tailwind-merge**：Tailwind类名合并工具

### 4.4 开发工具
- **TypeScript**：类型检查
- **PostCSS + Autoprefixer**：CSS处理
- **ESLint**：代码检查（Next.js默认配置）

---

## 五、环境配置

### 5.1 必需环境变量
```bash
DEEPSEEK_API_KEY=your_deepseek_api_key_here
```

### 5.2 可选环境变量
```bash
DEEPSEEK_API_URL=https://api.deepseek.com/v1/chat/completions
# 如果不设置，使用默认值
```

### 5.3 配置文件
- `next.config.js`：Next.js配置
- `tailwind.config.ts`：Tailwind CSS配置
- `tsconfig.json`：TypeScript配置
- `postcss.config.js`：PostCSS配置
- `vercel.json`：Vercel部署配置（设置函数超时时间）

---

## 六、项目结构

```
心理疗愈agent/
├── app/                          # Next.js App Router
│   ├── api/
│   │   └── chat/
│   │       └── route.ts          # 对话API端点
│   ├── layout.tsx                # 根布局
│   ├── page.tsx                  # 首页（聊天界面）
│   └── globals.css               # 全局样式
│
├── components/                   # React组件
│   └── chat/
│       ├── ChatContainer.tsx     # 聊天主容器
│       ├── MessageList.tsx       # 消息列表
│       ├── MessageBubble.tsx     # 消息气泡
│       ├── ChatInput.tsx         # 输入框
│       └── EmotionIndicator.tsx  # 情绪指示器
│
├── lib/                          # 核心库
│   ├── ai/
│   │   ├── deepseek.ts          # DeepSeek API封装
│   │   ├── emotion.ts            # 情绪分析入口
│   │   └── prompts.ts            # 提示词模板
│   ├── utils/
│   │   ├── cn.ts                 # className工具函数
│   │   └── format.ts             # 格式化工具（生成ID等）
│   └── constants.ts              # 常量定义（情绪标签、颜色等）
│
├── hooks/                        # 自定义Hooks
│   └── useChat.ts                # 聊天逻辑Hook
│
├── types/                        # TypeScript类型定义
│   ├── chat.ts                   # 聊天相关类型（Message, ChatRequest等）
│   └── emotion.ts                # 情绪相关类型（EmotionLabel, EmotionAnalysis）
│
├── public/                       # 静态资源（如果有）
│
├── package.json                  # 项目依赖和脚本
├── tsconfig.json                 # TypeScript配置
├── tailwind.config.ts            # Tailwind配置
├── next.config.js                # Next.js配置
├── vercel.json                   # Vercel部署配置
└── README.md                     # 项目说明文档
```

---

## 七、核心功能实现细节

### 7.1 对话上下文管理
- **历史记录限制**：仅保留最近10轮对话（20条消息）
- **原因**：控制API调用token数量，保持响应速度
- **实现位置**：`hooks/useChat.ts` 的 `sendMessage` 函数
  ```typescript
  const recentHistory = messages.slice(-10).map(msg => ({
    role: msg.role,
    content: msg.content,
  }));
  ```

### 7.2 情绪分析双重保障
- **主要方法**：DeepSeek API分析（JSON格式返回）
- **后备方案**：关键词匹配
  - 当API解析失败时自动降级
  - 预定义关键词库（7种情绪类型）
  - 默认返回"平静"情绪（score: 5）
- **实现位置**：`lib/ai/deepseek.ts` 的 `analyzeEmotion` 和 `matchEmotionByKeywords` 函数

### 7.3 并行处理优化
- **实现**：使用 `Promise.all` 并行执行情绪分析和回复生成
- **优势**：减少总响应时间（两个API调用同时进行）
- **实现位置**：`app/api/chat/route.ts`
  ```typescript
  const [emotion, reply] = await Promise.all([
    analyzeEmotion(message),
    generateCounselingReply(message, history),
  ]);
  ```

### 7.4 错误处理机制
- **API层**：捕获异常，返回友好的错误信息
- **Hook层**：设置error状态，在UI中显示错误提示
- **DeepSeek层**：API调用失败时使用后备方案（关键词匹配）

---

## 八、已实现功能（MVP）

✅ **基础对话功能**
- 用户输入消息
- AI生成心理咨询回复
- 多轮对话支持

✅ **情绪识别**
- 7种情绪类型识别
- 情绪强度评分（0-10分）
- 情绪可视化显示

✅ **CBT反馈**
- 基于认知行为疗法的专业回复
- 共情理解
- 认知重构引导

✅ **对话历史本地存储**
- 自动保存对话
- 页面刷新后恢复
- 支持清空历史

✅ **响应式UI**
- 移动端和桌面端适配
- 现代化界面设计
- 情绪可视化

---

## 九、待开发功能（后续迭代）

### 短期计划
- [ ] 流式响应（Streaming）：实时显示AI回复生成过程
- [ ] 情绪识别准确度优化：改进提示词和解析逻辑
- [ ] 更多CBT技术：添加更多认知行为疗法技术
- [ ] UI/UX改进：优化交互体验

### 中期计划
- [ ] 数据库集成（Supabase）：支持跨设备同步
- [ ] 用户认证（可选）：支持多用户使用
- [ ] 情绪趋势分析：可视化情绪变化趋势
- [ ] 危机检测功能：识别严重心理危机并引导求助

### 长期计划
- [ ] 多模态输入：支持语音、图片输入
- [ ] 个性化推荐：基于用户历史提供个性化建议
- [ ] 心理测评工具：集成专业心理测评量表
- [ ] 专业咨询师转介：严重情况转介到专业机构

---

## 十、技术决策说明

### 10.1 为什么选择Next.js？
- Vercel原生支持，部署简单
- App Router提供现代化开发体验
- API Routes内置，无需单独后端
- 性能优化（SSR/SSG）

### 10.2 为什么选择DeepSeek？
- 中文理解能力强
- API价格合理
- 易于集成
- 响应速度快

### 10.3 为什么使用localStorage？
- MVP阶段简化架构
- 无需数据库服务
- 保护用户隐私（数据不离开用户设备）
- 零成本

### 10.4 为什么不用用户认证？
- MVP阶段快速上线
- 降低使用门槛
- 保护隐私（无需注册）
- 简化架构

---

## 十一、API调用参数

### 11.1 咨询回复生成
```typescript
{
  model: 'deepseek-chat',
  messages: [
    { role: 'system', content: SYSTEM_PROMPT },
    ...history,
    { role: 'user', content: userMessage }
  ],
  temperature: 0.8,  // 平衡创造性和准确性
  max_tokens: 500,   // 控制回复长度（约200字）
  stream: false
}
```

### 11.2 情绪分析
```typescript
{
  model: 'deepseek-chat',
  messages: [
    { role: 'system', content: EMOTION_ANALYSIS_PROMPT },
    { role: 'user', content: `请分析以下文本的情绪：\n\n${userMessage}` }
  ],
  temperature: 0.3,  // 更确定性，减少随机性
  max_tokens: 200,   // 简短响应
  stream: false
}
```

---

## 十二、注意事项和限制

### 12.1 部署限制
- **Vercel Hobby计划**：Serverless Functions最大超时10秒
- **Vercel Pro计划**：最大超时60秒（已配置）
- **建议**：如果遇到超时，考虑升级到Pro计划或优化API调用

### 12.2 隐私和安全
- 对话历史仅存储在用户浏览器
- 不收集用户个人信息
- 不进行用户认证
- API密钥存储在环境变量中（不暴露给客户端）

### 12.3 使用限制
- 本项目仅供学习和研究使用
- **不能替代专业心理咨询服务**
- 如遇严重心理危机，请及时寻求专业帮助

### 12.4 技术限制
- 对话历史限制为最近10轮（控制token使用）
- 情绪分析依赖API，网络问题可能影响准确性
- 无流式响应，需等待完整回复

---

## 十三、开发命令

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 构建生产版本
npm run build

# 启动生产服务器
npm start

# 代码检查
npm run lint
```

---

## 十四、总结

这是一个**功能完整的MVP版本**的心理疗愈AI助手，核心能力包括：

1. **智能对话咨询**：基于DeepSeek模型的专业心理咨询
2. **情绪识别分析**：7种情绪类型识别和强度评分
3. **CBT干预技术**：认知行为疗法引导
4. **对话历史管理**：本地存储，保护隐私
5. **现代化UI**：响应式设计，情绪可视化

**技术架构**采用Next.js全栈框架，前后端一体化，部署在Vercel平台，使用DeepSeek API提供AI能力，数据存储在客户端localStorage。

**项目特点**：
- 零配置使用（无需注册）
- 隐私保护（数据本地存储）
- 专业性强（基于CBT疗法）
- 易于扩展（模块化架构）

---

*本文档生成时间：2024年*  
*项目版本：0.1.0 (MVP)*

