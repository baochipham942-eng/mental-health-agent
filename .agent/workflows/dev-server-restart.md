---
description: When to restart dev server after code changes
---

# 需要重启开发服务器的修改类型

以下类型的修改完成后，**必须重启 `npm run dev`**，因为 Next.js 热更新无法自动加载这些更改：

## 1. Prisma Schema 修改
- 新增/修改字段 (`schema.prisma`)
- 运行 `prisma db push` 或 `prisma migrate dev` 后
- 运行 `prisma generate` 后

**重启命令**:
```bash
# 停止当前服务
pkill -f "next dev"
# 重新启动
npm run dev
```

## 2. 环境变量修改
- 修改 `.env` 或 `.env.local` 文件

## 3. next.config.js 修改
- 任何配置变更

## 4. tsconfig.json / tailwind.config.ts 修改
- 路径别名变更
- 编译选项变更

## 5. 依赖安装
- `npm install` 新包后

---

**常见错误信号**：
- `prisma.xxx.findMany()` 报 "Unknown field" 错误 → Prisma Client 未同步
- 环境变量读取为 `undefined` → 服务器未重新加载 .env
