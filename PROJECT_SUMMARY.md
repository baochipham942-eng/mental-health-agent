# 心灵树洞 — 项目总结

> 最后更新：2026-06-16

## 一、项目概述

**项目名称**：心灵树洞（Mental Health Agent）
**产品定位**：AI 陪伴式解压工具，"职场解压搭子"
**核心理念**：表层去医疗化的轻松陪伴，底层保留完整 CBT 专业能力
**技术栈**：Next.js 16 + React 19 + TypeScript 6 + PostgreSQL + DeepSeek（多 LLM 支持）
**部署平台**：Vercel（预览）+ 阿里云 FC（生产）
**开发状态**：多个完整功能模块上线，持续迭代中

---

## 二、产品设计

### 2.1 产品重定位历程

项目经历了从"AI 心理咨询师"到"职场解压搭子"的重大定位转变：

| 阶段 | 定位 | 特点 |
|------|------|------|
| MVP | AI 心理咨询聊天机器人 | 专业导向、CBT 干预、localStorage |
| Phase 2-4 | AI 心理健康助手 | 加入认证、数据库、记忆系统 |
| Phase 5+ | **职场解压搭子** | 去医疗化、陪伴导向、渐进暴露专业能力 |

### 2.2 功能分层（渐进暴露）

| Layer | 用户感知 | 实际能力 | 触达方式 |
|-------|---------|---------|---------|
| L0 | 自由聊天、情绪倾诉 | Multi-Agent 编排（Triage + Safety + Counselor）| 默认入口 |
| L1 | 呼吸练习、正念冥想、情绪记录 | ExerciseEngine + SFBT + Widget 组件 | 自然发现（技能卡） |
| L2 | 探索工坊（导师对话、MBTI、圆桌论道） | Mentor Personas + Group Chat | 主动探索 |
| L3 | 情绪健康度 / 压力指数 | PHQ-9 / GAD-7 对话式收集 | 用户触发或系统温和建议 |

### 2.3 用户体验设计

**Onboarding（目的导向）**：
- 4 张情境卡片：心情不太好 / 压力有点大 / 想理清思路 / 随便聊聊
- 点击后翻转显示共情文案，设置情绪主题色
- 完成后进入双栏首页，下次进入跳过

**首页（双栏布局）**：
- 左栏：新对话卡片 + 快捷导航（情绪趋势 / 记忆 / 探索工坊 / 设置）
- 右栏：历史对话列表（按日期分组，带状态 badge）
- 移动端响应式（768px 断点）

**设置面板（5 标签页）**：
- 个人资料：8 种预设头像 + 昵称
- 主题色：4 种情绪主题
- 聊天风格：3 种治疗师 persona
- 隐私与数据
- 管理员（仅特定账号可见）

### 2.4 文案规范（去医疗化）

| 禁用词 | 替代词 |
|--------|--------|
| 咨询 | 对话 / 聊天 |
| 心理咨询 | 聊聊 |
| 咨询师 | 我（第一人称）|
| 疗愈 | 成长 |
| PHQ-9 抑郁评分 | 情绪健康度 |
| GAD-7 焦虑评分 | 压力指数 |
| 心理评估 | 深度了解 |
| 症状 | 状态 |

---

## 三、核心功能模块

### 3.1 智能对话

- Multi-Agent 编排：Triage（分类）→ Safety（安全）→ Counselor（回复）
- **Scene Recognition v1**：首个 triage LLM 节点直接输出 `scene`（职场边界 / 学生压力 / 照护负担 / 通用支持）
- **Realtime WebSearch v1**：动态事实问题按需走 OpenAI `Responses + web_search`，搜索结果作为外部事实上下文注入
- 流式响应 + 并行预取（记忆 / 分类 / 安全同时进行，~800ms 节省）
- 极速技能路径：直接 skill 请求跳过所有 LLM 调用
- 情绪识别：7 类情绪 + 0-10 强度评分
- 对话状态机：SCEB 要素收集 + 状态转移
- 危机检测：LLM 语义评估（替代关键词硬匹配）+ 安全回复 + 热线展示
- **统一人格约束**（PERSONA_INVARIANTS）：跨所有路径（support/crisis/exercise）强制语气、称谓、禁词、篇幅、格式一致性
- **首轮优化**：首轮跳过 therapist/activeExercise 查询 + triage soft wait，目标 <800ms
- **次日回访**：首轮自动检测 24-48h 内完成但无后续的练习，AI 主动提及

### 3.2 技能系统（8 种）

**Widget 型（前端驱动）**：
1. 4-7-8 呼吸法 — 带动画定时器
2. 正念冥想 — 5 分钟引导
3. 情绪记录 — 选择情绪 + 强度 + 触发因素
4. 溪流落叶 — 脱钩练习动画

**Guided 型（AI 多轮对话）**：
5. 五感着陆 — 5 步感官觉察
6. 认知重构 — 4 步思维挑战
7. 行为激活 — 3 步微行动
8. 空椅子技术 — 4 步未竟对话

技能通过自然语言检测触发（`detectDirectSkillRequest()`），也可通过技能卡片面板手动选择。

**技能推荐场景化**（Pilot 优化）：
- 职场急救包（工作压力 → breathing/reframing）
- 入睡安眠包（失眠 → breathing）
- 心结化解包（放不下 → empty_chair）
- 思绪整理包（想太多 → leaves_stream/meditation）

**练习后闭环**：
- SFBT 个人化总结：练习完成后 AI 附"本次小结"（练习名 + 感受变化 + 鼓励）
- 转化漏斗埋点：`l0_chat_start` → `l1_skill_recommended` → `l1_skill_clicked` → `l1_skill_completed` → `l2_lab_entered`

### 3.3 探索工坊

探索工坊是 L2 层的核心功能，位于 `/dashboard/lab`，包含 4 个标签：

#### 智慧殿堂 — 10 位历史先驱对话
苏格拉底、荣格、阿德勒、塞利格曼、萨提亚、卡尼曼、维特根斯坦、萨特、纳瓦尔、哈耶克。每位导师有独特 persona、主题色和 emoji 头像。

#### 镜像回廊 — 16 种 MBTI 人格互动
完整 16 型 MBTI persona，支持选择"我是"的类型 + 随机匹配。按 Analyst/Diplomat/Sentinel/Explorer 分色展示。

#### 圆桌论道 — 多人群组对话
选 2-4 位大师，输入话题，支持讨论模式（互相补充）和辩论模式（正反交锋）。

#### 自定义大师
用户可创建自定义导师 persona（开发中）。

### 3.4 情绪追踪

- **情绪类型扩展**：11 种（原 7 种 + 未表达/压力/疲惫/情绪低落），与 triage-agent prompt 对齐
- **实时反馈**：每条消息显示情绪标签 + 强度进度条
- **趋势面板**：7/30 天情绪折线图 + 趋势徽章
- **统计摘要**：对话数 + 练习数 + 探索数
- **成长记录**：里程碑追踪

### 3.5 评估系统

- 情绪健康度检查（PHQ-9）— 对话式自然收集
- 压力指数检查（GAD-7）— 对话式自然收集
- 触发方式：明确关键词（"情绪健康度"/"压力自评"/"压力指数"/"PHQ"/"GAD"），泛化触发词已收窄
- 设置页提供"压力自评"快捷入口
- 进度追踪与成长记录面板

### 3.6 安全防线

- **输入安全**：Guardrails 拦截有害内容
- **输出安全**：`guardOutput()` 已接入生产链路，unsafe 回复自动替换为安全文本
- **Safety Agent**：深度安全评估 + 约束生成
- **危机检测**：LLM 语义评估（few-shot），替代关键词硬匹配
- **危机升级**：展示热线号码，措辞去医疗化；Telegram 通知已脱敏（仅发 userId + riskLevel + 时间戳）
- **设置页安全资源**：底部常驻热线（400-161-9995 / 400-821-1215）
- **敏感信息**：自动脱敏
- **集中式管理员认证**：`lib/auth/admin.ts` 统一 20+ 处硬编码检查，保留昵称机制防越权
- **API 路由加固**：eval/start、speech/transcribe、optimization/* 均已添加认证
- **LLM provider 限制**：非管理员禁止 override provider/model，防成本失控
- **Error Boundary**：chat + dashboard 均有 error.tsx，防异常白屏
- **无障碍基础**：ChatInput（aria-label）、CrisisBanner（role="alert"）、ThinkingIndicator（aria-live）

### 3.7 记忆系统

```
短期记忆
  └─ 最近 10 轮对话历史

长期记忆 V2 (PostgreSQL) — 两层并行 + 三个补充源（已统一，V1 已删除）
  ├─ Layer 1: ProfileMemory — 5 种 kind（trigger/preference/coping/relationship/identity）
  │   └─ 关键词匹配 + kind 权重 + priority/confidence 打分，取 Top 6
  ├─ Layer 2: SessionSummaryV2 — 按时间取最近 2 条
  ├─ 补充 A: 练习回访（首轮，查 24-48h 内完成但无后续的练习）
  ├─ 补充 B: 7 天情绪趋势摘要（非首轮）
  └─ 补充 C: SessionMetadata（会话元数据）

记忆注入增强
  ├─ 探索工坊发现标注：lab_ 来源的 ProfileMemory 标注"(探索工坊发现)"
  └─ 记忆使用指南：引导 AI 用"我记得你说过..."自然引用

生命周期
  ├─ 提取：异步 MemoryExtractor（lab-extractor 独立处理探索工坊）
  ├─ 检索：Memory V2（profile + summary 两路并行合并）
  └─ 定时清理：/api/cron/prune-memory（90 天 + 置信度 < 0.5）
```

---

## 四、系统架构

### 4.1 对话引擎

```
用户消息
  → 0.0 极速技能路径（直接 skill → 跳过 LLM）
  → 0.1 输入安全检测
  → 0.2 认证 + 会话恢复
  → 0.5 并行预取（记忆 / Triage / Safety / 评估历史 / 危机检查）
  → 0.6 对话状态机（SCEB）
  → 0.7 练习状态检测
  → 路由决策（crisis / assessment / support）
  → 异步后处理（记忆提取 + 质量抽检）
```

### 4.2 Multi-Agent 编排

| Agent | 职责 | 模型 | 超时 |
|-------|------|------|------|
| TriageAgent | 情绪/意图/安全快速分类 | DeepSeek | 5s |
| CounselorAgent | 生成回复 | 可切换 | 30s |
| SafetyAgent | 深度安全评估 + 约束生成 | DeepSeek | 5s |
| QualityAgent | 回复质量抽检 | DeepSeek | 10s |

### 4.3 LLM Provider 层

统一接口 `lib/llm/index.ts`，支持 5 个 provider + 运行时模型切换：
- DeepSeek（默认，高性价比）
- OpenAI（英文基线，指令遵循）
- Kimi（中文长上下文）
- OpenRouter（Claude / Gemini 等）
- GLM（备选）

自动推断规则：`gpt-*` → openai、`kimi-*` → kimi、`deepseek-*` → deepseek、含 `/` → openrouter、`glm-*` → glm

### 4.4 评测系统

学术数据集驱动的自动化评测 + 定性分析闭环：

**数据集**：
- ESConv（195 条，英文情感支持）
- CPsyCounE（35 条，中文心理咨询）
- Psy-Insight CN（431 条，双语心理咨询）

**双层评分**：
- Layer 1：代码规则（no-medical-label / no-gaslighting / reply-length）
- Layer 2：LLM Judge（8 维度：empathy / safety / coherence / persona 等）

**评测中心 Dashboard（4 组导航）**：
- 评测组：实验列表 / 数据集管理 / 数据集版本 / 评分器 / 校准 / Prompt CI
- 观测组：线上质量（评分趋势 + 维度标注）/ 轨迹分析 / 观测统计 / 安全红线
- 优化组：根因分析 / Prompt 版本 / 版本对比（雷达图 + AI 洞察）
- 标注组：标注队列（Workbench）/ 标注一致性（Cohen's Kappa）

**架构解耦（data-bridge 模式）**：
- `lib/eval/data-bridge.ts` 和 `lib/memory/data-bridge.ts` 是各自模块唯一 Prisma 访问点
- `eval-events.ts` 让业务代码只 emit 低分回流、Prompt 版本注册等事件
- `instrumentation.ts` 在 Node.js runtime 启动时导入 `lib/eval/init.ts` 注册事件监听
- 评分维度、轨迹权重、安全规则外置到 JSON，由 TypeScript loader 提供类型安全访问

**6 层根因诊断**（取代原有扎根理论编码）：
- 诊断瀑布：编排&架构 → 工程&代码 → 防护规则 → 评估器 → 数据/模型 → 提示词
- 每条建议含 dismissal_reason（排除上层理由）+ 失败模式标签
- 建议生命周期：采纳/拒绝/搁置 + 备注持久化
- 根因总览页只读缓存，不触发 LLM 调用

### 4.5 用户行为分析

- **PostHog PageView**：App Router 路由变化时手动 capture `$pageview`
- **性能策略**：idle 后动态加载 SDK，关闭 autocapture、session recording、surveys、performance capture、dead click capture
- **接入点**：`app/layout.tsx` 挂载 `PostHogPageView`

---

## 五、技术架构

### 5.1 整体分层

```
前端（Next.js 16 App Router）
  Chat UI ←→ Dashboard（评测中心 / 记忆 / 危机 / 进度 / 探索工坊）
        │
        │ API Routes
        ↓
后端（Serverless Functions）
  Chat API │ Memory │ Auth │ Eval │ Mentor │ Group │ MBTI
        │
        ↓
Multi-Agent 对话引擎 + LLM Provider 层
  DeepSeek │ OpenAI │ Kimi │ OpenRouter │ GLM
        │
        ↓
数据层
  PostgreSQL (Neon) │ Prisma ORM │ SQLite (评测) │ Langfuse
```

### 5.2 项目目录结构

```
app/
  (chat)/
    page.tsx                    # 首页（双栏布局 / Onboarding）
    c/[sessionId]/page.tsx      # 对话界面
  api/
    chat/route.ts               # 主对话 API
    chat/mentor/route.ts        # 导师对话 API
    chat/group/route.ts         # 圆桌群组 API
    chat/mbti/route.ts          # MBTI 对话 API
    memory/                     # 记忆管理
    eval/                       # 评测系统（version-compare/annotations/security/trace 等）
    progress/                   # 进度追踪
    auth/[...nextauth]/         # 认证
  dashboard/
    optimization/               # 评测中心（评测/观测/优化/标注）
    memory/                     # 记忆管理
    crisis/                     # 危机管理
    progress/                   # 进度追踪
    lab/                        # 探索工坊

components/
  onboarding/                   # Onboarding 流程
  layout/                       # 首页布局、设置面板
  chat/                         # 对话组件、消息气泡、技能卡
    widgets/                    # 呼吸/冥想/情绪记录/溪流落叶 Widget
  lab/                          # 探索工坊（MBTI/群聊/自定义大师）
  settings/                     # 导师区域（智慧殿堂）
  progress/                     # 情绪趋势面板
  providers/                    # PostHogPageView / Arco / NextAuth provider

lib/
  llm/index.ts                  # 统一 LLM 层（5 provider）
  ai/
    agents/                     # Agent 编排（triage/counselor/safety/quality）
    skills.ts                   # 技能检测 + 配置
    exercise-engine.ts          # 练习引擎
    emotion.ts                  # 情绪分析
    mentors/personas.ts         # 10 位导师 persona
    mbti/personas.ts            # 16 种 MBTI persona
    dialogue/                   # 对话状态机
    guardrails/                 # 安全防线
    crisis-classifier.ts        # 危机检测
    persona/                    # 治疗师风格
  memory/
    data-bridge.ts              # Prisma 唯一访问点（纯数据对象）
    index.ts                    # Memory V2 入口
  eval/
    data-bridge.ts              # Prisma 唯一访问点（纯数据对象）
    eval-store.ts               # SQLite 存储层
    eval-events.ts              # 事件总线
    config/                     # 评测配置（JSON + TS 加载器）
    prompt-ci-store.ts          # Prompt CI 存储
    dataset-version-store.ts    # 数据集版本存储
    annotation-task-store.ts    # 标注任务存储
    security-event-store.ts     # 安全红线事件存储
    trace-extractor.ts          # 对话链路轨迹提取
  observability/                # Langfuse 监控

instrumentation.ts              # Next.js 启动 hook，注册 eval 事件监听
scripts/eval-academic/          # 评测 Runner
tests/eval/                     # 评测数据 + 结果
```

### 5.3 API 端点清单

| 端点 | 用途 |
|------|------|
| POST `/api/chat` | 主对话（support / assessment / crisis） |
| POST `/api/chat/mentor` | 单个导师对话 |
| POST `/api/chat/mentor/generate-opening` | 导师开场白生成 |
| POST `/api/chat/group` | 圆桌群组对话 |
| POST `/api/chat/mbti` | MBTI 人格对话 |
| `/api/memory` | 记忆管理 |
| `/api/progress` | 进度追踪 |
| POST `/api/progress/funnel` | 转化漏斗事件上报 |
| `/api/eval/*` | 评测系统 |
| `/api/auth/[...nextauth]` | 认证 |

### 5.4 可观测性

| 工具 | 用途 |
|------|------|
| Langfuse | LLM 调用追踪、成本监控、对话质量分析 |
| PostHog | 页面浏览追踪，idle 后动态加载，重型采集关闭 |
| 结构化日志 | logInfo/logWarn（session / user / route / duration）|
| StreamData | 前端实时接收 metadata（emotion / safety / state / memory）|

---

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

---

## 七、技术决策记录

| 决策 | 原因 |
|------|------|
| 产品重定位为"解压搭子" | 用户研究表明目标人群厌恶医疗标签 |
| 渐进暴露分层 | 降低使用门槛，专业能力按需展现 |
| Multi-Agent 架构 | 职责分离（分类/回复/安全/质量独立） |
| 5 Provider 统一层 | 支持评测对比 + 成本优化 + 供应商冗余 |
| 危机检测从关键词改 LLM | 关键词匹配误报率高，LLM 语义理解更准确 |
| 学术数据集评测 | 标准化可复现，支持跨模型横评 |
| 统一人格约束（PERSONA_INVARIANTS） | 跨路径（support/crisis/exercise）强制一致的语气/称谓/禁词/格式 |
| 转化漏斗埋点 | 量化 L0→L1→L2 各环节转化率，数据驱动优化 |
| 量表触发收窄 | 泛化词不再自动进入评估，减少误触发 |
| 集中式管理员认证 | 消除 20+ 处硬编码，统一入口防越权 |
| guardOutput 接入生产 | LLM 输出安全检测从形同虚设到实际生效 |
| 危机通知脱敏 | Telegram 不再发送用户原文，只发元数据 |
| 非管理员 provider 限制 | 防止客户端任意指定昂贵模型 |
| 6 层根因诊断（取代扎根理论） | 强制从架构→代码→规则→评估器→数据→提示词逐层排除，避免所有建议都是"改 prompt" |
| 建议生命周期管理 | 采纳/拒绝/搁置 + 备注，跟踪优化进展 |
| 记忆系统 V2 统一 | 删除 V1 遗忘曲线/consolidator/retriever，简化为 profile+summary 两层 |
| data-bridge 解耦模式 | eval/memory 模块各有独立 Prisma 数据桥接层，返回纯数据对象，降低跨模块类型耦合 |
| 事件总线解耦 eval 回流 | 业务代码 emit 事件，eval 模块在启动时注册监听，避免反向依赖扩散 |
| 评测配置外置 JSON | 评分维度、轨迹权重、安全规则从代码中抽出，方便调整和审阅 |
| PostHog 轻量 pageview | 只保留页面浏览追踪，关闭 Session Recording 等重型能力，降低首屏和网络负担 |
| bun 开发 + pnpm 部署 | bun 速度快适合本地，Vercel 原生支持 pnpm |
| PostgreSQL + pgvector | 关系数据 + 向量检索一体化 |
| Onboarding 改为目的导向 | 情绪意象选择让用户困惑，目的导向更直觉 |

---

*本文档对应项目版本：2026-06-16*
