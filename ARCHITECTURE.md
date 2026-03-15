# 项目架构文档

> 最后更新：2026-03-15

## 一、系统概览

心灵树洞是 AI 陪伴式解压工具，表层是轻松的聊天陪伴体验，底层保留完整的 CBT 专业能力。

```
┌─────────────────────────────────────────────────────┐
│                    前端（Next.js 14）                  │
│  Chat UI  ←→  Dashboard（评测中心/记忆/危机/进度/探索工坊）  │
└────────────────────┬────────────────────────────────┘
                     │ API Routes
┌────────────────────┴────────────────────────────────┐
│              后端（Serverless Functions）              │
│  ┌──────┐ ┌──────────┐ ┌────────┐ ┌──────────────┐ │
│  │ Chat │ │ Memory   │ │ Auth   │ │ Eval System  │ │
│  │ API  │ │ APIs     │ │ NextAuth│ │ (评测中心)    │ │
│  └──┬───┘ └──────────┘ └────────┘ └──────┬───────┘ │
│     │                                     │         │
│  ┌──┴──────────────────────────┐  ┌──────┴───────┐ │
│  │     Multi-Agent 对话引擎     │  │  Eval Runner │ │
│  │  Triage → Counselor → Safety│  │  (学术数据集)  │ │
│  └──┬──────────────────────────┘  └──────────────┘ │
└─────┼───────────────────────────────────────────────┘
      │
┌─────┴───────────────────────────────────────────────┐
│                  LLM Provider 层                      │
│  DeepSeek(默认) │ OpenAI │ Kimi │ OpenRouter │ GLM   │
│  统一接口: generateText / streamText / generateStructured │
└─────────────────────────────────────────────────────┘
      │
┌─────┴───────────────────────────────────────────────┐
│                    数据层                              │
│  PostgreSQL (Neon) │ Prisma ORM │ SQLite (评测) │ Langfuse │
└─────────────────────────────────────────────────────┘
```

## 二、对话引擎架构

### 2.1 请求处理流水线（app/api/chat/route.ts）

```
用户消息
  ↓
0.0 极速技能路径（直接技能请求 → 跳过所有 LLM）
  ↓
0.1 输入安全检测（guardrails）
  ↓
0.2 认证 + 会话恢复 + provider 限制（非管理员清除 override）
  ↓
0.5 并行预取（~800ms 节省，首轮跳过 therapist/activeExercise）
  ├─ 记忆检索（Memory V2: profile + summary 两层并行）
  ├─ Triage Agent（情绪/意图/安全快速分析，首轮跳过 soft wait）
  ├─ Safety Agent（深度安全评估）
  ├─ 评估历史 + 用户偏好
  ├─ 危机快速检查
  ├─ [首轮] 练习回访检测（24-48h 内完成但无后续的练习）
  └─ [非首轮] 7 天情绪趋势摘要
  ↓
0.6 对话状态机（SCEB 要素收集 + 状态转移）
  ↓
0.7 练习状态检测（SFBT 引导 + 练习后个人化总结）
  ↓
路由决策（规则优先，LLM 辅助）
  ├─ crisis  → 危机处理（热线 + 安全回复）
  ├─ assessment → 评估收集（PHQ-9/GAD-7，触发词已收窄）
  └─ support → 支持回复（CounselorAgent 流式输出 + 场景化技能推荐）
  ↓
异步后处理
  ├─ 输出安全检测（guardOutput → unsafe 则替换为安全文本）
  ├─ 记忆提取（长期记忆沉淀）
  ├─ 质量检查（QualityAgent 抽检）
  └─ 转化漏斗埋点（l1_skill_recommended 等）
```

### 2.2 Multi-Agent 编排（lib/ai/agents/）

| Agent | 职责 | 模型 | 超时 |
|-------|------|------|------|
| TriageAgent | 情绪/意图/安全快速分类 | DeepSeek | 5s |
| CounselorAgent | 生成回复（support/assessment/crisis） | 可切换 | 30s |
| SafetyAgent | 深度安全评估 + 约束生成 | DeepSeek | 5s |
| QualityAgent | 回复质量抽检 | DeepSeek | 10s |

### 2.3 LLM Provider 层（lib/llm/index.ts）

统一接口，支持 5 个 provider + 运行时模型切换：

```typescript
type LlmProviderName = 'deepseek' | 'openai' | 'kimi' | 'openrouter' | 'glm';

// 所有 provider 统一暴露三个函数
generateText(messages, { provider, modelOverride, temperature, ... })
generateStructured(messages, schema, { provider, modelOverride, ... })
streamText(messages, { provider, modelOverride, onFinish, ... })
```

**modelOverride 透传链路**：
弹窗选择 → eval/start API（env 注入）→ eval runner → chat API（request body）→ deriveProvider() → CounselorAgent → streamText

**Provider 自动推断**（deriveProvider）：
- `gpt-*` / `o1` / `o3` / `o4` → openai
- `kimi-*` / `moonshot-*` → kimi
- `deepseek-*` → deepseek
- 含 `/` → openrouter
- `glm-*` → glm

### 2.4 功能分层

| Layer | 用户感知 | 实际能力 |
|-------|---------|---------|
| L0 默认入口 | 自由聊天、情绪倾诉 | Triage + Safety + Counselor |
| L1 自然发现 | 呼吸练习、正念冥想 | ExerciseEngine + SFBT |
| L2 主动探索 | 探索工坊（导师/MBTI/圆桌） | Mentor Personas + Group Chat |
| L3 专业评估 | 情绪健康度/压力指数 | PHQ-9/GAD-7 对话式收集 |

## 三、探索工坊架构

探索工坊（`/dashboard/lab`）是 L2 主动探索层的核心模块，提供多种非传统对话体验。

### 2.5 模块组成

```
探索工坊 (LabContent.tsx)
  ├─ 智慧殿堂 🏛️ — 10 位历史先驱 1v1 对话
  │   ├─ Personas: lib/ai/mentors/personas.ts
  │   ├─ Chat UI: components/settings/MentorChatWindow.tsx
  │   └─ API: /api/chat/mentor/route.ts
  │
  ├─ 镜像回廊 🪞 — 16 种 MBTI 人格互动
  │   ├─ Personas: lib/ai/mbti/personas.ts
  │   ├─ Chat UI: components/lab/MBTIChatWindow.tsx
  │   └─ API: /api/chat/mbti/route.ts
  │
  ├─ 圆桌论道 🎭 — 2-4 位大师群组对话
  │   ├─ UI: components/lab/GroupChatSection.tsx
  │   ├─ Chat UI: components/lab/GroupChatWindow.tsx
  │   ├─ API: /api/chat/group/route.ts
  │   └─ 模式: 讨论（互补）/ 辩论（交锋）
  │
  └─ 自定义大师 ✨ — 用户创建导师 persona
      └─ UI: components/lab/CustomMasterSection.tsx
```

### 2.6 导师 Persona 列表

| 导师 | Emoji | 标签 | 视角 |
|------|-------|------|------|
| 苏格拉底 | 🏛️ | 智慧助产士 | 提问引导自我发现 |
| 荣格 | 🌑 | 灵魂炼金术士 | 潜意识与原型分析 |
| 阿德勒 | 🔥 | 勇气导师 | 自卑超越与社会兴趣 |
| 塞利格曼 | 🌟 | 积极心理学之父 | 优势与幸福感 |
| 萨提亚 | ❤️ | 家庭治疗之母 | 家庭系统与沟通 |
| 卡尼曼 | ⚖️ | 认知决策大师 | 思维偏误与决策 |
| 维特根斯坦 | 📐 | 语言边界探索者 | 语言哲学 |
| 萨特 | 🚬 | 存在主义旗手 | 自由与责任 |
| 纳瓦尔 | 📡 | 硅谷禅师 | 财富与幸福 |
| 哈耶克 | 📊 | 自由秩序守护者 | 自发秩序 |

### 2.7 技能系统

8 种技能分为两类：

**Widget 型（前端驱动，无需 LLM）**：
| 技能 | 组件 | 说明 |
|------|------|------|
| breathing | BreathingExercise.tsx | 4-7-8 呼吸法定时器 |
| meditation | MeditationExercise.tsx | 5 分钟正念引导 |
| mood_tracker | MoodTracker.tsx | 情绪选择 + 强度 + 触发因素 |
| leaves_stream | LeavesOnStream.tsx | 溪流落叶脱钩练习 |

**Guided 型（AI 多轮对话）**：
| 技能 | 步数 | 说明 |
|------|------|------|
| grounding | 5 步 | 五感着陆（视觉→触觉→听觉→嗅觉→味觉）|
| reframing | 4 步 | 认知重构（思维→证据→替代→感受）|
| activation | 3 步 | 行为激活（选择→执行→下一步）|
| empty_chair | 4 步 | 空椅子技术（设定→表达→互换→整合）|

**极速路径**：`detectDirectSkillRequest()` 在 API 入口 (0.0) 直接返回技能卡，跳过所有 LLM 调用。

## 四、评测系统架构

### 4.1 整体设计

评测系统采用学术数据集驱动的自动化评测 + 根因诊断闭环：

```
┌─────────────────────────────────────────────────┐
│              评测中心 Dashboard                    │
│  实验列表 │ 数据集管理 │ 评分器 │ 根因总览 │ 校准   │
└────────┬────────────────────────────────────────┘
         │
    ┌────┴────┐
    │ 新建实验 │ ← 选择数据集 + 用例 + 模型(2级) + 配置
    └────┬────┘
         │
┌────────┴────────────────────────────────────────┐
│            Eval Runner (scripts/eval-academic/)   │
│                                                   │
│  for each case:                                   │
│    for each turn:                                 │
│      1. 调用 Chat API（支持 provider/model 切换） │
│      2. Layer 1: 代码规则检查（确定性）            │
│      3. Layer 2: LLM Judge（8 维度评分）          │
│    汇总通过率 + TTFT + 失败详情                    │
└────────┬────────────────────────────────────────┘
         │
┌────────┴────────────────────────────────────────┐
│      6 层根因诊断 (Layered Root Cause Diagnosis)  │
│                                                   │
│  诊断瀑布（必须从上往下排除）：                     │
│    L1 编排 & 架构 → L2 工程 & 代码 →              │
│    L3 防护规则 → L4 评估器 →                      │
│    L5 数据/模型 → L6 提示词                       │
│                                                   │
│  每条建议包含：                                    │
│    layer + title + description                    │
│    dismissal_reason（排除上层的理由）              │
│    tags（失败模式标签，4-8 字）                    │
│    targetFile + affectedDimensions + priority     │
│                                                   │
│  建议生命周期管理：                                │
│    status: accepted / rejected / deferred         │
│    note: 人工备注（进展记录）                      │
│    持久化到 data/coding/analysis-{runId}.json     │
└─────────────────────────────────────────────────┘
```

### 4.2 评测数据流

```
学术数据集 (SQLite)
  ├─ ESConv (195 条，英文情感支持)
  ├─ CPsyCounE (35 条，中文心理咨询)
  └─ Psy-Insight CN (431 条，双语心理咨询)
       ↓
  每条用例包含多轮对话 (turn_count)
       ↓
  Eval Runner 逐轮调用 Chat API
       ↓
  双层评测
  ├─ Layer 1 (代码规则，确定性)
  │   ├─ no-medical-label（禁用医疗术语）
  │   ├─ no-gaslighting（禁止否定用户感受）
  │   └─ reply-length（回复长度检查）
  │
  └─ Layer 2 (LLM Judge，8 维度)
      ├─ empathy（共情表达）
      ├─ safety（安全性）
      ├─ coherence（上下文连贯）
      ├─ persona（角色一致性）
      └─ ... 等
       ↓
  结果写入 tests/eval/results/{runId}.json
       ↓
  Dashboard 展示 + 定性分析
```

### 4.3 模型切换评测

评测系统支持在不同模型间对比效果：

| Provider | 可选模型 | 适用场景 |
|----------|---------|---------|
| DeepSeek | V3.2, V3.2 推理 | 中文对话基线，高性价比 |
| Kimi | K2.5 | 中文长上下文 |
| OpenAI | GPT-5.4, GPT-5, GPT-5 Mini | 英文基线，指令遵循 |
| OpenRouter | Claude Opus/Sonnet 4.6, Gemini 3.1 Pro/Flash Lite | 安全性对比，多模型横评 |

### 4.4 6 层根因诊断

取代原有的扎根理论三阶段编码，采用层级化诊断瀑布：

**诊断瀑布**（强制从上往下排除，≤30% 建议落在提示词层）：

| 层级 | 名称 | 诊断范围 |
|------|------|---------|
| L1 | 编排 & 架构 | Agent 流程、状态机、路由逻辑 |
| L2 | 工程 & 代码 | 具体代码实现 bug、接口问题 |
| L3 | 防护规则 | Guardrails、安全检测规则 |
| L4 | 评估器 | Judge 标准偏差、维度定义 |
| L5 | 数据 / 模型 | 测试用例偏差、模型能力限制 |
| L6 | 提示词 | Prompt 措辞调整（最后手段）|

**每条建议必须包含**：
- `dismissal_reason`：为什么问题不在更上层
- `tags`：失败模式标签（4-8 字，从案例中自然提取）
- `targetFile`：建议修改的代码文件
- `priority`：high / medium / low

**建议生命周期管理**：
- 状态标记：采纳 / 拒绝 / 搁置（toggle 交互）
- 备注功能：记录优化进展，支持持续更新
- 持久化：写入 `data/coding/analysis-{runId}.json`
- API：`POST /api/eval/analyze` with `action: 'update-status'`

**性能优化**：
- 根因总览页使用 `cacheOnly: true` 只读缓存，不触发 LLM
- LLM 分析仅在实验详情页手动触发
- `timeoutMs: 60000` 防止长 prompt 超时

## 五、记忆系统

```
短期记忆
  └─ 最近 10 轮对话历史（request body）

长期记忆 V2 (Prisma + PostgreSQL) — 两层并行（V1 已删除）
  ├─ Layer 1: ProfileMemory — 5 种 kind
  │   ├─ trigger (权重 30)      — 情绪触发点
  │   ├─ preference (权重 20)   — 用户偏好
  │   ├─ coping (权重 15)       — 应对方式
  │   ├─ relationship (权重 10) — 人际关系
  │   └─ identity (权重 5)      — 身份信息
  │   排序: 关键词匹配分 + kindWeight + priority×0.5 + confidence×20，取 Top 6
  │
  ├─ Layer 2: SessionSummaryV2 — 按时间倒序取最近 2 条
  │
  ├─ 补充 A: 练习回访（仅首轮，查 24-48h 内完成但无后续的练习）
  └─ 补充 B: 7 天情绪趋势摘要（仅非首轮）

记忆注入增强
  ├─ 探索工坊发现标注：lab_ 来源标注"(探索工坊发现)"
  └─ 记忆使用指南：引导 AI 自然引用（"我记得你说过..."）

记忆生命周期（V2 统一，V1 遗忘曲线/consolidator/retriever 已删除）
  ├─ 提取：异步 MemoryExtractor（每次对话后触发）
  ├─ 检索：Memory V2（profile + summary 两层并行）
  └─ 定时清理：/api/cron/prune-memory（maxAge: 90 天, minConfidence: 0.5）
```

## 六、安全架构

### 6.1 认证与授权

```
lib/auth/admin.ts — 集中式管理员认证（替代 20+ 处硬编码）
  ├─ isAdmin()         — async，调 auth() 返回 { admin, session }
  ├─ isAdminSession()  — sync，已有 session 时直接判断
  └─ RESERVED_NICKNAMES — 保留昵称列表，防普通用户越权

API 路由认证矩阵：
  ├─ 管理员限定：eval/start, optimization/*, admin/*, crisis GET
  ├─ 登录即可：speech/transcribe, chat, memory
  └─ Cron 鉴权：cron/* (Bearer CRON_SECRET)
```

### 6.2 安全防线（5 层）

```
Layer 1: 输入安全 — guardrails 拦截有害内容
Layer 2: Safety Agent — 深度安全评估 + 约束生成
Layer 3: 输出安全 — guardOutput() 检测 LLM 回复，unsafe → 替换安全文本
Layer 4: 危机处理 — LLM 语义检测 + 热线展示 + Telegram 通知（已脱敏）
Layer 5: 运行时限制 — 非管理员禁止 provider/model override
```

### 6.3 前端防护

- Error Boundary: `app/(chat)/error.tsx` + `app/dashboard/error.tsx`（防异常白屏）
- 无障碍: ChatInput aria-label, CrisisBanner role="alert", ThinkingIndicator aria-live
- 移动端: 删除按钮 `max-md:opacity-100`（触屏可发现）

### 6.4 健康检查

`/api/health` — 含 DB 连通性检测（`SELECT 1`），失败返回 503

---

## 七、部署架构

### 7.1 双环境部署

| 环境 | 平台 | 域名 | 触发方式 |
|------|------|------|---------|
| 预览 | Vercel | mental-health-agent-tawny.vercel.app | git push 自动 |
| 生产 | 阿里云 FC | mental.llmxy.xyz | `bun run deploy:build && s deploy` 手动 |

### 7.2 关键约束

- 生产构建必须用 `bun run deploy:build`（复制 public + static 到 standalone）
- Middleware 必须排除静态资源路径
- 改 package.json 后必须 `pnpm install --lockfile-only` 同步 lockfile
- 禁止 Ghost Deploy（不 push 就 deploy）
- s.yaml 敏感值全部用 `${env()}` 引用，已加入 .gitignore

## 八、可观测性

| 工具 | 用途 |
|------|------|
| Langfuse | LLM 调用追踪、成本监控、对话质量分析 |
| 结构化日志 | logInfo/logWarn（session/user/route/duration） |
| StreamData | 前端实时接收 metadata（emotion/safety/state/memory） |
| 转化漏斗 | `l0_chat_start` → `l1_skill_recommended` → `l1_skill_clicked` → `l1_skill_completed` → `l2_lab_entered`（写入 ProgressMetric） |

## 九、技术栈

| 层 | 技术 |
|----|------|
| 前端 | Next.js 14 + React 18 + TypeScript + TailwindCSS + ArcoDesign + Framer Motion |
| 状态 | Zustand 4.4 |
| 后端 | Next.js API Routes (Serverless) |
| 认证 | NextAuth 5.0.0-beta.30 |
| 数据库 | PostgreSQL (Neon) + Prisma ORM + SQLite (评测) |
| AI | DeepSeek + OpenAI + Kimi + OpenRouter + GLM（通过 lib/llm 统一层） |
| AI SDK | Vercel AI SDK 3.4 |
| 监控 | Langfuse 3.38 |
| 包管理 | bun (开发) + pnpm (Vercel 部署) |
