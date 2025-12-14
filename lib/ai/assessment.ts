import { chatCompletion, ChatMessage } from './deepseek';

/**
 * 心理评估初筛系统提示词
 */
const ASSESSMENT_PROMPT = `你是一位专业的心理评估师，正在进行心理问题的初筛评估。

你的任务：
通过询问3个固定问题来初步了解用户的情况，这些问题有助于评估心理问题的严重程度和类型。

**必须询问的3个固定问题**（按顺序）：

1. **持续时间**：
   "这种情况持续了多长时间？是最近才出现的，还是已经持续了一段时间？"

2. **功能影响程度**：
   "这些困扰对你的日常生活、工作或学习造成了多大影响？比如是否影响了你的睡眠、饮食、社交或工作效率？"

3. **是否出现自伤念头**：
   "在感到困扰的时候，你是否出现过伤害自己或结束生命的想法？"

回复要求：
- 语气要专业、温和、非评判性
- 使用第二人称"你"，拉近距离
- 先简要共情用户的感受（1-2句话）
- 然后自然地引出这3个问题
- 可以一次性提出所有问题，也可以逐步询问
- 回复长度控制在200-300字
- 必须包含以上3个问题的核心内容

请生成回复。`;

/**
 * 生成心理评估初筛问题
 * @param userMessage 用户消息
 * @param history 对话历史
 * @returns 包含3个固定评估问题的回复
 */
export async function generateAssessmentQuestions(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: ASSESSMENT_PROMPT,
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
    temperature: 0.7,
    max_tokens: 500,
  });
}

