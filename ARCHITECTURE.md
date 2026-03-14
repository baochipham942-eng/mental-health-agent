# 项目架构文档

> 最后更新：2026-03-14

## 一、系统概览

心灵树洞是 AI 陪伴式解压工具，表层是轻松的聊天陪伴体验，底层保留完整的 CBT 专业能力。

```
┌─────────────────────────────────────────────────────┐
│                    前端（Next.js 14）                  │
│  Chat UI  ←→  Dashboard（评测中心/记忆/危机/进度）       │
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
0.5 并行预取（~800ms 节省）
  ├─ 记忆检索（Memory V2: profile + summary + semantic）
  ├─ Triage Agent（情绪/意图/安全快速分析）
  ├─ Safety Agent（深度安全评估）
  ├─ 评估历史 + 用户偏好
  └─ 危机快速检查
  ↓
0.6 对话状态机（SCEB 要素收集 + 状态转移）
  ↓
0.7 练习状态检测（SFBT 引导）
  ↓
路由决策（规则优先，LLM 辅助）
  ├─ crisis  → 危机处理（热线 + 安全回复）
  ├─ assessment → 评估收集（PHQ-9/GAD-7 对话式）
  └─ support → 支持回复（CounselorAgent 流式输出）
  ↓
异步后处理
  ├─ 记忆提取（长期记忆沉淀）
  └─ 质量检查（QualityAgent 抽检）
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
| L2 主动探索 | 对话排练、成长记录 | StateMachine + Memory |
| L3 专业评估 | 情绪健康度/压力指数 | PHQ-9/GAD-7 对话式收集 |

## 三、评测系统架构

### 3.1 整体设计

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

### 3.2 评测数据流

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

### 3.3 模型切换评测

评测系统支持在不同模型间对比效果：

| Provider | 可选模型 | 适用场景 |
|----------|---------|---------|
| DeepSeek | V3.2, V3.2 推理 | 中文对话基线，高性价比 |
| Kimi | K2.5 | 中文长上下文 |
| OpenAI | GPT-5.4, GPT-5, GPT-5 Mini | 英文基线，指令遵循 |
| OpenRouter | Claude Opus/Sonnet 4.6, Gemini 3.1 Pro/Flash Lite | 安全性对比，多模型横评 |

### 3.4 定性分析方法论

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

## 四、记忆系统

```
短期记忆
  └─ 最近 10 轮对话历史（request body）

长期记忆 (Prisma + PostgreSQL)
  ├─ Profile Memory（用户画像：姓名、职业、关注点）
  ├─ Session Summary（会话摘要，定期刷新）
  └─ Semantic Memory（语义检索，pgvector）

记忆生命周期
  ├─ 提取：异步 MemoryExtractor（每次对话后触发）
  ├─ 检索：Memory V2（profile + summary + semantic 三路合并）
  └─ 遗忘：Forgetting Curve（间隔重复衰减）
```

## 五、部署架构

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

## 六、可观测性

| 工具 | 用途 |
|------|------|
| Langfuse | LLM 调用追踪、成本监控、对话质量分析 |
| 结构化日志 | logInfo/logWarn（session/user/route/duration） |
| StreamData | 前端实时接收 metadata（emotion/safety/state/memory） |

## 七、技术栈

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
