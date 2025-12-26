/**
 * 启发式安全守卫 (Heuristic Safety Guard)
 * 
 * 用于对 LLM 的安全分级进行二次校验。
 * 解决问题：LLM (如 Llama 3) 对抑郁症状（累、没意义）过于敏感，容易误报为危机。
 * 逻辑：如果 LLM 标记为 Urgent/Crisis，但用户输入中缺乏明确的高危关键词，则降级为 Normal。
 */

// 高危关键词/正则库 - 定期更新
// 包含：自杀明确意图、具体计划、告别语、严重自伤方式
// 使用 Regex Lookbehind (?<!...) 排除 "累死了"、"气死了" 等口头语
export const HIGH_RISK_PATTERNS = [
    /(?<!累|笑|气|烦|饿|困|吓|美|丑|热|冷|痛)死(?!机|循环|扣|结|心|皮|去)/, // 排除: 累死了, 死机, 死心, 死皮赖脸等
    /自杀/,
    /不想活/,
    /结束生命/,
    /活着没意思/,
    /轻生/,
    /跳楼/,
    /割腕/,
    /烧炭/,
    /安眠药/,
    /吞.{0,10}药/,   // 匹配 "吞药", "吞了一瓶药" (允许中间隔10个字)
    /大量.*药/, // 匹配 "大量服药", "吃了大量药"
    /永别了/,   // 替换 "别了" (防止 "别了" = do not)
    /来世.*再见/, // 替换 "再见" (防止 friendly goodbye)
    /下辈子/,
    /自我了断/
];

export interface SafetyCheckResult {
    safety: 'normal' | 'urgent' | 'crisis';
    isDowngraded: boolean;
    reason?: string;
}

/**
 * 执行启发式安全检查
 * @param message 用户消息
 * @param llmSafety LLM 初步判断的安全等级
 * @returns 最终的安全等级及修正信息
 */
export function runHeuristicSafetyCheck(message: string, llmSafety: string): SafetyCheckResult {
    // 1. 如果 LLM 认为是 Normal，无需干预
    if (llmSafety === 'normal') {
        return { safety: 'normal', isDowngraded: false };
    }

    // 2. 如果 LLM 标记为 Urgent 或 Crisis，进行关键词校验
    if (llmSafety === 'urgent' || llmSafety === 'crisis') {
        // 只要匹配到一个高危模式，就视为命中
        const hasRiskPattern = HIGH_RISK_PATTERNS.some(pattern => pattern.test(message));

        if (!hasRiskPattern) {
            // 降级触发 (LLM 报了 Crisis 但没匹配到硬性高危词)
            return {
                safety: 'normal',
                isDowngraded: true,
                reason: '[Auto-corrected: No explicit risk keywords found]'
            };
        }
    }

    // 3. 默认维持原判
    return {
        safety: llmSafety as 'normal' | 'urgent' | 'crisis',
        isDowngraded: false
    };
}
