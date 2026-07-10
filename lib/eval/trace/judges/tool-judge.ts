/**
 * 工具调用评测 Judge
 *
 * LLM Judge：评估工具调用的时机和选择是否恰当。
 * 复用 judges.ts 中 tool-invocation 的逻辑模式，简化为 trace 维度。
 *
 * 评判逻辑：
 * - 用户明确要求练习但无工具调用 → Wrong
 * - 不合时宜的工具推荐 → Wrong
 * - 首轮/探索阶段无工具 → Pass（自动通过）
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
- Pass: 工具调用时机恰当且选择正确，或者当前场景不需要工具调用而确实没有调用
- Wrong: 工具调用严重不当（用户明确要求但被忽略，或在不该调用时强行调用）
- Drift: 工具调用方向正确但不够精准（选择的工具不是最优但也不算错）

只输出 JSON。`;

const SYSTEM_PROMPT = `你是心理咨询工具使用评估专家，判断 AI 在对话中的工具调用是否恰当。

心灵树洞的可用工具:
- recommend_skill_card: 推荐解压工具卡片（呼吸练习、正念冥想、空椅子对话、情绪记录）
- start_guided_exercise: 启动 AI 引导练习（接地练习、认知重构、行为激活、空椅子对话）
- show_quick_replies: 展示选择按钮（量表评估、确认选项）
- render_assessment_report: 生成深度了解报告

工具调用原则:
1. 大部分对话场景不需要工具，纯文字回复更合适 → 无工具调用通常是 Pass
2. 用户主动要求练习/放松/呼吸时必须响应 → 不调用工具是 Wrong
3. 首轮和探索阶段几乎不需要工具 → 无工具即 Pass
4. 用户情绪极度激动时推荐工具可能不合时宜 → 此时应先倾听
5. 工具选择应匹配需求（焦虑→呼吸练习，而非情绪记录）

注意:
- 不是每轮都需要调用工具
- 工具推荐应自然融入对话，不是生硬地塞给用户${COT_SUFFIX}`;

const USER_PROMPT_TEMPLATE = `用户消息: {userMessage}
对话历史:
{history}

当前上下文:
- 情绪标签: {emotionLabel}
- 情绪强度: {emotionScore}/10
- triage 路由: {routeType}

工具调用记录: {toolCalls}

请评估工具调用的时机和选择是否恰当。如果没有工具调用，请判断是否应该有。`;

export async function judge(
  input: TraceEvalInput,
  config: { apiKey: string; apiUrl: string; model: string },
): Promise<StepEvalResult> {
  const hasToolCalls = input.toolCalls && input.toolCalls.length > 0;
  const isFirstTurn = !input.history || input.history.length === 0;

  // 首轮/探索阶段无工具 → 自动通过
  if (!hasToolCalls && isFirstTurn) {
    return {
      step: 'tool',
      verdict: 'Pass',
      critique: '首轮对话无工具调用，符合预期',
    };
  }

  const historyText = input.history
    ?.map(h => `${h.role === 'user' ? '用户' : 'AI'}: ${h.content}`)
    .join('\n') || '（无历史消息）';

  const toolCallsText = hasToolCalls
    ? JSON.stringify(input.toolCalls, null, 2)
    : '（无工具调用）';

  const userPrompt = USER_PROMPT_TEMPLATE
    .replace('{userMessage}', input.userMessage)
    .replace('{history}', historyText)
    .replace('{emotionLabel}', input.emotionData.label)
    .replace('{emotionScore}', String(input.emotionData.score))
    .replace('{routeType}', input.routeType)
    .replace('{toolCalls}', toolCallsText);

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
        step: 'tool',
        verdict,
        critique: parsed.critique || '',
        reasoning: parsed.reasoning || '',
      };
    }

    return { step: 'tool', verdict: 'Wrong', critique: `Judge 输出解析失败: ${text.slice(0, 100)}` };
  } catch (err: any) {
    return { step: 'tool', verdict: 'Skip', critique: `Judge 调用失败: ${err.message}` };
  }
}
