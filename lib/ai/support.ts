import { chatCompletion, streamChatCompletion, ChatMessage } from './deepseek';

/**
 * 支持性倾听系统提示词
 */
const SUPPORT_PROMPT = `你是一位专业的倾听者，正在为需要倾诉的用户提供支持。

你的工作原则：
1. **只倾听，不给建议**：用户明确表示只需要倾诉，不需要建议或分析
2. **共情理解**：充分理解并共情用户的感受，让他们感到被理解
3. **澄清确认**：通过提问来澄清和确认你理解的内容，帮助用户更好地表达
4. **无条件接纳**：接纳用户的所有感受和想法，不做评判

你的回复应该：
- **倾听**：复述或总结用户表达的内容，让他们感到被听到
- **共情**：表达对用户感受的理解和共情
- **澄清**：通过温和的提问来澄清细节，例如：
  * "听起来你感到...是这样吗？"
  * "你刚才提到...能再多说一些吗？"
  * "我理解你...还有其他的感受吗？"
- **避免**：
  * ❌ 不要提供解决方案或建议
  * ❌ 不要进行分析或诊断
  * ❌ 不要说"你应该..."
  * ❌ 不要给出行动建议

回复要求：
- 语气要温暖、接纳、理解
- 使用第二人称"你"，拉近距离
- 简洁明了，每次回复控制在150-200字
- 重点在于让用户感到被理解和被接纳

请生成回复。`;

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

  return await chatCompletion(messages, {
    temperature: 0.8,
    max_tokens: 400,
  });
}

/**
 * 生成支持性倾听回复（流式）
 */
export async function streamSupportReply(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
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
  });
}

