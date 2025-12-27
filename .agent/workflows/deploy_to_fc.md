---
description: 部署到阿里云 FC 生产环境 (Standard Golden Flow)
---

# 部署到阿里云 FC (Production)

> **⚠️ 依据**:本流程严格遵循 [PROJECT_CONSTITUTION.md](../../PROJECT_CONSTITUTION.md) 第 2 章 "The Golden Flow"。
> **警告**: 必须先通过 `Wait for User Approval` 才能执行。

1. **Constitutional Check (宪法检查)**
   - [ ] 确认代码已 Commit 并 Push 到 GitHub (触发 Vercel 预览)。
   - [ ] 确认已通过 `npm run ci:check` (如果适用)。

2. **Build for Standalone (构建)**
   - 运行标准构建脚本 (切勿只运行 `npm run build`)：
   // turbo
   ```bash
   npm run deploy:build
   ```

3. **Deploy (发布)**
   - 推送到阿里云 FC：
   // turbo
   ```bash
   s deploy -y
   ```

4. **Verify (验证)**
   - 访问 `https://mental.llmxy.xyz` 验证更新是否生效。
