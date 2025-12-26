# 心理疗愈Agent 部署流程

## 部署目标
- **阿里云函数计算 (FC)**: https://mental.llmxy.xyz
- **Vercel**: 自动通过 GitHub 触发

## 一键部署命令

```bash
# 在项目根目录执行
npm run deploy:build && s deploy --use-local -y && git add -A && git commit -m "deploy: update" && git push
```

## 分步说明

### 1. 构建 Next.js Standalone 包
```bash
npm run deploy:build
```
这会执行: `prisma generate` → `next build` → 复制静态资源到 standalone 目录

### 2. 部署到阿里云 FC
```bash
s deploy --use-local -y
```
部署到香港区域的函数计算，域名: mental.llmxy.xyz (HTTPS)

### 3. 推送到 GitHub 触发 Vercel 部署
```bash
git add -A && git commit -m "deploy: your message" && git push
```
Vercel 会自动监听 main 分支并构建部署

## 环境变量
阿里云 FC 的环境变量配置在 `s.yaml` 中:
- `NEXTAUTH_URL`: https://mental.llmxy.xyz
- `NEXTAUTH_SECRET`: NextAuth 签名密钥
- `DATABASE_URL`: Neon PostgreSQL 连接串
- `DEEPSEEK_API_KEY`: DeepSeek API 密钥

## 邀请码管理
当前有效邀请码:
- `xinli2025` - 100次可用，有效期至 2026-06-30
- `XLSD2025` - 95次可用，有效期至 2025-12-31
