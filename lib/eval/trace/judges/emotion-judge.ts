/**
 * 情绪识别评测 Judge
 *
 * LLM Judge：判断 emotion agent 输出的情绪标签和强度评分是否准确。
 *
 * 评判逻辑：
 * - 明显错误（用户愤怒判为快乐）→ Wrong
 * - 强度偏差过大（±3 以上）→ Wrong
 * - 微调偏差（±1-2）→ Drift
 */

import type { TraceEvalInput, StepEvalResult } from '../types';
import { withThinkingDisabled } from '@/lib/ai/deepseek';

/** CoT 输出格式后缀 */
const COT_SUFFIX = `

## 输出格式
请严格按以下 JSON 格式输出:
{
  "reasoning": "2-3句分析过程",
  "result": "Pass" 或 "Wrong" 或 "Drift",
  "critique": "一句话结论"
}

判定标准:
- Pass: 情绪标签正确，强度评分与用户表达的情绪程度一致（偏差 ±1 以内）
- Wrong: 情绪标签完全错误（如用户明显愤怒却标记为快乐），或强度偏差 ≥3
- Drift: 情绪标签大致正确但不够精准（如标记为"悲伤"但实际更接近"失望"），或强度偏差 ±1-2

只输出 JSON。`;

const SYSTEM_PROMPT = `你是情绪识别准确性评估专家，判断 AI 对用户情绪的识别是否准确。

心灵树洞支持的情绪标签:
焦虑(anxiety)、抑郁(depression)、愤怒(anger)、悲伤(sadness)、恐惧(fear)、
快乐(happiness)、平静(calm)、未表达(unexpressed)、压力(stress)、疲惫(fatigue)、情绪低落(low_mood)

强度评分: 0-10（0=几乎没有，10=极端强烈）

判断原则:
1. 情绪标签的"大方向"最重要
   - 负面情绪之间的细分（焦虑 vs 压力）容许一定模糊 → Drift
   - 正面与负面混淆（快乐 vs 悲伤）→ Wrong
   - 高激活与低激活混淆（愤怒 vs 平静）→ Wrong
2. 强度评分要与用户表达的程度匹配
   - "有点烦" → 3-5 合理，判 8 就偏高（Drift 或 Wrong）
   - "快疯了" → 7-9 合理，判 3 就偏低（Wrong）
   - 偏差 ±1 → Pass
   - 偏差 ±2 → Drift
   - 偏差 ≥3 → Wrong
3. "未表达"标签适用于用户未直接表达情绪的信息性消息
   - 用户只是问问题/打招呼 → "未表达"是正确的
   - 用户话语中隐含强烈情绪却标为"未表达" → Wrong

注意:
- 情绪识别需要考虑中文语境中的表达习惯
- "还行""还好"可能是掩饰，需要结合上下文判断
- 同时表达多种情绪时，主导情绪应被识别${COT_SUFFIX}`;

const USER_PROMPT_TEMPLATE = `用户消息: {userMessage}
对话历史:
{history}

emotion agent 的识别结果:
- 情绪标签: {emotionLabel}
- 情绪强度: {emotionScore}/10

请评估这个情绪识别结果是否准确。请先根据用户消息独立判断情绪，然后与 agent 的结果对比。`;

export async function judge(
  input: TraceEvalInput,
  config: { apiKey: string; apiUrl: string; model: string },
): Promise<StepEvalResult> {
  const historyText = input.history
    ?.map(h => `${h.role === 'user' ? '用户' : 'AI'}: ${h.content}`)
    .join('\n') || '（无历史消息）';

  const userPrompt = USER_PROMPT_TEMPLATE
    .replace('{userMessage}', input.userMessage)
    .replace('{history}', historyText)
    .replace('{emotionLabel}', input.emotionData.label)
    .replace('{emotionScore}', String(input.emotionData.score));

  try {
    const response = await fetch(`${config.apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(withThinkingDisabled({
        model: config.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0,
        max_tokens: 400,
      })),
    });

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);

    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      let verdict: StepEvalResult['verdict'] = 'Wrong';
      if (parsed.result === 'Pass') verdict = 'Pass';
      else if (parsed.result === 'Drift') verdict = 'Drift';

      return {
        step: 'emotion',
        verdict,
        critique: parsed.critique || '',
        reasoning: parsed.reasoning || '',
      };
    }

    return { step: 'emotion', verdict: 'Wrong', critique: `Judge 输出解析失败: ${text.slice(0, 100)}` };
  } catch (err: any) {
    return { step: 'emotion', verdict: 'Skip', critique: `Judge 调用失败: ${err.message}` };
  }
}
