# 用户体系与数据闭环设计方案

## 1. 系统架构概览 (System Architecture)

为了实现从"单机临时会话"向"云端数据闭环"的转型，我们将采用以下技术栈构建轻量级、高可扩展的用户与数据系统。

### 技术选型
*   **Database**: **Vercel Postgres** (基于 AWS Aurora Serverless 的 PostgreSQL)。
*   **ORM**: **Prisma** (类型安全的数据库客户端，易于维护 Schema)。
*   **Authentication**: **NextAuth.js (v5)**。
    *   *策略*：采用 `Credentials` 模式。实现"极简认证"：系统预设（或管理员生成）账号密码/邀请码，用户直接登录，无需复杂的邮件验证或第三方登录，降低体验门槛。
*   **State Management**: **SWR** 或 **React Query** (用于前端数据与云端同步)。

---

## 2. 数据库设计 (Database Schema)

基于 Prisma Schema Language 的核心数据模型设计。

### 2.1 核心ER图概念
1.  **User**: 系统的核心，关联所有数据。
2.  **Conversation**: 一次完整的对话上下文（Session）。
3.  **Message**: 对话中的每一条消息。
4.  **AssessmentReport**: 评估阶段产生的正式报告（包含结论、风险等级）。
5.  **ActionPlan**: 评估后生成的"下一步清单"及具体卡片。
6.  **ExerciseLog**: 用户执行练习的记录（数据闭环的核心，用于追踪效果）。

### 2.2 详细 Schema 定义

```prisma
// 1. 用户表
model User {
  id            String    @id @default(cuid())
  username      String    @unique // 用户名/账号
  passwordHash  String    // 密码哈希 (Argon2/Bcrypt)
  nickname      String?   // 昵称 (用于对话称呼)
  createdAt     DateTime  @default(now())
  
  // 关联
  conversations Conversation[]
  reports       AssessmentReport[]
  exerciseLogs  ExerciseLog[]
}

// 2. 会话表 (对话历史)
model Conversation {
  id        String   @id @default(cuid())
  userId    String
  title     String?  // 会话标题 (e.g. "关于工作焦虑的咨询")
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  
  // 关联
  user      User     @relation(fields: [userId], references: [id])
  messages  Message[]

  status    String   @default("ACTIVE") // 'ACTIVE' | 'COMPLETED' (已归档/只读)
}

// 3. 消息表
model Message {
  id             String       @id @default(cuid())
  conversationId String
  role           String       // 'user' | 'assistant' | 'system'
  content        String       // 消息文本
  meta           Json?        // 存储额外元数据 (e.g. 情绪标签、耗时、RAG引用)
  createdAt      DateTime     @default(now())

  conversation   Conversation @relation(fields: [conversationId], references: [id])
}

// 4. 评估报告 (Assessment Conclusion)
model AssessmentReport {
  id             String   @id @default(cuid())
  userId         String
  conversationId String
  
  summary        String   // 初筛总结文本
  riskLevel      String   // 'low' | 'medium' | 'high' | 'crisis'
  mainIssue      String?  // 核心主诉 (e.g. "职场焦虑")
  
  createdAt      DateTime @default(now())
  
  user           User     @relation(fields: [userId], references: [id])
  // 一个会话可能产生多份报告(如果多次评估)，或关联最新一份
  actionPlans    ActionPlan[]
}

// 5. 行动计划 (Action Cards 的持久化)
model ActionPlan {
  id        String   @id @default(cuid())
  reportId  String
  
  title     String   // 卡片标题 (e.g. "4-7-8 呼吸法")
  type      String   // 'cbt_cognitive' | 'breathing' | 'mindfulness'
  content   Json     // 完整卡片数据 (steps, when, effort)
  
  // 状态追踪
  isCompleted Boolean  @default(false)
  
  report    AssessmentReport @relation(fields: [reportId], references: [id])
  logs      ExerciseLog[]    // 关联该计划的练习记录
}

// 6. 练习记录 (数据闭环/Telemetry 核心)
// 用于记录用户"真的去做了"以及"效果如何"
model ExerciseLog {
  id           String   @id @default(cuid())
  userId       String
  actionPlanId String?  // 可以关联具体的计划，也可以是自由练习
  
  type         String   // 练习类型
  duration     Int      // 练习时长 (秒)
  
  // 效果反馈 (Pre/Post 对比)
  preMood      Int?     // 练习前心情 (1-10)
  postMood     Int?     // 练习后心情 (1-10)
  feedback     String?  // 用户的主观反馈文本
  
  completedAt  DateTime @default(now())
  
  user         User        @relation(fields: [userId], references: [id])
  actionPlan   ActionPlan? @relation(fields: [actionPlanId], references: [id])
}
```

---

## 3. 核心流程定义 (Core Workflows)

### 3.1 极简认证流程 (Authentication)
*   **目标**：零门槛，保护隐私。
*   **流程**：
    1.  管理员（开发者）直接在数据库生成一批 InvitationCode 记录。邀请码格式支持 6-8 位大写字母或数字（例如 `XLSD2025`）。
    2.  用户访问 Landing Page，输入账号、密码和邀请码。
    3.  系统进行格式校验（前端 maxLength=8，后端 zod 验证 6-8 位）。
    4.  NextAuth 验证 `credentials`，签发 JWT Session。
    4.  Session 包含 `userId`，前端根据此 ID 拉取历史数据。

### 3.2 对话同步与持久化 (Chat Persistence)
*   **现状**：只存 LocalStorage。
*   **新流程**：
    1.  **用户发送消息** -> 乐观更新 UI (Optimistic UI)。
    2.  **后台异步入库** -> 调用 Server Action `saveMessage(userId, content, role='user')` 存入 Postgres。
    3.  **LLM 流式响应** -> 前端接收 Stream。
    4.  **响应完成 (onFinish)** -> 调用 Server Action `saveMessage(userId, fullReply, role='assistant')` 存入 Postgres。
*   **优势**：跨设备同步，刷新不丢失。

### 3.3 评估结果与行动卡片 (Assessment & Action Loop)
*   **生成**：当 `conclusion.ts` 生成 Action Cards 时：
    1.  解析 JSON。
    2.  创建 `AssessmentReport` 记录。
    3.  遍历 Cards，创建 `ActionPlan` 记录。
*   **展示**：Dashboard 页面从数据库拉取最新的 `ActionPlan`。
*   **价值**：用户可以在"我的疗愈主页"随时查看上次医生给出的建议，而不是去翻聊天记录。

### 3.4 练习反馈闭环 (Telemetry / Feedback Loop)
这块是"数据闭环"的灵魂。

*   **场景**：用户点击卡片上的【开始练习】。
*   **步骤**：
    1.  **Pre-Check**：弹出 Mood Slider ("现在心情几分？") -> 暂存状态。
    2.  **During**：通过前端计时器记录时长 (Duration)。
    3.  **Post-Check**：练习结束，弹出 Mood Slider ("现在感觉如何？") + 简单的文本框 ("有什么想记录的吗？")。
    4.  **Submit**：将 `{ duration, preMood, postMood, feedback }` 发送给后端，创建 `ExerciseLog`。
*   **数据洞察**：
    *   计算 **Mood Uplift (心情提升值)** = `postMood - preMood`。
    *   统计 **Compliance (依从性)** = 建议了多少次 vs 完成了多少次。
    *   以此优化后续的 RAG 推荐策略（例如：发现用户做"呼吸法"效果不好，下次推荐"着陆技术"）。

---

### 3.5 多会话管理 (Multi-Session Management)
用户可能针对不同的问题进行多次咨询（例如：第一次咨询"工作焦虑"，一周后咨询"失眠问题"）。系统需要支持多会话隔离与管理。

*   **会话隔离 (Session Isolation)**：
    *   **上下文**：每次点击"新对话"（New Chat）时，创建一个新的 `Conversation` 记录。LLM 仅加载当前 `Conversation` 的 Message 历史。这保证了不同话题互不干扰（避免 LLM 混淆上次的"工作焦虑"与本次的"家庭矛盾"）。
    *   **状态重置**：新会话的 Assessment State 重置为初始状态。

*   **会话生命周期 (Session Lifecycle)**：
        *   **关键结束事件 (Key Termination Events)**：
            1.  **Session Timeout (时长耗尽)**：
                *   *机制*：模拟线下咨询时长（例如 45-50 分钟）。
                *   *逻辑*：会话开启时启动倒计时。倒计时结束时，系统强制结束会话并自动归档（无论是否生成报告）。
                *   *Rationale*：防止用户无限纠缠（防沉迷），同时给予用户足够的时间讨论报告内容，而不是报告一出就强行关闭。
            2.  **User Manual Stop (用户主动结案)**：
                *   *场景*：用户对评估结果满意，或者不想继续了，主动点击“结束本次咨询”。
            3.  **Crisis Handover (危机熔断)**：
                *   *逻辑*：检测到自杀/自伤风险，强制中断并引导至人工干预。
            4.  **Navigation Interception (导航拦截)**：
                *   *场景*：用户正在“咨询中”时点击侧边栏其他会话或“新咨询”。
                *   *逻辑*：弹出二次确认弹窗 —— “离开当前页面将结束本次咨询并保存记录。确定继续吗？”。
                *   *意义*：强化咨询的仪式感，防止因误触导致的会话状态混乱，并强制执行归档逻辑。
            *注意*：**生成评估报告 (Report Generation)** 不再作为会话结束的触发点。用户可以在剩余时间内针对报告内容继续提问，直到时间耗尽。

*   **数据聚合 (Data Aggregation)**：
    *   虽然对话是隔离且终结的，但**Action Plan (工具箱)** 是属于用户的。
    *   用户的"疗愈主页"应聚合展示来自**所有历史会话**生成的有效 Action Cards。这形成了一个不断积累的"个人应对工具库"。

*   **交互设计 (UI)**：
    *   **Sidebar**：左侧边栏列出历史会话列表（按时间倒序），支持点击切换。
    *   **Title Generation**：在会话产生3-5轮后，让 LLM 自动生成一个简短标题（例如 "关于失眠的咨询"），便于用户查找。

---

## 4. 开发优先级规划 (Implementation Roadmap)

1.  **Phase 1: 基础设施 (P0)**
    *   配置 Vercel Postgres。
    *   初始化 Prisma Schema。
    *   集成 NextAuth 实现基础登录。

2.  **Phase 2: 数据上云 (P0)**
    *   改造 `useChat` Hook，对接 Server Actions。
    *   实现消息历史的云端存储与加载。

3.  **Phase 3: 闭环功能 (P1)**
    *   改造 Action Card 组件，增加【开始练习】的交互流程。
    *   实现 Pre/Post 心情打分 UI。
    *   实现 `ExerciseLog` 入库。

4.  **Phase 4: 洞察面板 (P2)**
    *   在首页增加"历史趋势图"（心情变化曲线、练习频率）。

---

## 5. 技术规格说明 (Technical Specifications)

### 5.1 目录结构规划 (Directory Structure)
```
/lib
  /actions        // Server Actions
    chat.ts       // saveMessage, getChats, createSession
    exercise.ts   // logExercise, getProgress
  /db
    prisma.ts     // Prisma Client 单例
/app
  /api/auth/[...nextauth]/route.ts  // NextAuth Handler
  /dashboard
    layout.tsx    // 侧边栏 (Session List)
    page.tsx      // 仪表盘 (Stats + Cards)
    /[sessionId]/page.tsx // 具体的 Chat Interface
  /login
    page.tsx      // 登录页
```

### 5.2 环境变量 (Environment Variables)
```env
# Database (Auto-configured by Vercel Integration)
POSTGRES_PRISMA_URL=...
POSTGRES_URL_NON_POOLING=...

# Auth (NextAuth v5)
AUTH_SECRET="generated_secret_string"
AUTH_URL="http://localhost:3000"

# LLM
DEEPSEEK_API_KEY=...
```

### 5.3 核心 Server Actions 定义
```typescript
// lib/actions/chat.ts
async function createNewSession(userId: string): Promise<string> // returns sessionId
async function saveMessage(sessionId: string, role: string, content: string): Promise<void>
async function getSessionHistory(sessionId: string): Promise<Message[]>
async function closeSession(sessionId: string): Promise<void> // Mark as COMPLETED

// lib/actions/exercise.ts
async function logExercise(
  userId: string, 
  planId: string, 
  data: { duration: number, preMood: number, postMood: number, feedback: string }
): Promise<void>
```
