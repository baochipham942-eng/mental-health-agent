---
description: 项目开发规范和宪法 - 每次开始工作前必读
---

# 项目宪法 (Project Constitution)

在开始任何开发工作前，**必须**阅读并遵守以下规则：

## 1. 阅读全局宪法
首先阅读 `../GLOBAL_CONSTITUTION.md`，了解通用开发规范：
- 语言偏好（中文）
- 包管理器（pnpm）
- 验证优先原则
- 错题本机制

## 2. 阅读项目宪法
然后阅读 `PROJECT_CONSTITUTION.md`，了解本项目特有规则：
- 双重部署架构（Vercel 预览 + 阿里云 FC 生产）
- 构建命令必须用 `pnpm run deploy:build`
- Middleware 必须排除静态资源

## 3. 核心禁令
- ❌ 禁止使用 `npm`，必须使用 `pnpm`
- ❌ 禁止只运行 `next build`，必须用 `pnpm run deploy:build`
- ❌ 禁止在不 push 代码的情况下部署 FC
- ❌ 禁止未验证就通知用户"已完成"

## 4. 犯错时
如果发现自己犯了重复的错误，立即记录到 `../GLOBAL_LESSONS.md` 错题本中。
