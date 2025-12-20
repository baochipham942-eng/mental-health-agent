/**
 * 风险信号检测器
 * 用于上下文感知的安全评估触发
 */

/**
 * 风险等级
 */
export type RiskLevel = 'low' | 'medium' | 'high' | 'crisis';

/**
 * 风险信号分析结果
 */
export interface RiskSignalResult {
    level: RiskLevel;
    score: number;          // 0-10
    triggeredSignals: string[];
    shouldTriggerSafetyAssessment: boolean;
}

/**
 * 低风险信号 - 日常生活话题
 * 触发这些信号时，严禁进行安全评估
 */
const LOW_RISK_SIGNALS = [
    '上班', '下班', '工作', '睡觉', '吃饭', '看电影', '看书',
    '朋友', '聚会', '学习', '考试', '运动', '散步', '购物',
    '做饭', '打游戏', '追剧', '周末', '休息', '旅游', '出差'
];

/**
 * 中等风险信号 - 负面情绪但无自伤倾向
 * 需要持续关注，但不立即触发安全评估
 */
const MEDIUM_RISK_SIGNALS = [
    '焦虑', '压力', '烦躁', '失眠', '疲惫', '紧张', '担心',
    '害怕', '生气', '愤怒', '委屈', '难过', '伤心', '低落',
    '孤独', '寂寞', '迷茫', '困惑', '无聊', '烦', '累'
];

/**
 * 高风险信号 - 绝望感、无助感
 * 需要温和地探索，可能需要安全评估
 */
const HIGH_RISK_SIGNALS = [
    '没意义', '没意思', '撑不下去', '看不到希望', '一直这样',
    '没人理解', '没人在乎', '累了', '不想动', '什么都不想做',
    '逃避', '躲起来', '消失', '解脱', '受不了了', '崩溃',
    '绝望', '无助', '没办法', '走投无路', '没有出路'
];

/**
 * 危机信号 - 明确的自伤意图
 * 必须立即触发安全评估
 */
const CRISIS_SIGNALS = [
    '不想活', '想死', '自杀', '结束生命', '结束自己',
    '离开这个世界', '一了百了', '死了算了', '活不下去',
    '伤害自己', '割腕', '跳楼', '跳河', '上吊', '服毒',
    '遗书', '告别', '下辈子', '不再醒来', '永远睡去'
];

/**
 * 分析用户消息的风险等级
 */
export function analyzeRiskSignals(message: string): RiskSignalResult {
    const lowerMessage = message.toLowerCase();
    const triggeredSignals: string[] = [];
    let maxLevel: RiskLevel = 'low';
    let score = 0;

    // 检查危机信号（最高优先级）
    for (const signal of CRISIS_SIGNALS) {
        if (lowerMessage.includes(signal)) {
            triggeredSignals.push(`[CRISIS] ${signal}`);
            maxLevel = 'crisis';
            score = 10;
        }
    }

    // 如果没有危机信号，检查高风险信号
    if (maxLevel !== 'crisis') {
        for (const signal of HIGH_RISK_SIGNALS) {
            if (lowerMessage.includes(signal)) {
                triggeredSignals.push(`[HIGH] ${signal}`);
                if (maxLevel !== 'high') {
                    maxLevel = 'high';
                    score = 7;
                }
            }
        }
    }

    // 如果没有高风险信号，检查中等风险信号
    if (maxLevel !== 'crisis' && maxLevel !== 'high') {
        for (const signal of MEDIUM_RISK_SIGNALS) {
            if (lowerMessage.includes(signal)) {
                triggeredSignals.push(`[MEDIUM] ${signal}`);
                if (maxLevel !== 'medium') {
                    maxLevel = 'medium';
                    score = 4;
                }
            }
        }
    }

    // 检查低风险信号（用于记录，不影响等级）
    if (triggeredSignals.length === 0) {
        for (const signal of LOW_RISK_SIGNALS) {
            if (lowerMessage.includes(signal)) {
                triggeredSignals.push(`[LOW] ${signal}`);
            }
        }
    }

    // 决定是否触发安全评估
    const shouldTriggerSafetyAssessment = maxLevel === 'crisis' || maxLevel === 'high';

    return {
        level: maxLevel,
        score,
        triggeredSignals,
        shouldTriggerSafetyAssessment,
    };
}

/**
 * 检查是否应该在当前轮次触发安全评估
 * 考虑对话轮次和累积风险
 */
export function shouldTriggerSafetyCheck(
    currentRisk: RiskSignalResult,
    conversationTurn: number,
    emotionScore?: number
): { shouldTrigger: boolean; reason: string } {
    // 危机信号：立即触发
    if (currentRisk.level === 'crisis') {
        return {
            shouldTrigger: true,
            reason: '检测到危机信号，需要立即进行安全评估',
        };
    }

    // 高风险信号 + 情绪分数高：触发
    if (currentRisk.level === 'high' && emotionScore && emotionScore >= 7) {
        return {
            shouldTrigger: true,
            reason: '检测到高风险信号且情绪强度较高',
        };
    }

    // 高风险信号 + 对话已深入（5轮以上）：触发
    if (currentRisk.level === 'high' && conversationTurn >= 5) {
        return {
            shouldTrigger: true,
            reason: '对话已深入且存在高风险信号',
        };
    }

    // 中等风险 + 持续对话（7轮以上）+ 情绪持续较高：可以触发
    if (currentRisk.level === 'medium' && conversationTurn >= 7 && emotionScore && emotionScore >= 6) {
        return {
            shouldTrigger: true,
            reason: '长时间对话中持续存在负面情绪',
        };
    }

    // 其他情况：不触发
    return {
        shouldTrigger: false,
        reason: '当前对话上下文不需要安全评估',
    };
}
