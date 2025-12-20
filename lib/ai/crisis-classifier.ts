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
 * 
 * 设计原则：
 * 1. 使用 Structured Output (JSON Mode) 确保可靠性
 * 2. 宁可误报也不能漏判
 * 
 * @param userMessage 用户消息
 * @returns 分类结果
 */
export async function classifyCrisisIntent(
    userMessage: string
): Promise<CrisisClassificationResult> {
    const systemPrompt = `你是危机意图检测器。判断用户消息是否包含自杀、自残、结束生命的意图。
只输出JSON：{"crisis":true/false,"confidence":"high/medium/low"}
宁可误报也不能漏判。`;

    const userPrompt = `用户消息：${userMessage}`;

    try {
        const result = await chatStructuredCompletion(
            [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt },
            ],
            CrisisClassificationSchema,
            {
                temperature: 0,
                max_tokens: 50,
            }
        );

        return {
            isCrisis: result.crisis,
            confidence: result.confidence,
            reason: result.reason,
        };
    } catch (error) {
        console.error('[CrisisClassifier] LLM call failed:', error);
        // LLM 调用失败时，保守起见返回 false（依赖关键词匹配兜底）
        return { isCrisis: false, confidence: 'low' };
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
