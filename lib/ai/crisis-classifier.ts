/**
 * 危机意图分类器
 * 使用 LLM 进行语义级别的危机意图检测
 */

import { chatCompletion, chatStructuredCompletion } from './deepseek';
import { CrisisClassificationSchema } from './schemas';

/**
 * 危机分类结果
 */
export interface CrisisClassificationResult {
    isCrisis: boolean;
    confidence: 'high' | 'medium' | 'low';
    reason?: string;
}

/**
 * 使用 LLM 判断用户消息是否包含危机意图
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
        // 第一尝试，低温度确保一致性
        const result = await callAt(0.3);
        return {
            isCrisis: result.crisis,
            confidence: result.confidence,
            reason: result.reason,
        };
    } catch (error) {
        console.warn('[CrisisClassifier] First attempt failed, retrying...', error);
        try {
            // 第二次尝试，稍高温度
            const result = await callAt(0.5);
            return {
                isCrisis: result.crisis,
                confidence: result.confidence,
                reason: result.reason,
            };
        } catch (retryError) {
            console.error('[CrisisClassifier] All attempts failed:', retryError);
            // 兜底：如果解析一再失败，出于安全考虑，如果关键词命中则由 Layer 1 处理
            // 这里的语义层返回 false，让外部组合逻辑生效
            return { isCrisis: false, confidence: 'low' };
        }
    }
}

/**
 * 快速关键词预检（Layer 1: 基于规则的快速拦截）
 * 
 * 词库来源参考：
 * 1.C-SSRS (Columbia-Suicide Severity Rating Scale) 风险标识
 * 2. 临床心理危机干预常用词表
 * 3. 社交媒体自杀风险识别学术研究 (e.g., "Pills", "Sleep forever", "No way out")
 */
export function quickCrisisKeywordCheck(message: string): boolean {
    const lowerMessage = message.toLowerCase();

    // 1. 行为/方法类 (Method/Action) - 极高风险
    // 涉及具体实施手段或准备行为
    const actionKeywords = [
        '割腕', '跳楼', '跳河', '上吊', '烧炭', '服毒', '吞药', '吃药自杀',
        '安眠药自杀', '结束生命', '结束自己', '在此告别', '遗书', '写遗书'
    ];

    // 2. 意念/愿望类 (Ideation/Wish) - 高风险
    // 表达死亡愿望或不想活的念头
    const ideationKeywords = [
        '不想活了', '没意思', '活不下去', '想死', '去死', '死了算了',
        '离开这个世界', '离开世界', '下辈子', '不再醒来', '一直睡下去'
    ];

    // 3. 绝望/无助类 (Hopelessness) - 敏感词（仅供 LLM 参考，不直接拦截）
    // "毫无意义"、"彻底绝望" 等词汇在非自杀语境（如 "这部电影毫无意义"）中常见
    // 因此这里不再保留 Tier 3 的直接拦截列表，防止误报。
    // 这些模糊意图完全交给 LLM (classifyCrisisIntent) 去判断。

    // 检查逻辑：
    // 只拦截 Tier 1 (行为) 和 Tier 2 (意念) 的高置信度词汇
    const hasHighRisk = [...actionKeywords, ...ideationKeywords].some(kw => lowerMessage.includes(kw));

    return hasHighRisk;
}
