# 文档索引

> 欢迎来到心理疗愈产品文档中心。本文档提供清晰的阅读路径，帮助新人快速上手、定位问题、验收测试和追溯历史。

## 📖 阅读顺序

### 🚀 5 分钟快速上手

适合：第一次接触项目，需要快速了解系统如何工作

1. **[架构总览](./architecture/OVERVIEW.md)** - 单页架构总览
   - 系统边界与核心目标
   - 请求链路图
   - SKILL_MODE 三模式对比
   - Skill 子系统概览

### 📚 30 分钟深入理解

适合：需要理解系统细节，准备开始开发或调试

1. **[架构总览](./architecture/OVERVIEW.md)** - 先看总览建立整体认知
2. **[详细架构文档](./architecture/current-architecture.md)** - 深入了解产品能力、模块架构、文件职责
3. **[CI 检查流程](./ci.md)** - 了解如何运行测试、配置环境、验收标准

### 🔍 深入探索

适合：需要维护系统、扩展功能、排查问题

1. **[详细架构文档](./architecture/current-architecture.md)** - 完整的产品架构说明
2. **[Skill 系统维护指南](./skills/MAINTENANCE.md)** - Skill 系统的维护和扩展
3. **[CI 检查流程](./ci.md)** - 完整的 CI 检查流程和配置对齐指南
4. **[验收报告索引](./acceptance/README.md)** - 重要功能集成的验收记录

## 📁 文档目录

### 架构文档

- **[架构总览](./architecture/OVERVIEW.md)** - 系统端到端架构单页总览
  - 请求链路、Skill 系统、Contract/Gate、配置与 CI 可追溯性
- **[详细架构文档](./architecture/current-architecture.md)** - 完整的产品架构说明
  - 产品能力总览、核心模块架构、关键目录与文件职责、收口动作、运行模式与开关、测试与保障

### 开发与测试

- **[CI 检查流程](./ci.md)** - CI 检查流程说明、配置对齐指南
  - `verify:config` + `ci:check` 串联步骤
  - `test:contract:edge` 在 CI 中的位置和失败含义
  - 环境变量配置、验收报告链接

### 系统维护

- **[Skill 系统维护指南](./skills/MAINTENANCE.md)** - Skill 系统的维护和扩展指南
  - Skill 定义、选择策略、渲染流程
  - 如何添加新 Skill、调试技巧

### 验收记录

- **[验收报告索引](./acceptance/README.md)** - 重要功能集成的验收记录
  - Contract 边界用例测试集成验收报告
  - 可追溯的验收证据（含 Git Hash、工作区状态等元信息）

## ❓ 常见问题入口

### 环境配置

**Q: 如何配置 DEEPSEEK_API_KEY？**

A: 在项目根目录创建 `.env.local` 文件，添加：
```bash
DEEPSEEK_API_KEY=your_api_key_here
```
详细说明见 [CI 检查流程 - 必须的 Secret 配置](./ci.md#必须的-secret-配置)

**Q: SKILL_MODE 是什么？如何设置？**

A: `SKILL_MODE` 控制 Skill 系统的使用模式：
- `off`: 完全走旧逻辑（默认）
- `cards_only`: actionCards 来自 skills，文本仍由 LLM 生成
- `steps_and_cards`: next steps 文本 + actionCards 都来自 skills（推荐）

设置方式：在 `.env.local` 中添加 `SKILL_MODE=steps_and_cards`

详细说明见 [架构总览 - SKILL_MODE 三模式对比](./architecture/OVERVIEW.md#skill_mode-三模式对比)

**Q: SMOKE_STRICT_CONFIG 是什么？**

A: 配置校验严格模式。设置为 `1` 时，任何配置差异都会导致 `verify:config` 失败。

使用场景：在 CI 环境中使用，确保配置完全一致。

详细说明见 [CI 检查流程 - Strict 模式如何开启](./ci.md#strict-模式如何开启)

### 运行与测试

**Q: 如何运行完整的 CI 检查？**

A: 运行 `npm run ci:check`，该命令会依次执行：
1. `verify:config` - 配置校验
2. `typecheck` - TypeScript 类型检查
3. `validate:skills` - Skill 定义验证
4. `test:contract` - Contract 回归用例
5. `test:contract:edge` - Contract 边界用例
6. `test:strip` - Conclusion 输出剥离回归
7. `smoke` - 冒烟测试

详细说明见 [CI 检查流程 - CI 检查命令](./ci.md#ci-检查命令)

**Q: 本地跑通 ci:check 的最小步骤是什么？**

A: 
1. 同步代码：`git pull`
2. 安装依赖：`npm i`
3. 创建 `.env.local` 文件，至少包含 `DEEPSEEK_API_KEY`
4. 运行 CI 检查：`npm run ci:check`

详细说明见 [CI 检查流程 - 本地跑通 ci:check 的最小步骤](./ci.md#本地跑通-cicheck-的最小步骤不改代码版)

### 架构理解

**Q: 请求链路是怎样的？**

A: 前端请求 → `/api/chat` → 路由判定 → assessment/crisis/support → gates/sanitize → SKILL_MODE 分流 → contract validate → 输出

详细说明见 [架构总览 - 请求链路](./architecture/OVERVIEW.md#请求链路)

**Q: Skill 系统是如何工作的？**

A: context 提取 → select（规则优先）→ render（填槽）→ contract validate → 输出

详细说明见 [架构总览 - Skill 子系统](./architecture/OVERVIEW.md#skill-子系统context--select--render)

**Q: Contract / Gate / Sanitize 如何保证一致性？**

A: 通过统一的 Contract 验证函数（`validateActionCardsContract()` 和 `validateNextStepsLinesContract()`），在 Gate/Smoke/单测中统一调用，实现 single source of truth。

详细说明见 [架构总览 - Contract / Gate / Sanitize 的统一调用点](./architecture/OVERVIEW.md#contract--gate--sanitize-的统一调用点)

## 🔗 相关资源

- [项目根目录 README](../../README.md) - 项目概述、快速开始、部署指南
- [技术决策与部署架构](../../ARCHITECTURE.md) - 技术决策、部署架构、扩展方向
- [Skill 系统变更日志](../../SKILL_SYSTEM_CHANGELOG.md) - Skill 系统的变更历史

## 📝 文档维护

- 文档更新时，请同步更新本文档索引
- 新增文档时，请在相应分类下添加链接
- 常见问题更新时，请同步更新"常见问题入口"部分
