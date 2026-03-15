# 心灵树洞 — 项目总结

> 最后更新：2026-03-15

## 一、项目概述

**项目名称**：心灵树洞（Mental Health Agent）
**产品定位**：AI 陪伴式解压工具，"职场解压搭子"
**核心理念**：表层去医疗化的轻松陪伴，底层保留完整 CBT 专业能力
**技术栈**：Next.js 14 + TypeScript + PostgreSQL + DeepSeek（多 LLM 支持）
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
- **Safety Agent**：深度安全评估 + 约束生成
- **危机检测**：LLM 语义评估（few-shot），替代关键词硬匹配
- **危机升级**：展示热线号码，措辞去医疗化
- **设置页安全资源**：底部常驻热线（400-161-9995 / 400-821-1215）
- **敏感信息**：自动脱敏

### 3.7 记忆系统

```
短期记忆
  └─ 最近 10 轮对话历史

长期记忆 V2 (PostgreSQL) — 两层并行 + 三个补充源
  ├─ Layer 1: ProfileMemory — 5 种 kind（trigger/preference/coping/relationship/identity）
  │   └─ 关键词匹配 + kind 权重 + priority/confidence 打分，取 Top 6
  ├─ Layer 2: SessionSummaryV2 — 按时间取最近 2 条
  ├─ 补充 A: 练习回访（首轮，查 24-48h 内完成但无后续的练习）
  ├─ 补充 B: 7 天情绪趋势摘要（非首轮）
  └─ Fallback: Legacy memoryManager（V2 为空或报错时降级）

记忆注入增强（Pilot 优化）
  ├─ 探索工坊发现标注：lab_ 来源的 ProfileMemory 标注"(探索工坊发现)"
  └─ 记忆使用指南：引导 AI 用"我记得你说过..."自然引用

生命周期
  ├─ 提取：异步 MemoryExtractor
  ├─ 检索：Memory V2（profile + summary 两路并行合并）
  └─ 遗忘：Forgetting Curve（间隔重复衰减）
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

**定性分析（扎根理论）**：
1. 开放编码 — 两阶段 LLM 辅助标签提取
2. 主轴编码 — 标签聚类为 3-6 个主题
3. AI 改进分析 — 生成可操作优化建议

---

## 五、技术架构

### 5.1 整体分层

```
前端（Next.js 14 App Router）
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
    eval/                       # 评测系统
    progress/                   # 进度追踪
    auth/[...nextauth]/         # 认证
  dashboard/
    optimization/               # 评测中心
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
  memory/                       # 记忆系统
  observability/                # Langfuse 监控

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
| 扎根理论定性分析 | 系统性发现改进方向，避免拍脑袋优化 |
| bun 开发 + pnpm 部署 | bun 速度快适合本地，Vercel 原生支持 pnpm |
| PostgreSQL + pgvector | 关系数据 + 向量检索一体化 |
| Onboarding 改为目的导向 | 情绪意象选择让用户困惑，目的导向更直觉 |

---

*本文档对应项目版本：2026-03-15*
