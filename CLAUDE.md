# 心灵树洞 (Mental Health Healing Agent)

## Project Overview
An AI-powered psychological counseling chatbot based on Cognitive Behavioral Therapy (CBT) principles. Provides real-time emotional analysis, empathetic responses, cognitive restructuring guidance, and mental health support through a conversational interface.

**Important**: This is an AI support tool, NOT a replacement for professional mental health services.

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
  dashboard/                # Admin dashboards (memory, lab, prompts)
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
    agents/                 # Agent orchestration
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

### Emotion Recognition
Identifies 7 emotion types with 0-10 intensity scoring:
- Anxiety, Depression, Anger, Sadness, Fear, Happiness, Calm

### CBT Intervention Techniques
- Empathetic understanding
- Cognitive distortion identification (catastrophizing, over-generalization, black-and-white thinking)
- Cognitive restructuring guidance
- Behavioral recommendations

### Safety Features
- Crisis detection and classification
- Input/output safety guardrails
- Sensitive information redaction

### Memory System
- Multi-turn conversation support (last 10 turns)
- Session memory management
- Memory consolidation with forgetting curve

## Deployment Architecture

### Dual Deployment
1. **Vercel** (CI/CD auto-deploy)
   - Triggers on every git push
   - Preview environments
   - Code validation

2. **Alibaba Cloud FC** (Production)
   - Manual deployment only
   - Domain: `mental.llmxy.xyz`
   - Requires: `bun run deploy:build && s deploy -y`

### Critical Notes
- Build command: Use `bun run deploy:build` (not `next build`)
- Package manager: Always use bun
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
