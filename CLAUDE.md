# 心灵树洞 - 你的解压搭子

## Project Overview
AI 陪伴式解压工具，定位为"职场解压搭子"。表层是轻松的聊天陪伴体验，底层保留完整的 CBT 专业能力（情绪分析、认知重构、危机检测）。

**产品定位**：用户厌恶医疗标签，偏好轻松陪伴式交互。产品表面去医疗化，专业能力按需渐进暴露。

**功能分层**：
- Layer 0（默认入口）: 自由聊天、情绪倾诉、日常解压
- Layer 1（自然发现）: 呼吸练习、正念冥想、情绪记录、认知重构
- Layer 2（主动探索）: 对话排练、深度自我了解、成长记录
- Layer 3（专业评估）: 情绪健康度检查(PHQ-9)、压力指数检查(GAD-7)

## Tech Stack

### Frontend
- **Next.js 14** with App Router
- **React 18** + **TypeScript 5.3**
- **TailwindCSS 3.4** + **ArcoDesign 2.66**
- **Framer Motion 12** (animations)
- **Zustand 4.4** (state management)

### Backend
- **Next.js API Routes** (serverless)
- **NextAuth 5.0.0-beta.30** (authentication)
- **Prisma ORM 5.22** with PostgreSQL
- **Langfuse 3.38** (LLM observability)

### AI Integration
- **DeepSeek Chat API** - primary LLM
- **Vercel AI SDK 3.4** - unified interface
- **Groq** / **OpenAI** - fallback options

### Key Libraries
- Zod (validation), bcryptjs (password hashing)
- react-markdown (content rendering)
- Baidu AIP SDK (speech synthesis)

## Project Structure
```
app/
  api/
    chat/route.ts           # Main dialogue API endpoint
    memory/                 # Memory management APIs
    optimization/           # Prompt optimization APIs
    auth/[...nextauth]/     # Authentication
  dashboard/                # Admin dashboards (memory, lab, prompts, progress, crisis)
  page.tsx                  # Home page (chat interface)

components/
  chat/                     # Chat UI components
    ChatContainer.tsx       # Main container
    ChatInput.tsx           # Input with voice support
    EmotionIndicator.tsx    # Emotion display
    ThoughtChain.tsx        # Reasoning visualization
    ActionCardGrid.tsx      # Skill-based actions

lib/
  ai/
    deepseek.ts             # DeepSeek API wrapper
    dialogue/               # Dialogue state management
    emotion.ts              # Emotion analysis (7 types, 0-10 intensity)
    guardrails/             # Input/output safety
    crisis-classifier.ts    # Crisis detection
    crisis-escalation.ts    # Crisis escalation flow
    assessment/             # PHQ-9/GAD-7 questionnaire system
    persona/                # Therapist profiles (xiaowarm/mingyuan/qinghe)
    progress/               # Progress tracking
    exercise-engine.ts      # Exercise engine (breathing, mindfulness, etc.)
    agents/                 # Agent orchestration (triage/counselor/safety/quality)
  memory/
    manager.ts              # Memory lifecycle
    extractor.ts            # Information extraction
    forgetting-curve.ts     # Spaced repetition
  observability/
    langfuse.ts             # LLM monitoring

hooks/
  useChat.ts                # Chat state and logic

scripts/
  run-smoke.ts              # Performance smoke testing
  optimize-prompts.ts       # Prompt optimization
```

## Package Manager
**Always use `bun` instead of npm/pnpm/yarn.**

## Key Commands
```bash
bun install

# Development
bun dev                     # Start dev server (port 3000)

# Database
bun prisma generate
bun prisma migrate deploy

# Build & Deploy
bun run build               # Build with Prisma migration
bun start                   # Start production server
bun run deploy:build        # Build for Alibaba Cloud FC

# Testing
bun test:unit               # Unit tests (Vitest)
bun smoke                   # Performance smoke tests
bun ci:check                # Full CI checks

# Linting
bun lint
bun typecheck
```

## Environment Variables
```bash
# Required
DEEPSEEK_API_KEY=           # DeepSeek API authentication

# Optional
DEEPSEEK_API_URL=           # DeepSeek endpoint
NEXT_PUBLIC_APP_NAME=       # App display name
DATABASE_URL=               # PostgreSQL connection
LANGFUSE_ENABLED=           # Enable/disable monitoring
LANGFUSE_SECRET_KEY=        # Langfuse auth
LANGFUSE_PUBLIC_KEY=
LANGFUSE_BASE_URL=
SKILL_MODE=                 # off/cards_only/steps_and_cards
```

## Core Features

### 对话体验
- 轻松陪伴式聊天，无医疗化标签
- 首次对话随机分配聊天风格（不弹选择器）
- 用户可在设置中切换风格（延迟发现）

### 情绪识别（后台）
Identifies 7 emotion types with 0-10 intensity scoring:
- Anxiety, Depression, Anger, Sadness, Fear, Happiness, Calm

### CBT 能力（后台，用户不可见术语）
- Empathetic understanding
- Cognitive distortion identification
- Cognitive restructuring guidance
- Behavioral recommendations

### 评估系统（Phase 5）
- **情绪健康度检查**（PHQ-9）— 用户看到的名称
- **压力指数检查**（GAD-7）— 用户看到的名称
- 对话状态机（SCEB 要素收集）
- 进度追踪与成长记录
- 触发方式：用户说"了解一下自己"/"测一下" 或连续 3+ 次同类情绪话题时温和建议

### Safety Features
- Crisis detection and classification（后台保持专业术语）
- Input/output safety guardrails
- Sensitive information redaction
- 危机资源展示（保留热线号码，措辞去医疗化）

### Memory System
- Multi-turn conversation support (last 10 turns)
- Session memory management
- Memory consolidation with forgetting curve

## 用户可见文案规范

**禁用词**（用户界面中不得出现）：
- ❌ 咨询 → ✅ 对话 / 聊天
- ❌ 心理咨询 → ✅ 聊聊
- ❌ 咨询师 → ✅ 我（第一人称）
- ❌ 疗愈 → ✅ 成长
- ❌ PHQ-9 抑郁评分 → ✅ 情绪健康度
- ❌ GAD-7 焦虑评分 → ✅ 压力指数
- ❌ 心理评估 → ✅ 深度了解
- ❌ 症状 → ✅ 状态

**允许在后台/系统提示词中使用专业术语**（lib/ai/prompts.ts 等）。

## Deployment Architecture

### Dual Deployment
1. **Vercel** (CI/CD auto-deploy)
   - Triggers on every git push
   - Preview environments
   - Code validation
   - **Domain: `mental-health-agent-tawny.vercel.app`**
   - 阿里云 FC 的语音识别 API 会代理到此域名（因为 FC 无法直接访问 Groq）

2. **Alibaba Cloud FC** (Production)
   - Manual deployment only
   - Domain: `mental.llmxy.xyz`
   - Requires: `bun run deploy:build && s deploy -y`

### Critical Notes
- Build command: Use `bun run deploy:build` (not `next build`)
- Package manager: Always use bun
- **Lockfile 双更新**: 改 `package.json` 后必须同时运行 `pnpm install --lockfile-only` 更新 `pnpm-lock.yaml`（Vercel 用 pnpm 部署，lockfile 不同步会导致部署失败）
- Middleware: Must exclude static assets to prevent FC 404s
- Vercel Hobby: 10s timeout; Pro: 60s timeout

## Development Principles
1. All documentation in Chinese
2. Never discard previous docs - use incremental updates
3. Always test before marking complete
4. Always use bun (not npm/pnpm/yarn)
5. Use `deploy:build` for production

## Documentation
- `README.md` - Quick start guide
- `PROJECT_CONSTITUTION.md` - Deployment rules, CI/CD standards
- `PROJECT_SUMMARY.md` - Technical overview (615 lines)
- `ARCHITECTURE.md` - System architecture
- `DESIGN_GUIDE.md` - Design system (colors, typography)
- `docs/` - Detailed engineering guides
