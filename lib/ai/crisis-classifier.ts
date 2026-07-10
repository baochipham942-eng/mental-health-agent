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

export const CRISIS_FEW_SHOT_PROMPT = `判断用户消息是否包含明确的自杀、自伤或结束生命的意图。只回答 YES 或 NO。
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
 * 同步关键词检测：覆盖常见的危机意图表达
 * 用于 LLM 超时/失败时的保守兜底（宁可误报不可漏判）
 */
const CRISIS_INTENT_KEYWORDS = [
    '不想活', '想死', '去死', '自杀', '自残', '自伤',
    '割腕', '跳楼', '跳河', '上吊', '烧炭', '服毒', '吞药',
    '遗书', '一了百了', '不如死', '结束生命', '了结',
    '永远睡', '没有我会更好', '活着没意义', '活着没有意义',
];

function crisisKeywordFallback(message: string): boolean {
    return CRISIS_INTENT_KEYWORDS.some(kw => message.includes(kw));
}

/**
 * Layer 1: 基于 DeepSeek few-shot 的快速危机检测
 * 安全关键路径直接用最可靠的模型，不走 fast-model 路由
 * DeepSeek 国内直连无需代理，稳定性优先于速度
 *
 * 安全兜底：LLM 超时/失败时回退到关键词检测（宁可误报不可漏判）
 */
export async function quickCrisisCheck(
    message: string,
    timeoutMs = Number(process.env.CRISIS_CHECK_TIMEOUT_MS || 1500),
): Promise<boolean> {
    const deepseekKey = process.env.DEEPSEEK_API_KEY;
    if (!deepseekKey) return crisisKeywordFallback(message);

    try {
        const { deepseek, DEEPSEEK_MODEL } = await import('@/lib/ai/deepseek');

        const result = await Promise.race([
            generateText({
                model: deepseek(DEEPSEEK_MODEL),
                prompt: CRISIS_FEW_SHOT_PROMPT + message,
                temperature: 0,
                maxOutputTokens: 3,
            }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
        ]);

        if (!result) {
            console.log('[CrisisCheck] DeepSeek timeout, falling back to keyword check');
            return crisisKeywordFallback(message);
        }

        const answer = result.text.trim().toUpperCase();
        return answer.startsWith('YES');
    } catch (error) {
        console.warn('[CrisisCheck] DeepSeek failed, falling back to keyword check:', error instanceof Error ? error.message : error);
        return crisisKeywordFallback(message);
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

// ========== Layer 4: 危机脱离评估 ==========

/**
 * 危机脱离评估结果
 */
export interface DeescalationResult {
    isSafe: boolean;
    confidence: 'high' | 'medium' | 'low';
    reason: string;
}

export const DEESCALATION_FEW_SHOT_PROMPT = `你是心理危机评估专家。用户当前处于危机状态，请根据用户的最新消息和对话历史，判断用户是否**真正**脱离了危机。

**判断原则**：
1. 宁可保守也不能轻率脱离危机状态
2. 用户说"我没事了"不一定真的没事——要结合上下文判断是否是伪装、敷衍或回避
3. 只有当用户表现出明确的情绪好转、具体的安全计划或合理的后续打算时，才判定为安全
4. "换个话题"、"不聊了"等回避性表达不等于脱离危机

**返回 JSON**：
{
  "isSafe": boolean,
  "confidence": "high" | "medium" | "low",
  "reason": "简短的判定理由"
}

**示例**：
用户（危机中）："我没事了" → {"isSafe": false, "confidence": "medium", "reason": "仅有简单否认，缺乏具体好转证据"}
用户（危机中）："谢谢你陪我聊，我打算先去洗个澡，明天跟朋友约了吃饭" → {"isSafe": true, "confidence": "high", "reason": "有具体的后续计划和社交支持"}
用户（危机中）："不聊了，烦" → {"isSafe": false, "confidence": "high", "reason": "回避性表达，情绪仍然负面"}
用户（危机中）："我刚才太冲动了，现在冷静下来了，不会做傻事的" → {"isSafe": true, "confidence": "medium", "reason": "表达了自我反思和承诺，但需继续观察"}`;

const DeescalationSchema = {
    parse: (val: unknown) => {
        const obj = val as Record<string, unknown>;
        return {
            isSafe: Boolean(obj.isSafe),
            confidence: (obj.confidence as 'high' | 'medium' | 'low') || 'low',
            reason: String(obj.reason || ''),
        };
    },
};

/**
 * Layer 4: 基于 LLM 的危机脱离评估
 * 替代硬编码正则，用语义理解判断用户是否真正脱离危机
 * 超时降级：保守地保持危机状态（宁可多保护）
 */
export async function assessCrisisDeescalation(
    message: string,
    history: Array<{ role: string; content: string }>,
    timeoutMs = Number(process.env.DEESCALATION_TIMEOUT_MS || 2000),
): Promise<DeescalationResult> {
    try {
        const recentHistory = history.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
        const userPrompt = recentHistory
            ? `对话历史（最近几轮）：\n${recentHistory}\n\n用户最新消息：${message}`
            : `用户最新消息：${message}`;

        const resultPromise = chatStructuredCompletion(
            [
                { role: 'system', content: DEESCALATION_FEW_SHOT_PROMPT },
                { role: 'user', content: userPrompt },
            ],
            DeescalationSchema,
            { temperature: 0, max_tokens: 150 },
        );

        const result = await Promise.race([
            resultPromise,
            new Promise<null>((resolve) => setTimeout(() => resolve(null), timeoutMs)),
        ]);

        if (!result) {
            console.log('[Deescalation] LLM timeout, staying in crisis (conservative)');
            return { isSafe: false, confidence: 'low', reason: 'LLM 评估超时，保守保持危机状态' };
        }

        console.log('[Deescalation] LLM assessment:', result);
        return result;
    } catch (error) {
        console.warn('[Deescalation] LLM failed, staying in crisis:', error instanceof Error ? error.message : error);
        return { isSafe: false, confidence: 'low', reason: 'LLM 评估失败，保守保持危机状态' };
    }
}

// ========== 向后兼容 ==========

/**
 * @deprecated 使用 quickCrisisCheck 代替（few-shot 语义判断）
 * 保留导出以避免未更新的调用方编译失败
 */
export function quickCrisisKeywordCheck(message: string): boolean {
    console.warn('[CrisisClassifier] quickCrisisKeywordCheck is deprecated, use quickCrisisCheck instead');
    return crisisKeywordFallback(message);
}
