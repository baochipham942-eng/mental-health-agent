import { chatCompletion, streamChatCompletion, ChatMessage } from './deepseek';
import { UI_TOOLS } from './tools';
import { IDENTITY_PROMPT, SAFETY_PROMPT, INTERACTIVE_RULES_PROMPT } from './prompts';

/**
 * 危机干预系统提示词 - 整合版
 */
const CRISIS_PROMPT = `${IDENTITY_PROMPT}

${SAFETY_PROMPT}

你正在处理紧急情况。必须确保用户安全。

**关键判断**：
- 如果用户**已明确表达**"已经计划好了"、"已经准备好了"、"有具体计划"等，说明情况非常紧急，**不要再询问频率**，直接进入紧急干预。
- 如果用户表达的是模糊的想法（如"不想活""活着没意义"），可以通过 show_quick_replies 工具询问频率以评估风险级别。

**回复要求**：
1. **情况紧急时**（用户已表达有计划）：
   - 表达强烈关心和共情
   - 立即提供热线：400-161-9995 或 110/120
   - 要求"立刻移开任何可能伤害自己的物品"
   - 要求"现在就联系一个信任的人，不要一个人待着"
   - **不要调用 show_quick_replies**

2. **情况需评估时**（用户表达模糊想法）：
   - 先共情和确认安全
   - 调用 show_quick_replies(mode: 'riskChoice') 来评估想法频率
   - 根据回复进入相应干预

回复控制在 300 字左右，语气坚定但温暖。`;

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
  options?: { onFinish?: (text: string, toolCalls?: any[]) => Promise<void>; traceMetadata?: Record<string, any> }
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
    enableTools: true, // Use unified SDK_TOOLS format
    traceMetadata: options?.traceMetadata,
  });
}
