# 改动总结

## 1. 行动卡片自适应布局与视觉层级

### 改动文件
- `components/chat/ActionCardGrid.tsx`
- `components/chat/ActionCardItem.tsx`
- `components/chat/ConclusionSections.tsx`

### 核心改动

#### 1.1 响应式布局修复
- **ActionCardGrid**: 
  - 添加 `w-full min-w-0` 确保容器不溢出
  - 网格从 `md:grid-cols-2` 改为 `sm:grid-cols-2`，更早响应
  - gap 从 `gap-4` 改为 `gap-3`，更紧凑

- **ActionCardItem**:
  - 添加 `w-full min-w-0` 确保卡片不溢出
  - 标题添加 `break-words` 防止长文本撑爆
  - 按钮在移动端 `w-full`，桌面端 `w-auto self-start`
  - 步骤文本添加 `break-words` 防止溢出

#### 1.2 视觉层级优化
- **ConclusionSections**:
  - 行动建议容器从蓝色渐变改为绿色渐变（`from-green-50 to-emerald-50`）
  - 边框从 `border-blue-200` 改为 `border-green-300`
  - 与提问卡（蓝色）区分，更突出"行动"属性

### 验收点
- ✅ 浏览器 100% 缩放，宽度 1440/1280/1024/768：行动卡片都能完整显示，无需横向滚动
- ✅ 320/375 宽：行动卡片一列，按钮可点，文字不截断到不可读

---

## 2. 行动卡片完成态 + 进度 + 前后测

### 改动文件
- `store/chatStore.ts`
- `components/chat/ActionCardItem.tsx`

### 核心改动

#### 2.1 状态管理
- **chatStore.ts**:
  - 添加 `SkillProgress` 接口：`{ status: 'not_started' | 'in_progress' | 'done', completedSteps: number[] }`
  - 添加 `skillProgress: Record<string, SkillProgress>` 状态
  - 添加 `updateSkillProgress(cardId, progress)` 方法
  - 添加 `getSkillProgress(cardId)` 方法
  - 持久化到 localStorage

#### 2.2 完成态 UI
- **ActionCardItem**:
  - 步骤可勾选（checkbox），点击切换完成状态
  - 完成步骤显示删除线样式
  - 全部完成时显示"✅ 已完成"徽章
  - 完成态显示"再做一次"按钮

#### 2.3 前后测功能
- **前测**：点击"开始练习"时弹出 0-10 量表（可选跳过）
- **后测**：完成所有步骤后弹出 0-10 量表（可选跳过）
- **变化显示**：卡片头部显示前后测变化值（如：7 → 4 (-3)）
- 前后测分数持久化到 localStorage（key: `skill-pretest-${cardId}`, `skill-posttest-${cardId}`）

### 验收点
- ✅ 行动卡片可以标记完成；刷新页面进度不丢
- ✅ 前后测能显示变化值，不影响主聊天流程
- ✅ 完成态卡片显示"已完成"徽章和"再做一次"按钮

---

## 3. 压力场景问答逻辑优化

### 改动文件
- `lib/ai/assessment/question_policy.ts`

### 核心改动

#### 3.1 压力场景判定（收紧）
- **detectStressSlot** 函数优化：
  - 规则1：压力信号 + 工作语境 → 触发
  - 规则2：工作语境 + 身体/睡眠受影响 → 触发
  - 明确排除正向保护词

#### 3.2 自伤问题触发条件（双门槛）
- **shouldAskRiskQuestion** 函数优化：
  - **门槛1**：必须命中明确风险提示词（不想活了/想死/轻生/自残/结束生命/活不下去/计划/方法 等）
  - **门槛2**：且（情绪强度高 >=8 或 已经出现绝望/无助等高危情绪标签）
  - **明确排除**：单纯"压力大/被骂/想辞职/担心裁员" 绝不触发

#### 3.3 苏格拉底式澄清（3步闭环）
- **buildIntakeQuestions** 和 **buildGapFollowupQuestion** 已实现：
  1. 先问具体情境（最近一次最明显的场景是什么？发生了什么？）
  2. 再问当时的自动想法/担心（你脑子里最强烈的念头是什么？最担心的后果是什么？）
  3. 再问影响程度 0–10（对睡眠/工作/社交影响）

### 验收点
- ✅ 输入：「压力很大，被老板骂，担心裁员」→ 先出现苏格拉底澄清问题，不出现自伤问询
- ✅ 输入：「我不想活了」→ 立即进入 crisis/safety 流（原有逻辑保留）
- ✅ 收集到（情境+想法+影响分）→ 进入总结 + 行动卡片，不再重复追问

---

## 4. 修复重复提问/重复卡片

### 改动文件
- `components/chat/ConclusionSections.tsx`

### 核心改动
- **优化文本去重逻辑**：
  - 如果有 actionCards，只显示简短引导语
  - 自动移除已提取的结构化内容（summary、riskTriage、nextStepsLines）
  - 如果剩余文本很短（<50字），作为引导语显示
  - 否则显示默认引导语："以下是一些适合你的行动建议："

### 验收点
- ✅ 有行动卡片时，不再重复显示完整的 reply 文本
- ✅ 只显示简短引导语 + 结构化卡片

---

## 文件清单

### 修改的文件
1. `components/chat/ActionCardGrid.tsx` - 响应式布局
2. `components/chat/ActionCardItem.tsx` - 完成态、进度、前后测
3. `store/chatStore.ts` - 技能进度状态管理
4. `components/chat/ConclusionSections.tsx` - 视觉层级、去重逻辑
5. `lib/ai/assessment/question_policy.ts` - 压力场景问答逻辑

### 新增的类型
- `SkillProgress` 接口（在 `store/chatStore.ts`）

---

## 手工验收步骤

### 1. 行动卡片布局测试
1. 打开浏览器，调整窗口宽度到 1440px、1280px、1024px、768px
2. 输入触发 assessment 的消息（如："我最近压力很大"）
3. 等待出现行动卡片
4. **验证**：行动卡片完整显示，无需横向滚动

### 2. 移动端测试
1. 打开浏览器开发者工具，切换到移动端视图（320px 或 375px）
2. 输入触发 assessment 的消息
3. **验证**：行动卡片一列显示，按钮可点击，文字不截断

### 3. 完成态测试
1. 点击行动卡片的"开始练习"按钮
2. 勾选步骤前的复选框
3. 完成所有步骤
4. **验证**：显示"✅ 已完成"徽章和"再做一次"按钮
5. 刷新页面
6. **验证**：进度不丢失

### 4. 前后测测试
1. 点击"开始练习"，填写前测（如：7）
2. 完成所有步骤，填写后测（如：4）
3. **验证**：卡片头部显示"7 → 4 (-3)"

### 5. 压力场景测试
1. 输入：「压力很大，被老板骂，担心裁员」
2. **验证**：先出现苏格拉底澄清问题（场景+想法），不出现自伤问询
3. 回答场景和想法问题
4. **验证**：进入总结 + 行动卡片，不再重复追问

### 6. 自伤问询测试
1. 输入：「我不想活了」
2. **验证**：立即进入 crisis/safety 流

### 7. 重复卡片测试
1. 触发 assessment conclusion 阶段
2. **验证**：有行动卡片时，只显示简短引导语，不重复显示完整文本

---

## 运行测试

```bash
# 类型检查
npm run typecheck

# 运行 CI 检查（如果配置了）
npm run ci:check
```
