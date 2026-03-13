---
description: 构建规则
globs: "package.json,*.config.*"
---

# 构建规则

## 包管理器

本项目日常开发使用 **bun**，Vercel 部署使用 **pnpm**。

- 本地安装依赖：`bun install`
- 运行脚本：`bun <script-name>`（如 `bun dev`、`bun typecheck`）
- 禁止使用 `npm install` 或 `yarn`

## 构建命令区分

| 命令 | 用途 | 说明 |
|------|------|------|
| `bun run build` | 通用构建 | 包含 Prisma 迁移，适用于 Vercel |
| `bun run deploy:build` | 阿里云 FC 部署构建 | 额外复制 `public/` 和 `.next/static/` 到 standalone |
| `next build` | **禁止单独使用** | 缺少 Prisma 生成和静态资源复制 |

## deploy:build 的实际逻辑

```bash
npx prisma generate && next build && cp -r public .next/standalone/ && cp -r .next/static .next/standalone/.next/
```

Next.js Standalone 模式默认不包含 `public/` 和 `.next/static/`，必须手动复制，否则部署后 CSS、JS、图片全部 404。

## CI 检查

合并主分支前必须通过 `bun ci:check`，该命令依次执行：

1. `verify:config` — 配置验证
2. `typecheck` — TypeScript 类型检查
3. `test:strip` — 结论提取冒烟测试
4. `test:unit` — 单元测试（Vitest）
5. `smoke` — 性能冒烟测试

CI 环境强制开启 `SKILL_MODE=steps_and_cards` Strict Mode。

## Lockfile 同步

修改 `package.json` 后必须同步更新 `pnpm-lock.yaml`：

```bash
pnpm install --lockfile-only
```

Vercel 使用 pnpm 部署，lockfile 不同步会导致部署失败。
