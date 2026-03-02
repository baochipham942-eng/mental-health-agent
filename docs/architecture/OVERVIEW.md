# 心灵树洞 — 产品架构总览

> 本文档提供系统端到端架构的单页总览，涵盖请求链路、Skill 系统、Contract/Gate、配置与 CI 可追溯性。用于团队对齐与后续迭代参考。

## 产品定位（2026-03 重定位）

**对外**：职场解压搭子 — 轻松陪伴式聊天体验，无医疗化标签。
**对内**：基于 CBT 的专业心理支持系统，具备完整的评估、干预、危机检测能力。

**设计原则**：专业能力按需渐进暴露（Layer 0-3），用户界面去医疗化，后台保留全部专业术语。

## 系统边界与核心目标

**一句话**：基于 LLM 的陪伴式对话系统，底层支持 assessment/crisis/support 三种路由，表层呈现为轻松聊天体验。

**核心目标**：
- **结构化输出**：通过 Skill 系统确保 `nextStepsLines` 和 `actionCards` 的结构一致性
- **单一数据源**：在 `SKILL_MODE=steps_and_cards` 模式下，确保输出完全来自 Skill 系统，避免 LLM 输出干扰
- **契约一致性**：通过统一的 Contract 验证函数，确保 gate/smoke/单测使用同一套规则
- **可追溯性**：通过 `verify:config` + `ci:check` 串联，确保配置与验收的可追溯性

## 请求链路

```mermaid
graph TD
    A[前端请求] --> B[/api/chat route.ts]
    B --> C{路由判定}
    C -->|assessment| D[generateAdaptiveAssessmentQuestions]
    C -->|crisis| E[generateCrisisReply]
    C -->|support| F[generateSupportReply]
    
    D --> G{state === awaiting_followup?}
    G -->|是| H[detectGap 缺口检测]
    G -->|否| I[返回评估问题]
    
    H --> J{hasGap?}
    J -->|是| K[返回 gap_followup 问题]
    J -->|否| L[generateAssessmentConclusion]
    
    L --> M[gates/sanitize 门禁与清洗]
    M --> N{SKILL_MODE?}
    N -->|steps_and_cards| O[Skill 系统: context → select → render]
    N -->|cards_only| P[LLM 生成文本 + Skill 生成 actionCards]
    N -->|off| Q[LLM 生成文本 + actionCards JSON]
    
    O --> R[contract validate 契约验证]
    P --> R
    Q --> R
    
    R --> S[输出 reply + actionCards]
    
    E --> T[gateCrisis 危机门禁]
    T --> S
    F --> S
```

**关键节点说明**：
- **路由判定**：根据用户消息内容自动判定 `assessment` / `crisis` / `support`
- **缺口检测**：在 `awaiting_followup` 状态下，检测信息缺口（duration/impact/risk/context）
- **门禁与清洗**：`gateAssessment()` 验证区块标题，`sanitizeActionCards()` 清洗步骤格式
- **SKILL_MODE 分流**：根据模式决定 `nextStepsLines` 和 `actionCards` 的来源
- **契约验证**：统一使用 `validateActionCardsContract()` 和 `validateNextStepsLinesContract()`

## SKILL_MODE 三模式对比

| 模式 | 说明 | nextStepsLines 来源 | actionCards 来源 | LLM 生成内容 |
|-----|------|-------------------|-----------------|-------------|
| `off` | 完全走旧逻辑（默认，便于回滚） | LLM | LLM（从 JSON 提取） | 【初筛总结】+【风险与分流】+【下一步清单】+ actionCards JSON |
| `cards_only` | actionCards 来自 skills，文本仍由 LLM 生成 | LLM | **Skill 系统** | 【初筛总结】+【风险与分流】+【下一步清单】 |
| `steps_and_cards` | next steps 文本 + actionCards 都来自 skills（推荐） | **Skill 系统** | **Skill 系统** | 【初筛总结】+【风险与分流】 |

**CI 默认**：`ci:check` 自动使用 `SKILL_MODE=steps_and_cards`，确保验收一致性。

## steps_and_cards 下职责分工

在 `SKILL_MODE=steps_and_cards` 模式下，结论页各输出项的生成来源：

| 输出项 | 生成来源 | 说明 |
|-------|---------|------|
| 【初筛总结】 | LLM | 由 `generateAssessmentConclusion` 调用 LLM 生成（主诉 + 持续时间 + 影响程度 + 自伤念头） |
| 【风险与分流】 | LLM | 由 `generateAssessmentConclusion` 调用 LLM 生成（三选一：crisis/urgent/self-care） |
| 【下一步清单】 | **Skill 系统** | 由 `renderSkills` 生成 `nextStepsLines`（2-3 条），追加到文本 |
| actionCards | **Skill 系统** | 由 `renderSkills` 生成 `actionCards`（2 张），作为独立字段返回 |

**收口机制**：
- LLM Prompt 修改：明确告知 LLM 不需要生成【下一步清单】和 actionCards JSON
- LLM 输出剥离：如果 LLM 仍然生成，使用正则移除
- Skill 系统生成：完全由 Skill 系统生成，确保单一数据源

## Skill 子系统：context → select → render

Skill 子系统负责从用户输入中提取上下文，选择适用的 Skills，并渲染为结构化的输出。

### 流程概览

```mermaid
graph TD
    A[initialMessage + followupAnswer] --> B[extractSkillContext<br/>上下文提取]
    B --> C[SkillSelectionContext<br/>riskLevel/emotion/duration/impact]
    
    C --> D[selectSkills<br/>规则优先选择]
    D --> E{适用性筛选}
    E --> F[匹配分数排序]
    F --> G[选择策略: 稳定化 + 支持/记录]
    G --> H[SkillSelection[]<br/>2个技能 + 槽位值]
    
    H --> I[renderSkills<br/>填槽渲染]
    I --> J[fillSlot<br/>模板字符串替换]
    J --> K[SkillRenderResult<br/>nextStepsLines + actionCard]
    
    K --> L[sanitizeActionCards<br/>清洗步骤]
    L --> M[ensureStepHasMetric<br/>补齐指标]
    M --> N[normalizeStepMetrics<br/>规范化指标]
    
    N --> O[validateSkillOutputContract<br/>契约验证]
    O --> P{验证通过?}
    P -->|是| Q[输出 nextStepsLines + actionCards]
    P -->|否| R[错误日志]
```

### 关键步骤说明

1. **Context 提取**（`lib/skills/context.ts`）
   - 从 `initialMessage` 和 `followupAnswer` 中提取：
     - `riskLevel`: 'low' | 'medium' | 'high' | 'crisis'
     - `emotion`: 'anxiety' | 'depression' | 'anger' | 'sadness' | 'fear' | 'neutral' | 'mixed'
     - `duration`: 'days' | 'weeks' | 'months' | 'uncertain'
     - `impact`: 0-10 数值
     - `hasRiskThoughts`: boolean | undefined

2. **Skill 选择**（`lib/skills/select.ts`）
   - **规则优先**：基于适用性条件（riskLevels、emotions、minImpact 等）筛选
   - **匹配分数**：风险等级匹配 +10，情绪类型匹配 +5，影响程度匹配 +3，标签匹配 +2
   - **选择策略**：
     - 第一选择：稳定化/练习类（breathing、mindfulness、grounding）
     - 第二选择：根据风险等级选择求助/就医类（高风险）或记录/追踪类（中低风险）
   - **返回**：2 个 SkillSelection（skillId + slotValues + reason）

3. **Skill 渲染**（`lib/skills/render.ts`）
   - **填槽**：将模板中的 `{slotName}` 替换为实际值
   - **合并输出**：
     - `nextStepsLines`: 合并所有 skills 的 nextStepsLines（2-3 条）
     - `actionCards`: 合并所有 skills 的 actionCard（2 张）

### 输出字段映射

| Skill 子系统输出 | 最终输出字段 | 说明 |
|----------------|------------|------|
| `nextStepsLines` | `reply` 中的【下一步清单】 | 追加到 LLM 生成的文本后 |
| `actionCards` | `actionCards` | 作为独立字段返回 |

## Contract / Gate / Sanitize 的统一调用点

系统通过统一的 Contract 验证函数，确保 gate/smoke/单测使用同一套规则，实现 **single source of truth**。

### 统一契约验证函数

**位置**：`lib/skills/contract.ts`

| 函数 | 职责 | 验证内容 |
|-----|------|---------|
| `validateActionCardsContract()` | 验证 actionCards 结构 | 数量=2、steps 数量 3-5 条、step 长度≤16 汉字、step 必须含时长/次数/触发器 |
| `validateNextStepsLinesContract()` | 验证 nextStepsLines 格式 | 数量 2-3 条、每条必须含触发器/时长或次数/完成标准 |

### 统一调用点

| 调用位置 | 调用方式 | 说明 |
|---------|---------|------|
| **Gate**（`lib/ai/assessment/gates.ts:175-177`） | `gateActionCardsSteps()` 内部调用 `validateActionCardsContract()` | 运行时门禁校验 |
| **Smoke**（`scripts/run-smoke.ts`） | 直接调用 `validateActionCardsContract()` 和 `validateNextStepsLinesContract()` | 冒烟测试验证 |
| **单测**（`scripts/contract-smoke.ts`、`scripts/contract-edge-smoke.ts`） | 直接调用契约验证函数 | 回归用例和边界用例测试 |

### 统一辅助函数

**位置**：`lib/ai/assessment/sanitize.ts`

| 函数 | 职责 | 说明 |
|-----|------|------|
| `countChineseChars()` | 统一汉字计数逻辑 | gate/sanitize 共用，确保计数一致 |
| `hasMetricToken()` | 统一指标检测逻辑 | 门禁宽口径：识别 ×N次、N分钟、N秒、N组、N轮、N遍、N回，以及现有 条/个/项 |

### Sanitize 流程

**位置**：`lib/ai/assessment/sanitize.ts`

`sanitizeActionCards()` 确保 steps 满足门禁要求：
1. 处理抽象句和违规短句（映射表修复）
2. 确保有时长/次数/触发器（`ensureStepHasMetric`）
3. 缩短超长步骤（≤16 汉字）
4. 规范化指标（`normalizeStepMetrics`）

## 配置与 CI 可追溯性

系统通过 `verify:config` + `ci:check` 串联，确保配置与验收的可追溯性。

### CI 检查串联步骤

`npm run ci:check` 依次执行以下步骤（所有步骤使用 `SKILL_MODE=steps_and_cards`）：

1. **verify:config** - 配置校验
   - 检查 Node/npm 版本
   - 检查 Git 状态（未提交更改警告）
   - 检查 LLM 配置（API Key、Model、API URL、Temperature、Max Tokens）
   - 检查环境变量（SKILL_MODE、GATE_FIX、DEBUG_PROMPTS、CONCLUSION_INCLUDE_HISTORY、SMOKE_CONCLUSION_P50_MS）
   - 支持 `smoke.config.json` 期望配置对比
   - 支持 `SMOKE_STRICT_CONFIG=1` 严格模式

2. **typecheck** - TypeScript 类型检查

3. **validate:skills** - Skill 定义验证
   - 扫描 registry，验证所有 skills 的定义和渲染结果

4. **test:contract** - Contract 回归用例
   - 测试 actionCards 和 nextStepsLines 的契约验证

5. **test:contract:edge** - Contract 边界用例
   - **位置**：在 `test:contract` 之后、`test:strip` 之前执行
   - **目的**：
     - 防止历史 bug 回归（如"完成标准数字误判为 metric"）
     - 验证新增 metric 规则（`\d+次`、`每次\d+分钟/小时`）
     - 边界场景覆盖（英文分号冒号、多种 metric 表达组合等）
   - **失败意味着**：
     - Contract 规则可能被改坏（如 leftPart/rightPart 拆分逻辑出错）
     - Prompt 产出格式漂移（如完成标准格式变化导致拆分失败）
     - 新增的 metric 规则未正确实现

6. **test:strip** - Conclusion 输出剥离回归
   - 验证 LLM 不生成【下一步清单】和 actionCards JSON

7. **smoke** - 冒烟测试
   - 11 用例、多轮对话、性能阈值、crisis/support 路由

**任一步骤失败，整个流程终止。**

### 验收报告

Contract 边界用例测试的集成验收报告已归档：

- 📄 [2025-12-14 Contract Edge CI Acceptance Report](../acceptance/2025-12-14-contract-edge-ci-acceptance.md)
  - 包含 `test:contract:edge` 10/10 测试通过结果
  - 包含 `ci:check` 全链路通过的关键输出片段
  - 作为可追溯的验收证据（含 Git Hash、工作区状态等元信息）

## Phase 5 新增架构组件（2026-01）

### 评估系统
- **问卷引擎** (`lib/ai/assessment/questionnaire.ts`): PHQ-9（情绪健康度）+ GAD-7（压力指数）标准化问卷
- **触发机制**: 用户主动（"了解一下自己"/"测一下"）或系统建议（连续同类情绪话题）
- **评分反馈**: 去医疗化措辞，用"状态"替代"症状"，用"专业支持"替代"心理咨询师"

### 对话状态机
- **状态机** (`lib/ai/dialogue/state-machine.ts`): SCEB 要素收集（Situation/Cognition/Emotion/Behavior）
- **状态分类器** (`lib/ai/agents/state-classifier.ts`): 判断对话进展和要素收集完成度

### 治疗师角色系统
- **角色定义** (`lib/ai/persona/therapist-profiles.ts`): 小温（温暖细腻）、明远（理性清晰）、清和（平和宁静）
- **Onboarding**: 首次对话随机分配，不弹选择器（去医疗化）
- **动态切换**: 用户表达风格偏好时后台自动切换

### 进度追踪
- **追踪器** (`lib/ai/progress/tracker.ts`): 对话次数、情绪趋势、评估历史
- **前端展示** (`app/dashboard/progress/`): "我的状态"页面，用"情绪健康度"/"压力指数"替代临床术语

### Agent 编排
- **Triage Agent** (`lib/ai/agents/triage-agent.ts`): 消息分流（Groq 快速分析）
- **Counselor Agent** (`lib/ai/agents/counselor-agent.ts`): 主对话生成
- **Safety Agent** (`lib/ai/agents/safety-agent.ts`): 安全检查
- **Quality Agent** (`lib/ai/agents/quality-agent.ts`): 回复质量检查

## 产品重定位架构影响（2026-03）

### 双层文案策略
- **用户层**: 所有 UI 文案去医疗化（components/ + app/）
- **系统层**: AI 提示词保留专业术语（lib/ai/prompts.ts 等）
- **原则**: 改表不改里，UI 是"解压搭子"，后台是"CBT 咨询师"

### 功能渐进暴露
- Layer 0-3 分层设计，评估功能不在首屏出现
- 问卷由 AI 温和建议触发，而非用户主动寻找入口

## 下一步演进清单

以下为架构层面的演进方向，不包含 UI 细节：

### 观测/评测
- **Telemetry 接入**：用户行为追踪、性能监控、错误上报
- **Gold Eval 建立**：基于人工标注的评估数据集进行模型评估
- **指标闭环**：首轮对话率、满意度、Skill 命中率、情绪准确率

### 数据闭环
- **用户反馈收集**：基于用户对结论的反馈优化 Skill 选择策略
- **A/B 测试框架**：支持不同 Skill 组合的对比测试
- **数据驱动优化**：基于使用数据优化 Skill 适用性条件

### 隐私与合规
- **数据脱敏**：确保用户隐私数据不被泄露
- **合规审计**：建立合规检查流程，确保符合相关法规
- **数据保留策略**：明确数据保留期限和删除机制

### 稳定性
- **错误恢复**：增强错误处理和恢复机制
- **降级策略**：在 LLM 服务不可用时提供降级方案
- **性能优化**：进一步压缩 LLM 输出（目标 P50 < 8s）
- **并发处理**：支持多用户请求并行处理

## 相关文档

- 📄 [详细架构文档](./current-architecture.md) - 完整的产品架构说明，包含产品能力总览、关键目录与文件职责等
- 📄 [CI 检查流程说明](../ci.md) - CI 检查流程说明、配置对齐指南
- 📄 [Skill 系统维护指南](../skills/MAINTENANCE.md) - Skill 系统的维护和扩展指南
- 📄 [技术决策与部署架构](../../ARCHITECTURE.md) - 技术决策、部署架构、扩展方向
