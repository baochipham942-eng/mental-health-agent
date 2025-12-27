# Skill 系统变更摘要

## 概述

本次变更为"心理评估 assistant"引入了可维护的 Skill 体系，以提升输出一致性，并让 Skill 后续可持续学习与维护。

## 变更文件列表

### 新增文件

1. **lib/skills/types.ts** - Skill 类型定义
2. **lib/skills/registry.ts** - Skill 注册表（包含 8 个 skills）
3. **lib/skills/validate.ts** - Skill 验证模块
4. **lib/skills/select.ts** - Skill 选择模块（基于规则）
5. **lib/skills/render.ts** - Skill 渲染模块（填槽和输出）
6. **lib/skills/context.ts** - 上下文提取模块
7. **scripts/validate-skills.ts** - Skill 验证脚本
8. **docs/skills/MAINTENANCE.md** - Skill 维护指南

### 修改文件

1. **lib/ai/assessment/conclusion.ts** - 接入 Skill 系统，支持 SKILL_MODE 环境变量
2. **package.json** - 新增 `validate:skills` 命令
3. **env.example** - 添加 SKILL_MODE 配置说明

## 关键设计点

### 1. Skill 选择（select.ts）

- **规则优先**：基于 riskLevel、emotion、duration、impact 等上下文信息
- **确定性**：尽量保证相同输入产生相同输出
- **策略**：优先选择稳定化/练习类技能 + 记录/求助/就医准备类技能

### 2. Skill 渲染（render.ts）

- **填槽机制**：使用 `{slotName}` 占位符，运行时替换为实际值
- **输出保证**：
  - nextStepsLines: 2-3 条（合并多个 skills）
  - actionCards: 固定 2 张
  - 每张卡片 steps: 3-5 条
  - 每条 step ≤ 16 个汉字

### 3. Skill 验证（validate.ts）

- **定义验证**：检查槽位引用、必需字段、模板格式
- **渲染验证**：
  - 步骤数量（3-5 条）
  - 汉字计数（≤16 字）
  - 动词必须带指标（×N次/N分钟）
  - nextStepsLines 格式（触发器+指标+完成标准）

## 如何新增一个 Skill

### 步骤 1：在 registry.ts 中添加定义

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

### 步骤 2：运行验证

```bash
npm run validate:skills
```

### 步骤 3：测试

确保 Skill 能被正确选择、渲染，并符合门禁要求。

## 使用说明

### 环境变量

- `SKILL_MODE=off` - 完全走旧逻辑（默认）
- `SKILL_MODE=cards_only` - actionCards 来自 skills，文本仍由 LLM 生成
- `SKILL_MODE=steps_and_cards` - next steps 文本 + actionCards 都来自 skills（推荐）

### 验证命令

```bash
npm run validate:skills
```

### 调试

设置 `DEBUG_PROMPTS=1` 查看：
- `debugPrompts.selectedSkillIds` - 选中的 Skill ID
- `debugPrompts.selectionReason` - 选择原因
- `debugPrompts.slotValues` - 槽位值

## 本地测试结果

### npm run validate:skills

```
✅ 所有验证通过
  Skill 定义错误: 0
  Skill 定义警告: 0
  Skill 渲染错误: 0
  Skill 渲染警告: 8（每个 Skill 的 nextStepsLines 只有 1 条是正常的，因为 renderSkills 会合并多个 Skills）
```

### TypeScript 编译

```
✅ 编译通过，无错误
```

## 注意事项

1. **最小改动原则**：仅在 conclusion 生成链路接入 Skill pipeline，未重构现有流程
2. **向后兼容**：默认 `SKILL_MODE=off`，保持现有行为
3. **门禁保证**：Skill 输出必须通过现有 gate/sanitize 逻辑
4. **可持续维护**：提供验证脚本和维护文档，便于后续扩展

## 后续扩展

- 可以添加更多 Skills（如运动、社交、睡眠等）
- 可以优化选择逻辑（如使用机器学习）
- 可以根据使用情况调整 Skill 定义和槽位值
