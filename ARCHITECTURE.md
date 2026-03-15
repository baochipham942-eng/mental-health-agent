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
0.2 认证 + 会话恢复
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

评测系统采用学术数据集驱动的自动化评测 + 定性分析闭环：

```
┌─────────────────────────────────────────────────┐
│              评测中心 Dashboard                    │
│  实验列表 │ 数据集管理 │ 评分器 │ 定性分析          │
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
│         定性分析 (Grounded Theory)                │
│                                                   │
│  开放编码 (Open Coding)                           │
│    阶段1: 提取每条失败的一句话问题描述              │
│    阶段2: 统一归类到 8-15 个精简标签               │
│                                                   │
│  主轴编码 (Axial Coding)                          │
│    将标签聚类为 3-6 个主题                         │
│                                                   │
│  AI 改进分析                                      │
│    基于主题生成可操作的优化建议                      │
│    结果缓存到 data/coding/analysis-{runId}.json   │
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

### 4.4 定性分析方法论

采用扎根理论 (Grounded Theory) 三阶段编码：

1. **开放编码**（两阶段 LLM 辅助）
   - 阶段 1：每条失败案例提取一句话问题描述（纯事实）
   - 阶段 2：全局视角归类到 8-15 个互不重叠的精简标签
   - 标签要求：4-8 字，可操作，不针对具体案例

2. **主轴编码**（LLM 聚类）
   - 将开放编码标签聚类为 3-6 个高层主题
   - 识别主题间的因果/关联关系

3. **AI 改进分析**
   - 基于主题生成可操作的优化建议（prompt 调整、规则新增等）
   - 结果持久化缓存，避免重复生成

## 五、记忆系统

```
短期记忆
  └─ 最近 10 轮对话历史（request body）

长期记忆 V2 (Prisma + PostgreSQL) — 两层并行 + 三个补充源
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
  ├─ 补充 B: 7 天情绪趋势摘要（仅非首轮）
  └─ Fallback: Legacy memoryManager（V2 为空或报错时降级）

记忆注入增强
  ├─ 探索工坊发现标注：lab_ 来源标注"(探索工坊发现)"
  └─ 记忆使用指南：引导 AI 自然引用（"我记得你说过..."）

记忆生命周期
  ├─ 提取：异步 MemoryExtractor（每次对话后触发）
  ├─ 检索：Memory V2（profile + summary 两层并行）
  └─ 遗忘：Forgetting Curve（间隔重复衰减）
```

## 六、部署架构

### 双环境部署

| 环境 | 平台 | 域名 | 触发方式 |
|------|------|------|---------|
| 预览 | Vercel | mental-health-agent-tawny.vercel.app | git push 自动 |
| 生产 | 阿里云 FC | mental.llmxy.xyz | `bun run deploy:build && s deploy` 手动 |

### 关键约束

- 生产构建必须用 `bun run deploy:build`（复制 public + static 到 standalone）
- Middleware 必须排除静态资源路径
- 改 package.json 后必须 `pnpm install --lockfile-only` 同步 lockfile
- 禁止 Ghost Deploy（不 push 就 deploy）

## 七、可观测性

| 工具 | 用途 |
|------|------|
| Langfuse | LLM 调用追踪、成本监控、对话质量分析 |
| 结构化日志 | logInfo/logWarn（session/user/route/duration） |
| StreamData | 前端实时接收 metadata（emotion/safety/state/memory） |
| 转化漏斗 | `l0_chat_start` → `l1_skill_recommended` → `l1_skill_clicked` → `l1_skill_completed` → `l2_lab_entered`（写入 ProgressMetric） |

## 八、技术栈

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
