import { chatCompletion, streamChatCompletion, ChatMessage, ToolCall } from './deepseek';
import { UI_TOOLS } from './tools';
import { classifyDialogueState, StateClassification } from './agents/state-classifier';

const FINISH_ASSESSMENT_TOOL = {
  type: 'function',
  function: {
    name: 'finish_assessment',
    description: '当收集齐 SCEB 要素（情境、认知、情绪、行为）并确认无自伤风险，或者用户明确表示想结束时调用，以结束评估阶段并生成报告。',
    parameters: {
      type: 'object',
      properties: {},
    },
  },
};

/**
 * 心理评估持续对话 Prompt (MVP Simplified)
 */
const ASSESSMENT_LOOP_PROMPT = `你是一位专业的心理咨询师。目前处于初步了解阶段，你的任务是温和地引导用户分享。

**核心原则**：
1. **循序渐进**：每次回复只关注 1 个核心点（情境、想法、情绪或行为）。不要一次性列出所有问题，以免让用户感到压力。
2. **上下文敏感的安全评估**：
   - **不要**在分享日常琐事或中性话题时突然询问自伤意愿（除非用户表达了绝望、无助或严重的心理痛苦）。
   - 只有当评估进入中后期或迹象明显时，才自然地确认安全风险。
3. **保持简短**：每次回复控制在 4-6 句左右，优先给予共情。
4. **主动记忆召回 (Proactive Memory Recall)**：
   - 如果当前是**非首轮**对话（你能够看到提供的“历史背景摘要”或“长期记忆Context”），请在对话中自然地提及用户过去分享过的细节。
   - 例如：“上次你提到最近工作压力很大，现在情况有改善吗？”或者“记得你之前说过……”
   - 这种引用应该自然且充满关怀，让用户感受到被持续关注和陪伴。

**流程引导**：
- 如果信息不足以让用户产生洞察，继续温和追问。
- 当你对用户的基本情况（SCEB）有了清晰了解且确认用户处于安全状态时，请调用 \`finish_assessment\` 工具结束对话并生成总结。`;

/**
 * 生成带 SCEB 进度的 Prompt
 */
function buildPromptWithProgress(classification: StateClassification): string {
  const { scebProgress, missingElements, overallProgress } = classification;

  return `${ASSESSMENT_LOOP_PROMPT}

**当前评估进度**（供你参考）：
- 情境了解：${scebProgress.situation}%
- 认知了解：${scebProgress.cognition}%
- 情绪了解：${scebProgress.emotion}%
- 行为了解：${scebProgress.behavior}%
- 总体进度：${overallProgress}%

${missingElements.length > 0 ? `**建议重点关注**：${missingElements.join('、')}` : ''}
${overallProgress >= 70 ? '\n**提示**：评估进度已达70%以上，如信息足够可考虑调用 finish_assessment 结束评估。' : ''}`;
}

/**
 * 继续评估对话
 */
export async function continueAssessment(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  options?: { traceMetadata?: Record<string, any>; memoryContext?: string }
): Promise<{ reply: string; isConclusion: boolean; toolCalls?: ToolCall[]; stateClassification?: StateClassification }> {
  // Step 1: 构建完整的消息历史（用于状态分类）
  const fullHistory: ChatMessage[] = history.map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));
  fullHistory.push({ role: 'user', content: userMessage });

  // Step 2: 调用状态分类器
  let classification: StateClassification | undefined;
  try {
    classification = await classifyDialogueState(fullHistory, {
      traceMetadata: options?.traceMetadata,
    });

    // 如果分类器建议结束，直接返回
    if (classification.shouldConclude) {
      console.log('[Assessment] State classifier suggests conclusion:', classification.reasoning);
      return {
        reply: '', // 空回复，让调用方处理总结生成
        isConclusion: true,
        stateClassification: classification,
      };
    }
  } catch (error) {
    console.error('[Assessment] State classification failed, continuing with default prompt:', error);
  }

  // Step 3: 构建带进度的 Prompt
  let systemPrompt = classification
    ? buildPromptWithProgress(classification)
    : ASSESSMENT_LOOP_PROMPT;

  if (options?.memoryContext) {
    systemPrompt = `${systemPrompt}\n\n${options.memoryContext}`;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.filter(m => (m.role as string) !== 'system').map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  // Step 4: 调用 LLM 生成回复
  const result = await chatCompletion(messages, {
    temperature: 0.5,
    max_tokens: 400,
    tools: [FINISH_ASSESSMENT_TOOL, ...UI_TOOLS],
    traceMetadata: options?.traceMetadata,
  });

  const isConclusion = result.toolCalls?.some(tc => tc.function.name === 'finish_assessment') || false;

  return {
    reply: result.reply,
    isConclusion,
    toolCalls: result.toolCalls,
    stateClassification: classification,
  };
}

/**
 * 流式继续评估对话
 */
export async function streamAssessmentReply(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  options?: {
    traceMetadata?: Record<string, any>;
    memoryContext?: string;
    onFinish?: (text: string, toolCalls?: any[]) => Promise<void>;
  }
) {
  // Step 1: 构建完整的消息历史（用于状态分类 - 非流式）
  const fullHistory: ChatMessage[] = history.map(msg => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
  }));
  fullHistory.push({ role: 'user', content: userMessage });

  // Step 2: 调用状态分类器 (带超时保护，防止挂起)
  let classification: StateClassification | undefined;
  try {
    const classifyWithTimeout = Promise.race([
      classifyDialogueState(fullHistory, { traceMetadata: options?.traceMetadata }),
      new Promise<undefined>((_, reject) => setTimeout(() => reject(new Error('Classification timeout')), 5000))
    ]);
    classification = await classifyWithTimeout;

    // 如果分类器建议结束，我们将通过 metadata 告知调用方，此处不直接流式输出
    if (classification?.shouldConclude) {
      console.log('[Assessment] State classifier suggests conclusion:', classification.reasoning);
    }
  } catch (error) {
    console.error('[Assessment] State classification failed or timed out:', error);
    // 即使分类失败也继续，不影响主流程
  }

  // Step 3: 构建带进度的 Prompt
  let systemPrompt = classification
    ? buildPromptWithProgress(classification)
    : ASSESSMENT_LOOP_PROMPT;

  if (options?.memoryContext) {
    systemPrompt = `${systemPrompt}\n\n${options.memoryContext}`;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...history.filter(m => (m.role as string) !== 'system').map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  // Step 4: 调用流式接口
  return streamChatCompletion(messages, {
    temperature: 0.5,
    max_tokens: 400,
    enableTools: true, // 必须启用工具以识别 finish_assessment
    traceMetadata: options?.traceMetadata,
    onFinish: options?.onFinish,
  });
}

