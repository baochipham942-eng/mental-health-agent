# 验证指南

> 心灵树洞项目的统一验证入口。所有验证步骤汇总于此。

## 快速检查（5 分钟）

```bash
bun ci:check
```

该命令依次执行：配置验证 → 类型检查 → 结论提取冒烟测试 → 单元测试 → 性能冒烟测试。
全部通过即可放心提交代码。

## 完整验证

### 1. 类型检查

```bash
bun typecheck
```

使用 `tsc --noEmit` 进行全量类型检查，确保无 TypeScript 编译错误。

### 2. 单元测试

```bash
bun test:unit          # 单次运行（Vitest）
bun test:watch         # 监听模式（开发时使用）
bun test:coverage      # 带覆盖率报告
```

测试文件位于 `tests/integration/`，包含：
- `progress-tracker.test.ts` — 进度追踪
- `questionnaire.test.ts` — 问卷系统（PHQ-9 / GAD-7）
- `state-machine.test.ts` — 对话状态机
- `therapist-persona.test.ts` — 咨询师人设

### 3. 冒烟测试

```bash
bun smoke              # 主冒烟测试（DeepSeek API 端到端）
bun smoke:glm          # GLM Provider 冒烟
bun smoke:openai       # OpenAI Provider 冒烟
bun smoke:openrouter   # OpenRouter Provider 冒烟
bun test:strip         # 结论提取冒烟测试
```

冒烟测试会实际调用 LLM API，确认响应格式和功能正常。需要对应的 API Key 环境变量。

### 4. 配置验证

```bash
bun verify:config
```

验证冒烟测试配置文件的完整性和正确性。

### 5. GUI 测试

```bash
bun test:gui           # 全量 GUI 测试
bun test:gui:chat      # 聊天功能 GUI 测试
bun test:gui:safety    # 安全功能 GUI 测试
```

GUI 测试使用 UI-TARS 框架，需要本地开发服务器运行中（`bun dev`）。
配置文件：`tests/gui/config.mjs`。

### 6. 评估测试

```bash
bun eval:provider      # Provider 基线评估
```

评估用例位于 `tests/eval/` 和 `tests/golden/`。

### 7. 部署前检查

```bash
# 1. 确保 CI 检查全部通过
bun ci:check

# 2. 构建部署包（阿里云 FC 专用）
bun run deploy:build

# 3. 部署到生产环境（需手动确认）
s deploy
```

**注意**：
- 生产构建必须使用 `deploy:build`（不是 `npm run build`），否则静态资源会 404
- 部署前必须先 `git push`，禁止 Ghost Deploy（详见 PROJECT_CONSTITUTION.md）
- Vercel 会在 `git push` 后自动部署预览环境

## 故障排查

### DeepSeek API 连接失败

1. 检查环境变量 `DEEPSEEK_API_KEY` 是否设置
2. 确认 `DEEPSEEK_API_URL` 端点是否正确
3. 查看 Langfuse Dashboard（需 `LANGFUSE_ENABLED=true`）追踪请求详情
4. DeepSeek 是国内 API，不需要代理

### 本地 vs 线上差异

1. 确认使用了正确的构建命令：`bun run deploy:build`（非 `next build`）
2. 检查 Middleware matcher 是否排除了静态资源（见 PROJECT_CONSTITUTION.md 第 4 条）
3. 确认 `public/` 和 `.next/static/` 已正确复制到 standalone 目录
4. 注意 Vercel 超时限制：Hobby 10s / Pro 60s

### Lockfile 不同步导致 Vercel 部署失败

修改 `package.json` 后必须同时更新 `pnpm-lock.yaml`：

```bash
pnpm install --lockfile-only
```

### 数据库迁移问题

```bash
bun prisma generate        # 重新生成 Prisma Client
bun prisma migrate deploy  # 执行数据库迁移
bun prisma db push         # 开发环境推送 Schema
```
