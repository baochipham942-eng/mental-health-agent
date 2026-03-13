/**
 * 危机意图分类器
 *
 * Layer 1: quickCrisisCheck — DeepSeek few-shot（安全关键路径，可靠性优先）
 * Layer 2: triage agent — Groq 完整分析（soft-wait，速度优先）
 * Layer 3: classifyCrisisIntent — DeepSeek 深度分类（慢，按需）
 */

import { generateText } from 'ai';
import { chatStructuredCompletion } from './deepseek';
import { CrisisClassificationSchema } from './schemas';

/**
 * 危机分类结果
 */
export interface CrisisClassificationResult {
    isCrisis: boolean;
    confidence: 'high' | 'medium' | 'low';
    reason?: string;
}

// ========== Layer 1: Few-shot 快速危机检测 ==========

const CRISIS_FEW_SHOT_PROMPT = `判断用户消息是否包含明确的自杀、自伤或结束生命的意图。只回答 YES 或 NO。
注意：仅当消息中有明确的死亡/自伤意愿时才回答 YES。普通的负面情绪、压力、低落不算。

YES 的例子（有明确自杀/自伤意图）：
用户：我想割腕 → YES
用户：活着真没意思，不如一了百了 → YES
用户：有时候觉得不想活了 → YES
用户：好想永远睡过去不再醒来 → YES
用户：这个世界没有我会更好 → YES
用户：我已经写好遗书了 → YES
用户：活着好累，不如死了算了 → YES

NO 的例子（普通负面情绪，没有自杀/自伤意图）：
用户：最近工作压力好大 → NO
用户：今天真的累死了 → NO
用户：最近状态越来越差了 → NO
用户：被领导骂了好生气 → NO
用户：失眠快一个月了，什么都提不起劲 → NO
用户：心情很低落，什么都不想做 → NO
用户：跟男朋友吵架了想分手 → NO
用户：觉得自己很没用 → NO
用户：好绝望啊 → NO

用户：`;

/**
 * Layer 1: 基于 DeepSeek few-shot 的快速危机检测
 * 安全关键路径直接用最可靠的模型，不走 fast-model 路由
 * DeepSeek 国内直连无需代理，稳定性优先于速度
 */
export async function quickCrisisCheck(
    message: string,
    timeoutMs = Number(process.env.CRISIS_CHECK_TIMEOUT_MS || 1500),
): Promise<boolean> {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekKey) return false;

    try {
        const { createOpenAI } = await import('@ai-sdk/openai');
        const deepseek = createOpenAI({
            baseURL: process.env.DEEPSEEK_API_URL?.replace(/\/chat\/completions$/, '') || 'https://api.deepseek.com/v1',
            apiKey: deepseekKey,
        });

        const result = await Promise.race([
            generateText({
                model: deepseek(process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat'),
                prompt: CRISIS_FEW_SHOT_PROMPT + message,
                temperature: 0,
                maxTokens: 3,
            }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
        ]);

        if (!result) {
            console.log('[CrisisCheck] DeepSeek timeout');
            return false;
        }

        const answer = result.text.trim().toUpperCase();
        return answer.startsWith('YES');
    } catch (error) {
        console.warn('[CrisisCheck] DeepSeek failed:', error instanceof Error ? error.message : error);
        return false;
    }
}

// ========== Layer 3: DeepSeek 深度危机分类 ==========

/**
 * 使用 DeepSeek 判断用户消息是否包含危机意图（慢，按需调用）
 */
export async function classifyCrisisIntent(
    userMessage: string
): Promise<CrisisClassificationResult> {
    const systemPrompt = `你是危机意图检测器。专门负责识别用户消息中是否包含自杀、自残、严重自伤或结束生命的意念与计划。

**输出格式**：必须返回纯 JSON，格式如下：
{
  "crisis": boolean (是否包含危机意图),
  "confidence": "high" | "medium" | "low" (置信度),
  "reason": "string" (简短的判定理由)
}

**判定原则**：
1. 宁可误报也不能漏判。
2. 只要有死亡意愿、自残冲动或具体的自杀计划描述，必须设 crisis 为 true。
3. 即使语气委婉（如"想解脱"、"不想再醒来"），也应保持警惕。`;

    const userPrompt = `用户消息：${userMessage}`;

    const callAt = async (temp: number) => {
        return await chatStructuredCompletion(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            CrisisClassificationSchema,
            {
                temperature: temp,
                max_tokens: 150,
            }
        );
    };

    try {
        const result = await callAt(0.3);
        return {
            isCrisis: result.crisis,
            confidence: result.confidence,
            reason: result.reason,
        };
    } catch (error) {
        console.warn('[CrisisClassifier] First attempt failed, retrying...', error);
        try {
            const result = await callAt(0.5);
            return {
                isCrisis: result.crisis,
                confidence: result.confidence,
                reason: result.reason,
            };
        } catch (retryError) {
            console.error('[CrisisClassifier] All attempts failed:', retryError);
            return { isCrisis: false, confidence: 'low' };
        }
    }
}

// ========== 向后兼容 ==========

/**
 * @deprecated 使用 quickCrisisCheck 代替（few-shot 语义判断）
 * 保留导出以避免未更新的调用方编译失败
 */
export function quickCrisisKeywordCheck(message: string): boolean {
    console.warn('[CrisisClassifier] quickCrisisKeywordCheck is deprecated, use quickCrisisCheck instead');
    // 仅保留最明确的行为类关键词作为同步兜底
    const actionKeywords = ['割腕', '跳楼', '跳河', '上吊', '烧炭', '服毒', '吞药', '遗书'];
    return actionKeywords.some(kw => message.includes(kw));
}
