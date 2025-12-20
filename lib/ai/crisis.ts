import { chatCompletion, streamChatCompletion, ChatMessage } from './deepseek';
import { UI_TOOLS } from './tools';
import { IDENTITY_PROMPT, SAFETY_PROMPT, INTERACTIVE_RULES_PROMPT } from './prompts';

/**
 * 危机干预系统提示词 - 整合版
 */
const CRISIS_PROMPT = `${IDENTITY_PROMPT}

${SAFETY_PROMPT}

${INTERACTIVE_RULES_PROMPT}

你正在处理紧急情况。必须确保用户安全。
回复必须包含：
1. **确认问题**：带问号的提问（如：你现在安全吗？）。
2. **安全边界**：强调生命价值与希望。
3. **即刻行动**：明确要求“移开危险物”且“联系信任的人/不要一个人”。
4. **资源提供**：必须提供 400-161-9995 或 110/120。

请严格执行，回复控制在 300 字左右。`;

/**
 * 危机干预后续对话提示词
 */
const CRISIS_FOLLOWUP_PROMPT = `${IDENTITY_PROMPT}

${SAFETY_PROMPT}

这是之前的干预后续。目标是确认安全执行情况，并持续提供共情支持。
- 确认用户是否已移开危险物。
- 如果用户好转，给予肯定。
- 如果仍有风险，继续安抚并保留热线信息。`;

/**
 * 生成危机干预回复
 */
export async function generateCrisisReply(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: CRISIS_PROMPT,
    },
    ...history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user',
      content: userMessage,
    },
  ];

  const result = await chatCompletion(messages, {
    temperature: 0.7,
    max_tokens: 600,
  });

  return result.reply;
}

/**
 * 生成危机干预回复（流式）
 */
export async function streamCrisisReply(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  isFollowupOrHotlines: boolean | string = false,
  options?: { onFinish?: (text: string) => Promise<void> }
) {
  const isFollowup = typeof isFollowupOrHotlines === 'boolean' ? isFollowupOrHotlines : false;
  const hotlinesContext = typeof isFollowupOrHotlines === 'string' ? isFollowupOrHotlines : '';

  let systemPrompt = isFollowup ? CRISIS_FOLLOWUP_PROMPT : CRISIS_PROMPT;

  if (hotlinesContext) {
    systemPrompt = `${systemPrompt}\n\n## 可用热线资源\n${hotlinesContext}`;
  }

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: systemPrompt,
    },
    ...history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user',
      content: userMessage,
    },
  ];

  return await streamChatCompletion(messages, {
    temperature: 0.7,
    max_tokens: 600,
    onFinish: options?.onFinish,
    tools: UI_TOOLS,
  });
}
