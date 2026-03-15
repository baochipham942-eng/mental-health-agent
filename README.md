# 心灵树洞 — 你的解压搭子

> AI 陪伴式解压工具，定位为"职场解压搭子"。表层是轻松的聊天陪伴体验，底层保留完整的 CBT 专业能力。

**产品定位**：用户厌恶医疗标签，偏好轻松陪伴式交互。产品表面去医疗化，专业能力按需渐进暴露。

## 功能亮点

- **轻松陪伴对话** — 去医疗化文案，像朋友一样聊天
- **8 种解压技能** — 呼吸练习、正念冥想、认知重构、空椅子技术等
- **探索工坊** — 与 10 位历史先驱对话、16 种 MBTI 人格互动、圆桌论道
- **情绪洞察** — 实时情绪识别 + 7/30 天趋势追踪
- **专业评估** — 情绪健康度 (PHQ-9)、压力指数 (GAD-7)，对话式自然收集
- **多 LLM 支持** — DeepSeek / OpenAI / Kimi / OpenRouter / GLM 可切换
- **学术评测** — 3 套学术数据集 + 双层评分 + 定性分析

## 技术栈

| 层 | 技术 |
|----|------|
| 前端 | Next.js 14 + React 18 + TypeScript + TailwindCSS + ArcoDesign + Framer Motion |
| 状态 | Zustand 4.4 |
| 后端 | Next.js API Routes (Serverless) |
| 认证 | NextAuth 5.0.0-beta.30 |
| 数据库 | PostgreSQL (Neon) + Prisma ORM + SQLite (评测) |
| AI | DeepSeek + OpenAI + Kimi + OpenRouter + GLM（lib/llm 统一层）|
| AI SDK | Vercel AI SDK 3.4 |
| 监控 | Langfuse 3.38 |
| 包管理 | bun (开发) + pnpm (Vercel 部署) |

## 快速开始

### 1. 安装依赖

```bash
bun install
```

### 2. 配置环境变量

创建 `.env.local` 文件：

```bash
DEEPSEEK_API_KEY=your_key
DATABASE_URL=postgresql://...
```

完整环境变量列表见 [CLAUDE.md](./CLAUDE.md) 的 Environment Variables 部分。

### 3. 初始化数据库

```bash
bun prisma generate
bun prisma migrate deploy
```

### 4. 运行开发服务器

```bash
bun dev
```

打开 [http://localhost:3002](http://localhost:3002) 查看应用。

## 功能分层

| Layer | 用户感知 | 实际能力 |
|-------|---------|---------|
| L0 默认入口 | 自由聊天、情绪倾诉 | Triage + Safety + Counselor Agent |
| L1 自然发现 | 呼吸练习、正念冥想、情绪记录 | ExerciseEngine + SFBT + Widget |
| L2 主动探索 | 探索工坊（导师/MBTI/圆桌） | Mentor Personas + Group Chat |
| L3 专业评估 | 情绪健康度 / 压力指数 | PHQ-9 / GAD-7 对话式收集 |

## 部署

本项目采用**双环境部署**：

| 环境 | 平台 | 域名 | 触发方式 |
|------|------|------|---------|
| 预览 | Vercel | mental-health-agent-tawny.vercel.app | git push 自动 |
| 生产 | 阿里云 FC | mental.llmxy.xyz | 手动 |

```bash
# 生产部署
bun run deploy:build && s deploy
```

> 部署规则详见 [PROJECT_CONSTITUTION.md](./PROJECT_CONSTITUTION.md)

## 核心命令

```bash
bun dev                  # 启动开发服务器 (port 3002)
bun run build            # 构建（含 Prisma 迁移）
bun run deploy:build     # 阿里云 FC 部署构建
bun test:unit            # 单元测试 (Vitest)
bun smoke                # 性能冒烟测试
bun ci:check             # 完整 CI 检查
bun typecheck            # TypeScript 类型检查
```

## 文档导航

| 文档 | 内容 |
|------|------|
| [CLAUDE.md](./CLAUDE.md) | 项目配置、目录结构、环境变量 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 系统架构、对话引擎、评测系统 |
| [PROJECT_CONSTITUTION.md](./PROJECT_CONSTITUTION.md) | 部署规则、构建宪法、CI/CD |
| [PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) | 项目全貌、功能清单、技术决策 |
| [DESIGN_GUIDE.md](./DESIGN_GUIDE.md) | 设计系统、颜色、弹窗规范 |
| [docs/](./docs/) | 变更日志、操作手册、设计文档 |

## 注意事项

- 本项目仅供学习和研究使用
- 不能替代专业心理咨询服务
- 如遇严重心理危机，请及时拨打心理援助热线

## License

MIT
