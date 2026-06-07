# 心灵树洞 - 你的解压搭子

## Project Overview
AI 陪伴式解压工具，定位为"职场解压搭子"。表层是轻松的聊天陪伴体验，底层保留完整的 CBT 专业能力（情绪分析、认知重构、危机检测）。

**产品定位**：用户厌恶医疗标签，偏好轻松陪伴式交互。产品表面去医疗化，专业能力按需渐进暴露。

**功能分层**：
- Layer 0（默认入口）: 自由聊天、情绪倾诉、日常解压
- Layer 1（自然发现）: 呼吸练习、正念冥想、情绪记录、认知重构
- Layer 2（主动探索）: 对话排练、深度自我了解、成长记录
- Layer 3（专业评估）: 情绪健康度检查(PHQ-9)、压力指数检查(GAD-7)

## Tech Stack

### Frontend
- **Next.js 16** with App Router
- **React 19** + **TypeScript 6**
- **TailwindCSS 4** + **ArcoDesign 2.66**
- **Framer Motion 12** (animations)
- **Zustand 5** (state management)

### Backend
- **Next.js API Routes** (serverless)
- **NextAuth 5.0.0-beta.31** (authentication)
- **Prisma ORM 7** with PostgreSQL (driver adapter mode)
- **Langfuse 3.38** (LLM observability)

### AI Integration
- **DeepSeek Chat API** - primary LLM
- **AI SDK 6** - unified interface
- **Groq** / **OpenAI** - fallback options

### Key Libraries
- Zod 4 (validation), bcryptjs (password hashing)
- react-markdown 10 (content rendering)
- Baidu AIP SDK (speech synthesis)

## Project Structure
```
app/
  api/
    chat/route.ts           # Main dialogue API endpoint
    chat/handlers.ts        # Route handlers (crisis/support/assessment)
    chat/prefetch.ts        # Parallel prefetch (memory/triage/safety)
    memory/                 # Memory management APIs
    cron/
      prune-memory/route.ts #   定时清理过期/低置信度记忆
      retry-memory/route.ts #   定时重试失败的记忆提取
      auto-eval/route.ts    #   自动评测未评估对话（fire-and-forget）
    eval/                   # Eval system APIs
      start/route.ts        #   启动评测（spawn child process）
      status/[runId]/       #   轮询评测状态
      runs/route.ts         #   实验列表
      datasets/route.ts     #   数据集/用例查询
      trend/route.ts        #   评分趋势聚合 API
      prompt-versions/      #   Prompt 版本列表 + 评分聚合
      analyze/route.ts      #   AI 根因诊断 + 建议生命周期管理
    metrics/stats/route.ts  # Token/延迟/错误率统计 API
    optimization/           # Prompt optimization APIs
    auth/[...nextauth]/     # Authentication
  dashboard/
    optimization/           # 评测中心 Dashboard
      page.tsx              #   实验列表 + 新建实验弹窗
      exp/[runId]/page.tsx  #   实验详情（维度/对话/评分/AI分析）
      datasets/             #   数据集管理
      graders/              #   评分器配置
      analysis/             #   根因总览（6 层诊断 + 建议生命周期）
      online-quality/       #   线上质量监控（评分趋势 + 低分追踪）
      prompt-versions/      #   Prompt 版本管理（版本链 + Diff + 评分对比）
      metrics/              #   观测统计（Token/延迟/错误率趋势）
    memory/                 # 记忆管理 Dashboard
    crisis/                 # 危机管理 Dashboard
    progress/               # 进度追踪 Dashboard
  page.tsx                  # Home page (chat interface)

lib/
  auth/
    admin.ts                # Centralized admin auth (isAdmin/isAdminSession/RESERVED_NICKNAMES)
  llm/
    index.ts                # Unified LLM layer (5 providers: deepseek/openai/kimi/openrouter/glm)
    config.ts               # Provider env config
  ai/
    deepseek.ts             # DeepSeek API wrapper (legacy, used by llm layer)
    dialogue/               # Dialogue state management + state machine
    emotion.ts              # Emotion analysis (7 types, 0-10 intensity)
    guardrails/             # Input/output safety
    crisis-classifier.ts    # Crisis detection
    crisis-escalation.ts    # Crisis escalation flow
    assessment/             # PHQ-9/GAD-7 questionnaire system
    persona/                # Therapist profiles (xiaowarm/mingyuan/qinghe)
    exercise-engine.ts      # Exercise engine (breathing, mindfulness, etc.)
    agents/                 # Agent orchestration (triage/counselor/safety/quality)
    support.ts              # Support reply (streamSupportReply)
    skills.ts               # Skill cards detection + config
  memory/
    index.ts                # Memory V2 统一入口（profile + summary 两层）
    lab-extractor.ts        # 探索工坊记忆提取
    session-summary-v2-writer.ts  # 会话摘要写入
  eval/
    auto-ingest.ts          # Bad Case 自动回流（低分对话 → SQLite eval_cases）
    db-writer.ts            # SQLite 写入器（better-sqlite3，WAL 模式）
    prompt-version.ts       # Prompt 版本服务（注册/查询/diff/评分聚合）
  observability/
    langfuse.ts             # LLM monitoring
    metrics-collector.ts    # ChatMetric 采集器（Token/延迟/错误率）

scripts/
  eval-academic/
    run.ts                  # Eval runner (multi-turn chat + dual-layer judge)
    db.ts                   # SQLite eval database
    judges.ts               # Code checks + LLM judges

data/coding/                # Cached analysis results (open coding, AI analysis)
tests/eval/
  results/                  # Eval run results JSON
  datasets/                 # Academic dataset SQLite DB
```

## Package Manager
**Always use `bun` instead of npm/pnpm/yarn.**

## Key Commands
```bash
bun install

# Development
bun dev                     # Start dev server (port 3000)

# Database
bun prisma generate
bun prisma migrate deploy

# Build & Deploy
bun run build               # Build with Prisma migration
bun start                   # Start production server
bun run deploy:build        # Build for Alibaba Cloud FC

# Testing
bun test:unit               # Unit tests (Vitest)
bun smoke                   # Performance smoke tests
bun ci:check                # Full CI checks

# Linting
bun lint
bun typecheck
```

## Environment Variables
```bash
# Required
DEEPSEEK_API_KEY=           # DeepSeek API authentication

# Optional
DEEPSEEK_API_URL=           # DeepSeek endpoint
NEXT_PUBLIC_APP_NAME=       # App display name
DATABASE_URL=               # PostgreSQL connection
LANGFUSE_ENABLED=           # Enable/disable monitoring
LANGFUSE_SECRET_KEY=        # Langfuse auth
LANGFUSE_PUBLIC_KEY=
LANGFUSE_BASE_URL=
SKILL_MODE=                 # off/cards_only/steps_and_cards
```

## Core Features

### 对话体验
- 轻松陪伴式聊天，无医疗化标签
- 首次对话随机分配聊天风格（不弹选择器）
- 用户可在设置中切换风格（延迟发现）

### 情绪识别（后台）
Identifies 11 emotion types with 0-10 intensity scoring:
- Anxiety, Depression, Anger, Sadness, Fear, Happiness, Calm, 未表达, 压力, 疲惫, 情绪低落

### CBT 能力（后台，用户不可见术语）
- Empathetic understanding
- Cognitive distortion identification
- Cognitive restructuring guidance
- Behavioral recommendations

### 评估系统（Phase 5）
- **情绪健康度检查**（PHQ-9）— 用户看到的名称
- **压力指数检查**（GAD-7）— 用户看到的名称
- 对话状态机（SCEB 要素收集）
- 进度追踪与成长记录
- 触发方式：明确关键词（"情绪健康度"/"压力自评"/"压力指数"/"PHQ"/"GAD"），泛化触发词已收窄；设置页提供"压力自评"快捷入口

### Safety Features
- Crisis detection and classification（后台保持专业术语）
- Input/output safety guardrails（guardOutput 已接入生产链路）
- Sensitive information redaction
- 危机资源展示（保留热线号码，措辞去医疗化）
- 危机通知脱敏（Telegram 只发 userId + riskLevel，不含用户原文）
- 集中式管理员认证（`lib/auth/admin.ts`，替代 20+ 处硬编码）
- 非管理员禁止 LLM provider/model override
- Error Boundary 防白屏（chat + dashboard）
- 无障碍基础（aria-label、role="alert"、aria-live）

### Memory System
- Multi-turn conversation support (last 10 turns)
- Session memory management
- Memory consolidation with forgetting curve
- 定时清理 cron（`/api/cron/prune-memory`，90 天 + 置信度 < 0.5）

### 评测闭环（借鉴 CozeLoop 方法论）
完整的"线上 → 自动评测 → 自动回流 → Prompt 优化"闭环：
- **线上自动评测**：`/api/cron/auto-eval` 定时扫描未评估对话，fire-and-forget 异步评估
- **评分趋势**：按日聚合 pass/warn/fail 分布，线上质量 Dashboard 可视化
- **Bad Case 自动回流**：低分对话（overallScore ≤ 2）自动写入 SQLite eval_cases
- **Prompt 版本管理**：SHA256 去重 + 版本链，评分与版本关联，Diff 对比
- **观测统计**：ChatMetric 采集 Token/延迟/错误率，deepseek + compat provider 自动写入
- **数据模型**：ConversationEvaluation（+evalSource）、PromptVersion、ChatMetric

## 用户可见文案规范

**禁用词**（用户界面中不得出现）：
- ❌ 咨询 → ✅ 对话 / 聊天
- ❌ 心理咨询 → ✅ 聊聊
- ❌ 咨询师 → ✅ 我（第一人称）
- ❌ 疗愈 → ✅ 成长
- ❌ PHQ-9 抑郁评分 → ✅ 情绪健康度
- ❌ GAD-7 焦虑评分 → ✅ 压力指数
- ❌ 心理评估 → ✅ 深度了解
- ❌ 症状 → ✅ 状态

**允许在后台/系统提示词中使用专业术语**（lib/ai/prompts.ts 等）。

## Deployment Architecture

### Dual Deployment
1. **Vercel** (CI/CD auto-deploy)
   - Triggers on every git push
   - Preview environments
   - Code validation
   - **Domain: `mental-health-agent-tawny.vercel.app`**
   - 阿里云 FC 的语音识别 API 会代理到此域名（因为 FC 无法直接访问 Groq）

2. **Alibaba Cloud FC** (Production)
   - Manual deployment only
   - Domain: `mental.llmxy.xyz`
   - Requires: `source /tmp/mha-env.sh && bun run deploy:build && yes | s deploy`

### Critical Notes
- Build command: Use `bun run deploy:build` (not `next build`)
- Package manager: Always use bun
- **Lockfile 双更新**: 改 `package.json` 后必须同时运行 `pnpm install --lockfile-only` 更新 `pnpm-lock.yaml`（Vercel 用 pnpm 部署，lockfile 不同步会导致部署失败）
- Middleware: Must exclude static assets to prevent FC 404s
- Vercel Hobby: 10s timeout; Pro: 60s timeout

## 错题本

### bun install 需要三个代理变量

bun 不像 curl 那样只认 `HTTPS_PROXY`，需要同时设 `HTTP_PROXY` + `HTTPS_PROXY` + `ALL_PROXY` 才能走代理。否则 resolving dependencies 会无限卡住。

```bash
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 ALL_PROXY=http://127.0.0.1:7897 bun install
```

### vite 大版本升级必须用 overrides 统一

vitest 会在 `node_modules/vitest/node_modules/vite/` 嵌套安装自己兼容的 vite 版本。当顶层 vite 和 vitest 内部 vite 跨大版本（如 vite 8 Rolldown vs vite 7 Rollup）时，`@vitejs/plugin-react` 返回的 Plugin 类型不兼容，typecheck 报 `hotUpdate` / `MinimalPluginContext` 类型冲突。

解法：在 `package.json` 加 `overrides`（bun/npm）和 `pnpm.overrides` 强制统一：

```json
"overrides": { "vite": "^8.0.0" },
"pnpm": { "overrides": { "vite": "^8.0.0" } }
```

### deploy:build 的 cp 命令缺少 mkdir -p

`deploy:build` 脚本中 `cp node_modules/sql.js/dist/sql-wasm.wasm .next/standalone/node_modules/sql.js/dist/` 假设目标目录存在，但 Next.js standalone 不一定会 trace 到 sql.js。需要在 cp 前加 `mkdir -p`。

### s deploy 环境变量加载的三个坑

1. **shell source 解析失败**：`.env` 中 URL 含 `&` 字符，`source .env` 会报 `parse error near '&'`。用 node 脚本解析 `.env` 再 `source` 生成的 export 文件。
2. **.env.production 占位值覆盖真实值**：`.env.production` 中 `LANGFUSE_SECRET_KEY="a"` 等占位值会覆盖 `.env.local` 的真实 key。部署时只加载 `.env` + `.env.local`，不加载 `.env.production`。
3. **多次确认提示**：`s deploy` 会弹多个 Y/n 确认（函数配置 + trigger 配置），`echo "y"` 只能答一次，需要用 `yes | s deploy`。

### Tailwind 4 codemod 的 rounded 重命名逻辑

Tailwind 4 的 rename 不是简单的全局替换。`rounded-sm`（v3, 2px）→ `rounded-xs`（v4），`rounded`（v3, 4px）→ `rounded-sm`（v4）。codemod 会正确区分，但人工检查时容易误判"rounded-sm 没改"——实际上它可能是从旧 `rounded` 改过来的，语义正确。

### fire-and-forget 后台任务不能放在流式响应外的微任务里（2026-06-07 #16 根因）

**问题**：聊天对话从不生成记忆。根因是 `triggerAsyncMemoryExtraction(finalSessionId, finalUserId)` 放在 `createUIMessageStream(...)` 之外、用 `Promise.resolve().then()` 触发。但 `finalSessionId/finalUserId` 是在 stream 的 `execute` 回调里赋值的，而 execute 是**惰性的**（流被消费时才跑）；微任务先于 execute 执行，读到的 ID 是 `undefined`，触发函数 `if (!sessionId) return` 直接早退，且静默无日志。

**通用原则**：
1. **依赖"流式回调内才赋值的变量"的后台任务，必须放进回调内、在该变量确定之后触发**，不能放在创建流之后的外层微任务里——外层代码先于流回调执行。
2. **serverless（Vercel/阿里云 FC）下，响应返回后的 fire-and-forget 不可靠**：实例可能被立刻冻结，含 LLM 调用的后台任务会半路被掐。用 `after()`(next/server) 包裹，运行时会等任务跑完再回收。封装成 `runAfterResponse()` 并带 try/catch 回退（不在 request scope 时退回 fire-and-forget），见 `route-helpers.ts`。
3. **结构化输出（LLM → Zod）对单条越界要做 per-field 兜底**：用 `z.enum([...]).catch('默认值')`，否则一条脏数据（如 topic 越界）会让整批 `.parse()` 失败、好数据全丢。
4. **静默 `catch → return []` 是排障黑洞**：抽取失败这类后台任务务必留 warn 日志，否则线上限流/超时时无人知晓（本项目 `MemoryExtractionLog` 表当前只读不写，已是反面教材）。

### 调试归因要靠证据，别被"看起来合理"的假设带偏（2026-06-07 #16 过程教训）

初判 #16 是"本地 openrouter 额度假象 + 20 轮 summary 门槛"，**被 DB 证据推翻**：切 DeepSeek 重现后聊天仍 0 候选、提取日志为空，才定位到真根因是竞态。教训：**怀疑环境/外部因素前，先用最小重现坐实**；DB 里的 `MemoryExtractionLog`、候选计数是比代码推理更硬的证据。

## Development Principles
1. All documentation in Chinese
2. Never discard previous docs - use incremental updates
3. Always test before marking complete
4. Always use bun (not npm/pnpm/yarn)
5. Use `deploy:build` for production

## Documentation
- `README.md` - Quick start guide
- `PROJECT_CONSTITUTION.md` - Deployment rules, CI/CD standards
- `PROJECT_SUMMARY.md` - Technical overview (615 lines)
- `ARCHITECTURE.md` - System architecture
- `DESIGN_GUIDE.md` - Design system (colors, typography)
- `docs/` - Detailed engineering guides
