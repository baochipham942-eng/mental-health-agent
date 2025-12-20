import { chatCompletion, ChatMessage } from './deepseek';
import { UI_TOOLS } from './tools';

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

**流程引导**：
- 如果信息不足以让用户产生洞察，继续温和追问。
- 当你对用户的基本情况（SCEB）有了清晰了解且确认用户处于安全状态时，请调用 \`finish_assessment\` 工具结束对话并生成总结。`;

/**
 * 继续评估对话
 */
export async function continueAssessment(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<{ reply: string; isConclusion: boolean }> {
  const messages: ChatMessage[] = [
    { role: 'system', content: ASSESSMENT_LOOP_PROMPT },
    ...history.filter(m => (m.role as string) !== 'system').map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const result = await chatCompletion(messages, {
    temperature: 0.5,
    max_tokens: 400,
    tools: [FINISH_ASSESSMENT_TOOL, ...UI_TOOLS],
  });

  const isConclusion = result.toolCalls?.some(tc => tc.function.name === 'finish_assessment') || false;

  return {
    reply: result.reply,
    isConclusion,
  };
}
