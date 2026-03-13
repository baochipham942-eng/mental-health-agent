/**
 * 状态机驱动的对话路由
 *
 * 5 个核心状态 + 事件驱动转移，替代基于轮次的推断：
 *
 *   GREETING → EXPLORATION → DEEPENING → COPING → WRAP_UP
 *                 ↕              ↕
 *              CRISIS (任何状态可达)
 *
 * 复用 Groq triage 输出进行状态判断，不新增 LLM 调用。
 */

import type { QuickAnalysis } from '../groq';
import type { QuestionnaireType } from '../assessment/questionnaire';

// =============================================================================
// 类型定义
// =============================================================================

export type MachineState =
  | 'greeting'
  | 'exploration'
  | 'deepening'
  | 'coping'
  | 'wrap_up';

export type DialogueIntent =
  | 'opening'
  | 'sharing'
  | 'exploring'
  | 'seeking_solutions'
  | 'wrapping_up';

export interface SCEBProgress {
  S: number; // situation  0-100
  C: number; // cognition  0-100
  E: number; // emotion    0-100
  B: number; // behavior   0-100
}

export interface DialogueContext {
  state: MachineState;
  turn: number;
  scebProgress: SCEBProgress;
  questionnaireActive?: {
    type: QuestionnaireType;
    currentQ: number;
  };
  emotionTrajectory: number[];
}

export interface TransitionResult {
  nextState: MachineState;
  reason: string;
  stateChanged: boolean;
}

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 计算 SCEB 平均进度 (0-100)
 */
export function getOverallProgress(sceb: SCEBProgress): number {
  return (sceb.S + sceb.C + sceb.E + sceb.B) / 4;
}

/**
 * 从 triage 分析推断 SCEB 进度更新
 *
 * 根据 stateReasoning 和 dialogueIntent 推断用户是否披露了新的 SCEB 要素。
 * 每次调用增量更新，不会降低已有进度。
 */
export function updateSCEBProgress(
  current: SCEBProgress,
  analysis: QuickAnalysis,
  userMessage: string,
): SCEBProgress {
  const updated = { ...current };
  const reasoning = (analysis.stateReasoning || '').toLowerCase();
  const msg = userMessage.toLowerCase();
  const intent = (analysis as any).dialogueIntent as DialogueIntent | undefined;

  // 情境 (S): 用户描述了具体事件/场景
  if (
    /事件|场景|发生|情境|经历|背景|工作|学校|家庭|关系/.test(reasoning) ||
    /发生了|因为|最近|昨天|今天|那时候/.test(msg)
  ) {
    updated.S = Math.min(100, current.S + 25);
  }

  // 认知 (C): 用户表达了想法/信念
  if (
    /想法|信念|认知|思维|觉得|以为|认为/.test(reasoning) ||
    /我觉得|我认为|我以为|我想|我怕/.test(msg)
  ) {
    updated.C = Math.min(100, current.C + 25);
  }

  // 情绪 (E): 用户表达了情感
  if (
    analysis.emotion.score > 0 ||
    /情绪|感受|心情|感觉/.test(reasoning)
  ) {
    updated.E = Math.min(100, current.E + 25);
  }

  // 行为 (B): 用户描述了行为模式
  if (
    /行为|做了|反应|应对|习惯|表现/.test(reasoning) ||
    /我就|然后我|所以我|我会/.test(msg)
  ) {
    updated.B = Math.min(100, current.B + 25);
  }

  // 如果 intent 是 exploring/seeking_solutions，加速 C 和 B
  if (intent === 'exploring') {
    updated.C = Math.min(100, updated.C + 10);
  }
  if (intent === 'seeking_solutions') {
    updated.B = Math.min(100, updated.B + 10);
  }

  return updated;
}

// =============================================================================
// 状态转移引擎
// =============================================================================

/**
 * 评估状态转移
 *
 * 基于当前上下文和 triage 分析结果，决定是否需要切换状态。
 * 不新增 LLM 调用，完全复用 Groq triage 已有字段。
 */
export function evaluateTransition(
  ctx: DialogueContext,
  analysis: QuickAnalysis,
): TransitionResult {
  const { state, turn, scebProgress } = ctx;
  const progress = getOverallProgress(scebProgress);
  const intent = (analysis as any).dialogueIntent as DialogueIntent | undefined;

  // 危机覆盖：任何状态均可进入 crisis（但 crisis 不是 MachineState，
  // 由 route.ts 的危机路由单独处理，这里只返回当前状态保持不变）
  if (analysis.safety === 'crisis' || analysis.safety === 'urgent') {
    return {
      nextState: state, // 保持当前状态，危机由 route.ts crisis handler 处理
      reason: `Safety=${analysis.safety}, 危机由 crisis handler 处理`,
      stateChanged: false,
    };
  }

  switch (state) {
    case 'greeting': {
      // greeting → exploration: 用户开始倾诉
      if (
        analysis.emotion.score > 0 ||
        intent === 'sharing' ||
        intent === 'exploring' ||
        /倾诉|分享|聊|说说/.test(analysis.stateReasoning || '')
      ) {
        return {
          nextState: 'exploration',
          reason: '用户开始分享内容，进入探索阶段',
          stateChanged: true,
        };
      }
      // 超过 2 轮仍在 greeting，自动推进
      if (turn >= 3) {
        return {
          nextState: 'exploration',
          reason: '已过 greeting 阶段（轮次 >= 3）',
          stateChanged: true,
        };
      }
      return { nextState: 'greeting', reason: '仍在问候阶段', stateChanged: false };
    }

    case 'exploration': {
      // exploration → deepening: SCEB 进度 ≥ 40% 或 turn ≥ 4
      if (progress >= 40 || turn >= 5) {
        return {
          nextState: 'deepening',
          reason: `SCEB 进度 ${progress.toFixed(0)}%，进入深化阶段`,
          stateChanged: true,
        };
      }
      return { nextState: 'exploration', reason: '继续探索', stateChanged: false };
    }

    case 'deepening': {
      // deepening → coping: SCEB ≥ 70% 或 turn ≥ 7
      if (
        (progress >= 70 || turn >= 8) &&
        analysis.safety === 'normal'
      ) {
        return {
          nextState: 'coping',
          reason: `SCEB 进度 ${progress.toFixed(0)}%，转入应对策略阶段`,
          stateChanged: true,
        };
      }
      // 如果用户在寻求解决方案，提前进入 coping
      if (intent === 'seeking_solutions' && progress >= 50) {
        return {
          nextState: 'coping',
          reason: '用户主动寻求解决方案，提前进入应对阶段',
          stateChanged: true,
        };
      }
      return { nextState: 'deepening', reason: '继续深化探索', stateChanged: false };
    }

    case 'coping': {
      // coping → wrap_up: 仅当用户明确告别时（turn 阈值提高到 20，避免练习完成后误触发）
      if (intent === 'wrapping_up' && turn >= 5) {
        return {
          nextState: 'wrap_up',
          reason: '用户明确表达结束意愿，进入收尾',
          stateChanged: true,
        };
      }
      if (turn >= 20) {
        return {
          nextState: 'wrap_up',
          reason: '对话轮次充足（20+），自然收尾',
          stateChanged: true,
        };
      }
      // 情绪明显好转
      const trajectory = ctx.emotionTrajectory;
      if (trajectory.length >= 3) {
        const recent = trajectory.slice(-3);
        const improving = recent.every((v, i) => i === 0 || v <= recent[i - 1]);
        if (improving && recent[recent.length - 1] <= 3) {
          return {
            nextState: 'wrap_up',
            reason: '情绪持续改善，进入收尾阶段',
            stateChanged: true,
          };
        }
      }
      return { nextState: 'coping', reason: '继续应对策略', stateChanged: false };
    }

    case 'wrap_up': {
      // wrap_up 是终态，保持不变
      return { nextState: 'wrap_up', reason: '对话收尾中', stateChanged: false };
    }

    default:
      return { nextState: 'exploration', reason: '未知状态，回退到探索', stateChanged: true };
  }
}

// =============================================================================
// 状态对应的 Prompt Modifier
// =============================================================================

const STATE_PROMPTS: Record<MachineState, string> = {
  greeting: `
[对话阶段: 问候]
- 温暖地欢迎用户，建立安全感
- 用开放式问题邀请分享
- 不要过早深入敏感话题
`,
  exploration: `
[对话阶段: 探索]
- 积极倾听，鼓励用户分享更多细节
- 收集 SCEB 要素（情境、认知、情绪、行为）
- 使用温和的开放式提问
- 避免过早给建议
`,
  deepening: `
[对话阶段: 深化]
- 对话已建立信任，可以温和地探索深层模式
- 关注认知扭曲和行为模式
- 使用反映和澄清技术
- 适时进行轻度认知重构
`,
  coping: `
[对话阶段: 应对策略]
- 用户准备好接受建议和策略
- 提供具体的、可行的应对方法
- 可以推荐引导练习（呼吸、冥想、接地等）
- 帮助制定简单的行动计划
`,
  wrap_up: `
[对话阶段: 收尾]
- 总结本次对话的要点和收获
- 肯定用户的勇气和进步
- 提供后续建议和资源
- 温暖地告别，留下积极印象
`,
};

/**
 * 生成状态机上下文 Prompt
 */
export function generateStateMachinePrompt(ctx: DialogueContext): string {
  const statePrompt = STATE_PROMPTS[ctx.state] || STATE_PROMPTS.exploration;
  const progress = getOverallProgress(ctx.scebProgress);

  let prompt = `\n**对话状态机**：
- 当前状态：${ctx.state}
- 对话轮次：第 ${ctx.turn} 轮
- SCEB 收集进度：${progress.toFixed(0)}%（S:${ctx.scebProgress.S}% C:${ctx.scebProgress.C}% E:${ctx.scebProgress.E}% B:${ctx.scebProgress.B}%）
${statePrompt}`;

  // 问卷进行中提示
  if (ctx.questionnaireActive) {
    prompt += `\n**注意**：用户正在进行 ${ctx.questionnaireActive.type.toUpperCase()} 评估（第 ${ctx.questionnaireActive.currentQ + 1} 题），请配合问卷流程。`;
  }

  return prompt;
}

// =============================================================================
// 初始化与序列化
// =============================================================================

/**
 * 创建初始对话上下文
 */
export function createInitialContext(): DialogueContext {
  return {
    state: 'greeting',
    turn: 1,
    scebProgress: { S: 0, C: 0, E: 0, B: 0 },
    emotionTrajectory: [],
  };
}

/**
 * 从 Conversation.meta 中恢复 DialogueContext
 * 如果不存在则返回 null（fallback 到旧的轮次推断）
 */
export function restoreContext(meta: any): DialogueContext | null {
  if (!meta || typeof meta !== 'object') return null;
  const ctx = meta.dialogueContext;
  if (!ctx || !ctx.state || typeof ctx.turn !== 'number') return null;

  return {
    state: ctx.state as MachineState,
    turn: ctx.turn,
    scebProgress: ctx.scebProgress || { S: 0, C: 0, E: 0, B: 0 },
    questionnaireActive: ctx.questionnaireActive,
    emotionTrajectory: ctx.emotionTrajectory || [],
  };
}
