# 心理疗愈产品当前产品架构说明

> 本文档基于当前代码仓库实现现状整理，用于团队对齐与后续迭代。

## 目录

1. [产品能力总览](#1-产品能力总览)
2. [核心模块架构](#2-核心模块架构)
3. [关键目录与文件职责](#3-关键目录与文件职责)
4. [三个"收口动作"如何保证一致性](#4-三个收口动作如何保证一致性)
5. [运行模式与开关](#5-运行模式与开关)
6. [当前已覆盖的测试与保障](#6-当前已覆盖的测试与保障)
7. [已知限制与下一步](#7-已知限制与下一步)

---

## 1. 产品能力总览

### 1.1 支持的路由/模式

产品支持三种路由类型，根据用户消息内容自动判定：

| 路由类型 | 触发条件 | 处理逻辑 |
|---------|---------|---------|
| **assessment** | 默认路由，用户进行心理评估 | 首轮对话 → 追问 → 结论 |
| **crisis** | 包含明确自伤/自杀关键词（如"想死"、"自杀"、"准备好了方式"等） | 立即触发危机干预流程 |
| **support** | 用户明确表达"只想倾诉"、"不要建议"等 | 提供支持性倾听，不进行分析 |

### 1.2 用户旅程（Assessment 路由）

Assessment 路由的用户旅程包含以下状态流转：

```
用户首轮消息
    ↓
[intake] 生成 1-2 个自适应评估问题
    ↓
state: awaiting_followup
    ↓
用户回答
    ↓
[gap_followup] 检测信息缺口 → 继续追问（如有缺口）
    OR
[conclusion] 无缺口 → 生成评估结论
    ↓
state: normal
```

**状态说明**：

| 状态 | 说明 | assessmentStage |
|-----|------|----------------|
| `awaiting_followup` | 等待用户回答评估问题 | `intake` 或 `gap_followup` |
| `normal` | 正常对话状态 | `conclusion` |

**AssessmentStage 说明**：

| 阶段 | 说明 | 输出内容 |
|-----|------|---------|
| `intake` | 首轮对话，生成评估问题 | 1-2 个自适应问题 |
| `gap_followup` | 检测到信息缺口，继续追问 | 1 个缺口问题 |
| `conclusion` | 生成评估结论 | 初筛总结 + 风险分流 + 下一步清单 + actionCards |

### 1.3 结论页输出结构

在 `conclusion` 阶段，系统输出以下结构：

#### 【初筛总结】
- **内容**：主诉 + 持续时间 + 影响程度（X/10）+ 自伤念头
- **长度**：≤2 行
- **示例**：你提到焦虑持续2周，影响程度：7/10，无自伤念头。

#### 【风险与分流】
- **内容**：三选一（必须只选一个）
  - `危机（crisis）`：有明确自杀计划
  - `建议尽快专业评估（urgent）`：影响≥7分 或 持续≥2周 或 有自伤念头
  - `可先自助观察（self-care）`：影响≤3分 且 无自伤念头
- **长度**：≤2 行

#### 【下一步清单】
- **数量**：2-3 条
- **格式要求**（每条必须包含）：
  - ✅ 触发器（如"当…时/每晚睡前/白天任意时段"）
  - ✅ 时长或次数（如"3分钟"、"×5次"、"持续7天"）
  - ✅ 完成标准（如"至少5晚"、"至少记录2次"）
- **生成来源**：
  - `SKILL_MODE=steps_and_cards`：**完全由 Skill 系统生成**（LLM 不生成此部分）
  - `SKILL_MODE=off` 或 `cards_only`：由 LLM 生成

#### actionCards
- **数量**：2 张
- **结构**：
  ```typescript
  {
    title: string;        // 标题（≤8字）
    steps: string[];      // 步骤数组（3-5条，每条≤16汉字）
    when: string;         // 触发时机
    effort: 'low' | 'medium' | 'high';  // 难度
  }
  ```
- **生成来源**：
  - `SKILL_MODE=steps_and_cards` 或 `cards_only`：**完全由 Skill 系统生成**
  - `SKILL_MODE=off`：由 LLM 生成（需从 JSON 中提取）

**SKILL_MODE=steps_and_cards 下的职责分工**：

| 输出项 | 生成来源 | 说明 |
|-------|---------|------|
| 【初筛总结】 | LLM | 由 `generateAssessmentConclusion` 调用 LLM 生成 |
| 【风险与分流】 | LLM | 由 `generateAssessmentConclusion` 调用 LLM 生成 |
| 【下一步清单】 | **Skill 系统** | 由 `renderSkills` 生成 `nextStepsLines`，追加到文本 |
| actionCards | **Skill 系统** | 由 `renderSkills` 生成 `actionCards`，作为独立字段返回 |

---

## 2. 核心模块架构

### 2.1 请求链路图

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

### 2.2 Skill 子系统图

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

**Skill 子系统流程说明**：

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

4. **清洗与验证**（`lib/ai/assessment/sanitize.ts` + `lib/skills/contract.ts`）
   - **sanitizeActionCards**：确保 steps 满足门禁要求
     - 处理抽象句和违规短句（映射表修复）
     - 确保有时长/次数/触发器（`ensureStepHasMetric`）
     - 缩短超长步骤（≤16 汉字）
     - 规范化指标（`normalizeStepMetrics`）
   - **validateSkillOutputContract**：统一契约验证
     - `validateActionCardsContract`：验证 actionCards 结构
     - `validateNextStepsLinesContract`：验证 nextStepsLines 格式

---

## 3. 关键目录与文件职责

### 3.1 Skill 系统核心文件

| 文件路径 | 职责 | 关键函数/类型 |
|---------|------|--------------|
| `lib/skills/types.ts` | Skill 系统类型定义 | `Skill`, `SkillSelectionContext`, `SkillSelection`, `SkillRenderResult` |
| `lib/skills/registry.ts` | Skill 注册表（8 个 skills） | `SKILLS[]`, `getSkillById()`, `getAllSkills()` |
| `lib/skills/context.ts` | 上下文提取 | `extractSkillContext()` |
| `lib/skills/select.ts` | Skill 选择（规则优先） | `selectSkills()` |
| `lib/skills/render.ts` | Skill 渲染（填槽） | `renderSkill()`, `renderSkills()` |
| `lib/skills/validate.ts` | Skill 定义与渲染验证 | `validateSkillDefinition()`, `validateSkillRenderResult()` |
| `lib/skills/contract.ts` | 结构契约验证（统一 gate/smoke/单测规则） | `validateActionCardsContract()`, `validateNextStepsLinesContract()` |

**8 个 Skills 列表**：

| Skill ID | 名称 | 适用风险等级 | 适用情绪 | 标签 |
|---------|------|------------|---------|------|
| `breathing-relaxation` | 呼吸放松 | low, medium | anxiety, fear | breathing, relaxation, grounding |
| `mindfulness-grounding` | 正念觉察 | low, medium | anxiety, depression, mixed | mindfulness, grounding |
| `emotion-tracking` | 情绪记录 | low, medium | anxiety, depression, mixed | tracking, journaling |
| `thought-recording` | 想法记录 | low, medium | anxiety, depression | cognition, journaling |
| `body-awareness` | 身体觉察 | low, medium | anxiety, fear, mixed | grounding, body |
| `support-preparation` | 求助准备 | medium | depression, anxiety, mixed | support, social |
| `medical-preparation` | 就医准备 | high | depression, anxiety, mixed | medical, urgent |
| `crisis-stabilization` | 紧急稳定化 | high, crisis | anxiety, depression, mixed | crisis, urgent |

### 3.2 Assessment 流程核心文件

| 文件路径 | 职责 | 关键函数 |
|---------|------|---------|
| `lib/ai/assessment/gates.ts` | 门禁校验（区块标题/清单/actionCards） | `gateAssessment()`, `gateActionCardsSteps()`, `gateCrisis()` |
| `lib/ai/assessment/sanitize.ts` | actionCards 清洗（补齐指标/缩短/规范化） | `sanitizeActionCards()`, `ensureStepHasMetric()`, `normalizeStepMetrics()` |
| `lib/ai/assessment/conclusion.ts` | 生成评估结论（剥离 LLM 误输出，支持 JSON 残片） | `generateAssessmentConclusion()` |
| `lib/ai/assessment/gap.ts` | 缺口检测 | `detectGap()`, `parseRiskLevel()` |

### 3.3 脚本文件

| 文件路径 | 职责 | 运行命令 |
|---------|------|---------|
| `scripts/validate-skills.ts` | Skill 定义与渲染校验 | `npm run validate:skills` |
| `scripts/contract-smoke.ts` | Contract 回归用例测试 | `npm run test:contract` |
| `scripts/contract-edge-smoke.ts` | Contract 边界用例测试（防止历史 bug 回归） | `npm run test:contract:edge` |
| `scripts/conclusion-strip-smoke.ts` | LLM 输出剥离回归用例 | `npm run test:strip` |
| `scripts/verify-smoke-config.ts` | 配置与验收收口（验证环境变量/版本/LLM 配置） | `npm run verify:config` |
| `scripts/run-smoke.ts` | 冒烟测试（11 用例、多轮、性能阈值、crisis/support） | `npm run smoke` |

### 3.4 配置文件

| 文件路径 | 职责 |
|---------|------|
| `docs/ci.md` | CI 检查流程说明、配置对齐指南 |
| `env.example` | 环境变量示例（SKILL_MODE、GATE_FIX、DEBUG_PROMPTS 等） |
| `package.json` | 脚本命令定义（`ci:check` 串联所有检查） |

---

## 4. 三个"收口动作"如何保证一致性

### 4.1 输出来源收口

**目标**：`steps_and_cards` 模式下，`nextStepsLines` 和 `actionCards` 只来自 Skill 渲染。

**实现机制**：

1. **LLM Prompt 修改**（`lib/ai/assessment/conclusion.ts:272-278`）
   - 在 `SKILL_MODE=steps_and_cards` 模式下，修改 system prompt，明确告知 LLM 不需要生成【下一步清单】和 actionCards JSON

2. **LLM 输出剥离**（`lib/ai/assessment/conclusion.ts:301-305`）
   - 如果 LLM 仍然生成了【下一步清单】，使用正则移除：`textPart.replace(/【下一步清单】[\s\S]*?(?=【|$)/g, '')`
   - 如果 LLM 仍然生成了 actionCards JSON，使用 `removeActionCardsFromReply()` 移除

3. **Skill 系统生成**（`lib/ai/assessment/conclusion.ts:307-319`）
   - 使用 `renderSkills()` 生成 `nextStepsLines` 和 `actionCards`
   - 将 `nextStepsLines` 追加到 `textPart`（格式化为【下一步清单】）
   - 使用 Skill 生成的 `actionCards` 作为最终输出

**验证**：
- `test:strip` 脚本专门测试 LLM 输出剥离逻辑，确保 LLM 不生成这些内容

### 4.2 结构契约收口

**目标**：gate/smoke/单测使用统一的契约验证规则。

**实现机制**：

1. **统一契约验证函数**（`lib/skills/contract.ts`）
   - `validateActionCardsContract()`：验证 actionCards 结构（数量、steps 数量、step 长度、step 指标）
   - `validateNextStepsLinesContract()`：验证 nextStepsLines 格式（数量、触发器、时长/次数、完成标准）

2. **统一调用点**：
   - **Gate**（`lib/ai/assessment/gates.ts:175-177`）：`gateActionCardsSteps()` 内部调用 `validateActionCardsContract()`
   - **Smoke**（`scripts/run-smoke.ts`）：直接调用 `validateActionCardsContract()` 和 `validateNextStepsLinesContract()`
   - **单测**（`scripts/contract-smoke.ts`、`scripts/contract-edge-smoke.ts`）：直接调用契约验证函数

3. **统一辅助函数**（`lib/ai/assessment/sanitize.ts`）
   - `countChineseChars()`：统一汉字计数逻辑
   - `hasMetricToken()`：统一指标检测逻辑（门禁宽口径）

**验证**：
- `test:contract` 和 `test:contract:edge` 确保契约规则正确性
- `test:contract:edge` 专门覆盖边界场景（如"完成标准数字误判为 metric"的历史坑）

### 4.3 配置与验收收口

**目标**：`verify:config` + `ci:check` 串联所有关键检查。

**实现机制**：

1. **配置校验**（`scripts/verify-smoke-config.ts`）
   - 检查 Node/npm 版本
   - 检查 Git 状态（未提交更改警告）
   - 检查 LLM 配置（API Key、Model、API URL、Temperature、Max Tokens）
   - 检查环境变量（SKILL_MODE、GATE_FIX、DEBUG_PROMPTS、CONCLUSION_INCLUDE_HISTORY、SMOKE_CONCLUSION_P50_MS）
   - 支持 `smoke.config.json` 期望配置对比
   - 支持 `SMOKE_STRICT_CONFIG=1` 严格模式

2. **CI 检查串联**（`package.json:ci:check`）
   ```bash
   npm run ci:check
   # 依次执行：
   # 1. verify:config - 配置校验
   # 2. typecheck - TypeScript 类型检查
   # 3. validate:skills - Skill 定义验证
   # 4. test:contract - Contract 回归用例
   # 5. test:contract:edge - Contract 边界用例
   # 6. test:strip - Conclusion 输出剥离回归
   # 7. smoke - 冒烟测试
   ```
   - 所有步骤使用 `cross-env SKILL_MODE=steps_and_cards` 确保模式一致
   - 任一步骤失败，整个流程终止

**验证**：
- `ci:check` 在每次提交前运行，确保所有检查通过
- `SMOKE_STRICT_CONFIG=1` 在 CI 环境中使用，确保配置完全一致

---

## 5. 运行模式与开关

### 5.1 SKILL_MODE 模式

| 模式 | 说明 | nextStepsLines 来源 | actionCards 来源 | LLM 生成内容 |
|-----|------|-------------------|-----------------|-------------|
| `off` | 完全走旧逻辑（默认，便于回滚） | LLM | LLM（从 JSON 提取） | 【初筛总结】+【风险与分流】+【下一步清单】+ actionCards JSON |
| `cards_only` | actionCards 来自 skills，文本仍由 LLM 生成 | LLM | **Skill 系统** | 【初筛总结】+【风险与分流】+【下一步清单】 |
| `steps_and_cards` | next steps 文本 + actionCards 都来自 skills（推荐） | **Skill 系统** | **Skill 系统** | 【初筛总结】+【风险与分流】 |

**设置方式**：
```bash
# .env.local
SKILL_MODE=steps_and_cards
```

**CI 默认**：`ci:check` 自动使用 `SKILL_MODE=steps_and_cards`

### 5.2 其他环境变量

| 环境变量 | 说明 | 默认值 | 用途 |
|---------|------|--------|------|
| `GATE_FIX` | 门禁修复开关 | `enabled`（`!== '0'`） | 控制是否在门禁失败时触发修复 LLM 调用 |
| `DEBUG_PROMPTS` | 调试提示词开关 | `[未设置]` | 设置为 `1` 时，返回 `debugPrompts` 字段（包含 systemPrompt、userPrompt、selectedSkillIds 等） |
| `SMOKE_STRICT_CONFIG` | 配置校验严格模式 | `[未设置]` | 设置为 `1` 时，任何配置差异都会导致 `verify:config` 失败 |
| `SMOKE_CONCLUSION_P50_MS` | 性能阈值（P50 total，毫秒） | `9500` | 冒烟测试中，如果 P50 超过此阈值，测试失败 |
| `CONCLUSION_INCLUDE_HISTORY` | 结论生成是否包含历史 | `[未设置]`（默认不包含） | 设置为 `1` 时，`generateAssessmentConclusion` 会包含 `history` 参数 |

**设置方式**：
```bash
# .env.local
GATE_FIX=1                    # 启用门禁修复（默认）
DEBUG_PROMPTS=1               # 启用调试提示词
SMOKE_STRICT_CONFIG=1         # 启用严格模式
SMOKE_CONCLUSION_P50_MS=9500  # 性能阈值
CONCLUSION_INCLUDE_HISTORY=1  # 包含历史
```

---

## 6. 当前已覆盖的测试与保障

### 6.1 测试脚本概览

| 测试脚本 | 命令 | 覆盖内容 | 说明 |
|---------|------|---------|------|
| `validate:skills` | `npm run validate:skills` | Skill 定义校验 vs 渲染校验 | 扫描 registry，验证所有 skills 的定义和渲染结果 |
| `test:contract` | `npm run test:contract` | Contract 回归用例 | 测试 actionCards 和 nextStepsLines 的契约验证 |
| `test:contract:edge` | `npm run test:contract:edge` | Contract 边界用例 | 防止历史 bug 回归（如"完成标准数字误判为 metric"） |
| `test:strip` | `npm run test:strip` | LLM 输出剥离 | 验证 LLM 不生成【下一步清单】和 actionCards JSON |
| `smoke` | `npm run smoke` | 冒烟测试 | 11 用例、多轮对话、性能阈值、crisis/support 路由 |

### 6.2 冒烟测试详情

**测试用例**（`tests/cases.json`）：
- 11 个测试用例，覆盖：
  - Assessment 路由（首轮、追问、结论）
  - Crisis 路由（高风险表达）
  - Support 路由（只想倾诉）
  - 多轮对话场景

**验证项**：
1. **路由类型**：验证 `routeType` 是否正确
2. **状态流转**：验证 `state` 和 `assessmentStage` 是否正确
3. **结论结构**：验证【初筛总结】、【风险与分流】、【下一步清单】是否存在
4. **actionCards 契约**：使用 `validateActionCardsContract()` 验证
5. **nextStepsLines 契约**：使用 `validateNextStepsLinesContract()` 验证
6. **性能阈值**：P50 total ≤ `SMOKE_CONCLUSION_P50_MS`（默认 9500ms）
7. **Crisis 门禁**：使用 `gateCrisis()` 验证危机场景输出

**性能监控**：
- 记录 `perf` 数据（`llm_main`、`parse`、`gate_text`、`gate_cards`、`sanitize`、`repair`）
- P50 阈值检查（默认 9500ms）

### 6.3 Contract 边界用例测试

**目的**：
1. **防止历史 bug 回归**：专门测试"完成标准(rightPart)数字误判为 metric"的历史坑
2. **验证新增 metric 规则**：测试新增的 metric 识别规则（`\d+次`、`每次\d+分钟/小时`）
3. **边界场景覆盖**：测试各种边界情况（英文分号冒号、多种 metric 表达组合等）

**测试用例**（`scripts/contract-edge-smoke.ts`）：
- 10 个边界用例，覆盖：
  - 完成标准中的数字不应误判为 metric
  - 多种 metric 表达（`\d+次`、`每次\d+分钟`、`×\d+次` 等）
  - 英文分号冒号的完成标准格式
  - 完成标准有数字但主句也有 metric 的情况

---

## 7. 已知限制与下一步

### 7.1 当前限制

#### 指标闭环暂缓
以下指标闭环功能暂缓，等页面之后再做：
- **首轮对话率**：用户完成首轮对话的比例
- **满意度**：用户对结论的满意度评分
- **Skill 命中率**：Skill 选择与实际用户行为的匹配度
- **情绪准确率**：情绪分析准确率

**原因**：需要前端页面完成后再接入 telemetry 和 gold eval。

#### 前端体验完成后再接
- **Telemetry**：用户行为追踪、性能监控、错误上报
- **Gold Eval**：基于人工标注的评估数据集进行模型评估

**计划占位**：
- 前端页面完成后，接入 telemetry SDK（如 Sentry、Mixpanel）
- 建立 gold eval 数据集（人工标注 100+ 评估结论样本）
- 实现自动化评估流程（对比模型输出与 gold standard）

### 7.2 下一步计划

#### 短期（1-2 周）
1. **完善 Skill 系统**
   - 增加更多 Skills（如"睡眠改善"、"社交技能"等）
   - 优化 Skill 选择策略（基于用户反馈调整权重）
   - 支持 Skill 版本管理（追踪 Skill 更新历史）

2. **优化性能**
   - 进一步压缩 LLM 输出（目标 P50 < 8s）
   - 优化 sanitize 和 gate 逻辑（减少计算开销）
   - 支持并发处理（多用户请求并行）

3. **增强测试覆盖**
   - 增加更多边界用例（如超长输入、特殊字符等）
   - 增加集成测试（端到端流程测试）
   - 增加性能测试（压力测试、并发测试）

#### 中期（1-2 月）
1. **前端页面开发**
   - 完成评估结论页面 UI
   - 实现 actionCards 交互（步骤完成、进度追踪）
   - 实现多轮对话界面优化

2. **指标闭环**
   - 接入 telemetry（用户行为追踪）
   - 建立 gold eval 数据集
   - 实现自动化评估流程

3. **功能扩展**
   - 支持用户自定义 Skills
   - 支持 Skill 推荐（基于历史数据）
   - 支持多语言（英文、繁体中文等）

#### 长期（3-6 月）
1. **智能化提升**
   - 基于用户反馈优化 Skill 选择策略（强化学习）
   - 个性化 Skill 推荐（基于用户画像）
   - 自适应难度调整（根据用户完成情况调整 effort）

2. **生态建设**
   - 开放 Skill 插件系统（第三方开发者可贡献 Skills）
   - 建立 Skill 市场（用户可选择安装 Skills）
   - 建立 Skill 评估体系（用户评分、使用率等）

---

## 附录

### A. 如何阅读本文档

1. **快速了解产品能力**：阅读 [1. 产品能力总览](#1-产品能力总览)
2. **理解系统架构**：阅读 [2. 核心模块架构](#2-核心模块架构)（配合 Mermaid 图）
3. **定位代码文件**：阅读 [3. 关键目录与文件职责](#3-关键目录与文件职责)
4. **理解一致性保障**：阅读 [4. 三个"收口动作"如何保证一致性](#4-三个收口动作如何保证一致性)
5. **配置与测试**：阅读 [5. 运行模式与开关](#5-运行模式与开关) 和 [6. 当前已覆盖的测试与保障](#6-当前已覆盖的测试与保障)
6. **了解限制与计划**：阅读 [7. 已知限制与下一步](#7-已知限制与下一步)

### B. 相关文档

- [架构总览](./OVERVIEW.md) - 系统端到端架构单页总览
- [CI 检查流程说明](../ci.md) - CI 检查流程说明、配置对齐指南
- [Skill 系统维护指南](../skills/MAINTENANCE.md) - Skill 系统的维护和扩展指南
- [Skill 系统变更日志](../../SKILL_SYSTEM_CHANGELOG.md) - Skill 系统的变更历史

### C. 变更记录

| 日期 | 变更内容 | 作者 |
|-----|---------|------|
| 2025-01-15 | 初始版本 | - |
