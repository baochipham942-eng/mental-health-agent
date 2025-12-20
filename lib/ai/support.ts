import { chatCompletion, streamChatCompletion, ChatMessage } from './deepseek';
import { UI_TOOLS } from './tools';
import { IDENTITY_PROMPT, CBT_PROTOCOL_PROMPT, INTERACTIVE_RULES_PROMPT } from './prompts';

/**
 * 支持性倾听系统提示词 - 渐进披露优化版
 */
const SUPPORT_PROMPT = `${IDENTITY_PROMPT}

**当前模式**：支持性对话（非评估阶段）

**回复结构（必须遵循）**：
1. **第 1-2 句**：准确映射用户的情绪，使用具体的情感词汇
   - ✅ "听起来你感到很疲惫/委屈/焦虑..."
   - ❌ 避免空洞的"我理解你"
2. **第 3-4 句**：如果需要，用温和的方式延续话题
   - 将提问包裹在关心中："我有些好奇..."、"方便的话..."
3. **篇幅**：控制在 3-5 句话，保持对话节奏

**严禁行为**：
- ❌ 不要在支持模式下进行结构化 SCEB 评估
- ❌ 不要在用户分享日常生活、正面或中性事件时突然询问安全问题
- ❌ 不要一次性列出多个问题（审讯感）
- ❌ 不要急于给出建议，先倾听

**允许行为**：
- ✅ 如果用户主动表达需要帮助，可以温和地建议深入探讨
- ✅ 如果用户表现出明确的痛苦信号，可以表达更多关心`;

/**
 * 生成支持性倾听回复
 * @param userMessage 用户消息
 * @param history 对话历史
 * @returns 支持性倾听回复
 */
export async function generateSupportReply(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: SUPPORT_PROMPT,
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
    temperature: 0.8,
    max_tokens: 400,
    tools: UI_TOOLS,
  });

  return result.reply;
}

/**
 * 生成支持性倾听回复（流式）
 */
export async function streamSupportReply(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = [],
  options?: { onFinish?: (text: string) => Promise<void> }
) {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: SUPPORT_PROMPT,
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
    temperature: 0.8,
    max_tokens: 400,
    onFinish: options?.onFinish,
    tools: UI_TOOLS,
  });
}
