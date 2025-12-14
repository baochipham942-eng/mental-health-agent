# Skill 系统维护指南

## 概述

Skill 系统用于提升评估结论（conclusion）的 next steps 和 actionCards 输出一致性。本文档说明如何根据门禁失败/日志发现的问题，回写到 Skill 定义中。

## 如何发现问题

### 1. 查看日志

Skill 系统会在以下情况下输出日志：

- **选择日志**：`[Skill] Mode: <mode>, Selected skills: <ids>, Reasons: <reasons>`
- **槽位值日志**：在 `DEBUG_PROMPTS=1` 时，`debugPrompts.slotValues` 包含实际使用的槽位值

### 2. 查看门禁失败

当 `GATE_FIX !== '0'` 时，如果门禁失败，会输出：

```
[Gate] Assessment conclusion failed, missing: <missing items>
[Gate] ActionCards steps 门禁失败详情：
  - 卡片 X 步骤 Y:
    原文: "<original step>"
    sanitize后: "<sanitized step>"
    失败原因: <reason>
```

### 3. 运行验证脚本

```bash
npm run validate:skills
```

该脚本会：
- 验证所有 Skill 定义的正确性
- 验证每个 Skill 的渲染结果是否符合约束
- 输出详细的错误和警告信息

## 如何修复问题

### 修复步骤示例

#### 场景 1：actionCards steps 长度超限

**问题**：门禁失败，显示"步骤长度超限（18字 > 16字）"

**修复**：
1. 找到对应的 Skill（通过 `selectedSkillIds` 日志）
2. 打开 `lib/skills/registry.ts`
3. 找到该 Skill 的 `templates.actionCard.steps`
4. 缩短超长的步骤文本（压缩虚词、使用更短格式）
5. 运行 `npm run validate:skills` 验证

**示例**：
```typescript
// 修复前
steps: [
  '进行深度呼吸练习持续5分钟时间',
  // ...
]

// 修复后
steps: [
  '深呼吸5分钟',
  // ...
]
```

#### 场景 2：步骤缺少次数/时长

**问题**：门禁失败，显示"缺少时长/次数/触发器"

**修复**：
1. 找到对应的 Skill 步骤
2. 确保步骤包含明确的次数或时长指标
3. 对于"写下/记录/标记"类动作，必须包含 `×N次` 或 `N分钟`

**示例**：
```typescript
// 修复前
steps: [
  '写下3条担心',
  // ...
]

// 修复后
steps: [
  '写下3条担心×1次',
  // ...
]
```

#### 场景 3：nextStepsLines 缺少触发器或完成标准

**问题**：门禁失败，显示"清单条数不符合要求"或"缺少触发器/完成标准"

**修复**：
1. 找到对应的 Skill 的 `templates.nextStepsLines`
2. 确保每条包含：
   - 触发器（当...时/每晚睡前/白天任意时段）
   - 次数/时长指标
   - 完成标准（至少...次/至少...天/至少...晚）

**示例**：
```typescript
// 修复前
nextStepsLines: [
  '进行呼吸练习5次，持续7天',
]

// 修复后
nextStepsLines: [
  '当焦虑情绪出现时，进行呼吸练习5次，持续7天；完成标准：至少5次。',
]
```

#### 场景 4：Skill 选择不合适

**问题**：日志显示选中的 Skill 与实际情况不匹配

**修复**：
1. 检查 `lib/skills/select.ts` 中的选择逻辑
2. 或调整 Skill 的 `applicability` 条件（`lib/skills/registry.ts`）
3. 或调整槽位默认值

**示例**：
```typescript
// 如果某个 Skill 应该在高影响时被选中，但实际没有被选中
applicability: {
  riskLevels: ['medium'],
  minImpact: 6, // 可能需要降低到 5
}
```

## 验证修复

修复后，运行：

```bash
# 验证 Skill 定义
npm run validate:skills

# 运行冒烟测试（如果修改了结论生成逻辑）
npm run smoke
```

## 如何新增一个 Skill

### 步骤 1：定义 Skill

在 `lib/skills/registry.ts` 的 `SKILLS` 数组中添加新 Skill：

```typescript
{
  id: 'your-skill-id',
  name: '技能名称',
  description: '技能描述',
  tags: ['tag1', 'tag2'],
  applicability: {
    riskLevels: ['low', 'medium'],
    emotions: ['anxiety'],
    minImpact: 4,
  },
  slots: [
    { name: 'slot1', description: '槽位1', type: 'count', defaultValue: '3' },
  ],
  templates: {
    nextStepsLines: [
      '当需要时，执行操作{slot1}次；完成标准：至少3次。',
    ],
    actionCard: {
      title: '卡片标题',
      steps: [
        '步骤1{slot1}次',
        '步骤2{slot1}次',
        '步骤3{slot1}次',
      ],
      when: '触发时机',
      effort: 'low',
    },
  },
}
```

### 步骤 2：验证

```bash
npm run validate:skills
```

### 步骤 3：测试

在开发环境中测试，确保：
- Skill 能被正确选择
- 渲染结果符合门禁要求
- 与现有流程兼容

## 约束检查清单

在修改或新增 Skill 时，确保：

- [ ] steps 数量 = 3-5 条
- [ ] 每条 step ≤ 16 个汉字（只计汉字）
- [ ] 每条 step 必须包含时长/次数/触发器
- [ ] "写下/记录/标记"类步骤必须包含 `×N次` 或 `N分钟`
- [ ] nextStepsLines 每条包含触发器 + 次数/时长 + 完成标准
- [ ] 槽位引用 `{slotName}` 必须在 `slots` 中定义
- [ ] actionCards 数量必须 = 2（由 renderSkills 保证）

## 常见问题

### Q: 为什么 Skill 没有被选中？

A: 检查 `lib/skills/select.ts` 中的选择逻辑，或 Skill 的 `applicability` 条件是否过于严格。

### Q: 槽位值从哪里来？

A: 槽位值由 `select.ts` 的 `generateSlotValues` 函数生成，优先使用 Skill 定义的 `defaultValue`，如果没有则根据槽位类型推断。

### Q: 如何调试 Skill 选择？

A: 设置 `DEBUG_PROMPTS=1`，查看 `debugPrompts.selectedSkillIds` 和 `debugPrompts.selectionReason`。

### Q: 如何临时禁用某个 Skill？

A: 在 `lib/skills/registry.ts` 中注释掉该 Skill，或修改其 `applicability` 使其永远不会被选中。
