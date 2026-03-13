---
description: 部署规则（双环境架构）
globs:
---

# 部署规则

## 双环境架构

本项目采用双重部署架构，必须明确区分：

- **Vercel**：CI/CD 自动触发，用于预览和构建检查。域名 `mental-health-agent-tawny.vercel.app`
- **阿里云 FC**：真实生产环境，必须手动部署。域名 `mental.llmxy.xyz`

Vercel 部署成功**不代表**线上更新。线上域名 `mental.llmxy.xyz` 指向阿里云 FC。

## 标准部署流程

1. 提交代码并推送（触发 Vercel 自动部署）
2. 使用 `bun run deploy:build` 构建部署包
3. 使用 `s deploy` 手动部署到阿里云 FC

## 禁止行为

- **禁止 Ghost Deploy**：严禁在不 Push 代码的情况下直接运行 `s deploy`，否则线上运行的将是 Git 仓库中不存在的幽灵代码
- **禁止使用 `next build`**：生产部署必须使用 `bun run deploy:build`，否则静态资源会 404
- **禁止跳过确认**：`s deploy` 不加 `-y`，需手动确认部署内容

## Middleware 安全

Middleware 的 `matcher` 必须严格排除所有静态资源（`_next/static`、`_next/image`、常见静态文件扩展名），否则阿里云 FC 环境下会导致样式崩坏。

## Lockfile 双更新

修改 `package.json` 后必须同时运行 `pnpm install --lockfile-only` 更新 `pnpm-lock.yaml`，否则 Vercel 部署会失败。

## 环境变量

所有敏感密钥必须通过环境变量注入，严禁硬编码。代码库必须保持 GitHub Private Repo。
