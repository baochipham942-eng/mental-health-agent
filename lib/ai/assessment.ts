import { chatCompletion, ChatMessage } from './deepseek';

/**
 * 心理评估持续对话 Prompt (MVP Simplified)
 * 采用 提示词驱动 (Prompt-Driven) 策略，让 LLM 自主决定何时结束评估。
 */
const ASSESSMENT_LOOP_PROMPT = `你是一位专业的心理咨询师，正在进行初步评估（Intake Session）。

**你的目标**：
全面了解来访者的困扰，特别是基于 CBT 模型的 SCEB 要素：
1. **情境 (Situation)**：发生了什么事？（如：工作压力、人际冲突）
2. **认知 (Cognition)**：你当时的想法是什么？（如："我肯定会失败"、"没人喜欢我"）
3. **情绪 (Emotion)**：你的感受如何？（如：焦虑、抑郁、愤怒）
4. **行为 (Behavior)**：你做了什么？（如：逃避、失眠、暴饮暴食）

**及风险评估（必须）**：
- 必须确认是否存在**自伤/自杀风险**（意念、计划、既往史）。

**流程规则**：
1. **提问阶段**：如果信息不全，请继续温和地追问。
   - 如果用户已经描述了大致情境（如"被老板骗了"），**不要**再问"发生了什么"，请使用"具体经过"、"细节"或"当时的想法"等词汇替代，以避免重复感。
   - **风险评估时机**：如果用户表达了**极度痛苦、绝望**或**意图不清**，必须**立即**询问自伤风险。如果用户只是表达**轻微**的压力或烦恼（如"工作压力大"、"心里烦"），**不要**在第一轮就问自杀风险，先关注问题本身。
2. **结束阶段**：如果你觉得已经收集了足够的信息（覆盖了 SCEB 和风险），或者用户表达了想结束评估的意愿，请在一个新段落中输出特殊标记：\`[CONCLUSION]\`。

**回复要求**：
- 语气专业、温和、共情。
- 始终使用第二人称"你"。
- 不要急于给出建议，先聚焦于"收集信息"。
- 如果用户有自伤风险，请优先关注安全，并尽快结束评估（输出 \`[CONCLUSION]\`）以便进入干预阶段。

**示例**：
- 追问情境："你能多说说当时具体发生了什么事让你感到这么焦虑吗？"
- 追问想法："在那一刻，你脑海里闪过的想法是什么？"
- 结束标记："我大概了解了你的情况。让我们来总结一下。
  
  [CONCLUSION]"`;

/**
 * 继续评估对话
 * @param userMessage 用户最新消息
 * @param history 对话历史
 * @returns LLM 回复
 */
export async function continueAssessment(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<{ reply: string; isConclusion: boolean }> {
  // 构建消息历史，确保 System Prompt 在首位
  const messages: ChatMessage[] = [
    { role: 'system', content: ASSESSMENT_LOOP_PROMPT },
    // 过滤掉之前的 System Prompt (如果有)，避免重复
    ...history.filter(m => (m.role as string) !== 'system').map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    { role: 'user', content: userMessage },
  ];

  const reply = await chatCompletion(messages, {
    temperature: 0.5, // 稍微灵活一点，利于多轮对话
    max_tokens: 400,
  });

  // 检测结束标记
  const isConclusion = reply.includes('[CONCLUSION]');

  // 移除标记，避免展示给用户
  const cleanReply = reply.replace(/\[CONCLUSION\]/g, '').trim();

  return {
    reply: cleanReply,
    isConclusion,
  };
}
