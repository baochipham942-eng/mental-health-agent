/**
 * 死循环检测引擎 (Stuck Loop Detector)
 * 
 * 包含三种异常检测器：
 * 1. AI 复读探测器 (Repetition Detector)
 * 2. 拒绝配合探测器 (Refusal Detector)
 * 3. 阶段滞留探测器 (Phase Timeout)
 */

import { prisma } from '@/lib/db/prisma';

export interface StuckLoopResult {
    isStuck: boolean;
    type?: 'REPETITION' | 'REFUSAL' | 'PHASE_TIMEOUT';
    severity: number; // 1-10
    summary: string;
    details?: Record<string, any>;
}

/**
 * 计算两个字符串的相似度 (Dice Coefficient)
 */
function diceCoefficient(str1: string, str2: string): number {
    if (str1 === str2) return 1;
    if (str1.length < 2 || str2.length < 2) return 0;

    const getBigrams = (str: string): Set<string> => {
        const bigrams = new Set<string>();
        for (let i = 0; i < str.length - 1; i++) {
            bigrams.add(str.slice(i, i + 2));
        }
        return bigrams;
    };

    const set1 = getBigrams(str1.toLowerCase());
    const set2 = getBigrams(str2.toLowerCase());

    let intersection = 0;
    set1.forEach(bigram => {
        if (set2.has(bigram)) intersection++;
    });

    return (2 * intersection) / (set1.size + set2.size);
}

/**
 * 1. AI 复读探测器
 * 检测 AI 是否连续输出高度相似的回复
 */
export function detectRepetition(
    assistantMessages: string[],
    threshold: number = 0.85,
    consecutiveCount: number = 3
): StuckLoopResult {
    if (assistantMessages.length < consecutiveCount) {
        return { isStuck: false, severity: 0, summary: '' };
    }

    // 取最近的 N 条
    const recentMessages = assistantMessages.slice(-consecutiveCount);

    // 两两计算相似度
    let allSimilar = true;
    let avgSimilarity = 0;
    let comparisons = 0;

    for (let i = 0; i < recentMessages.length - 1; i++) {
        for (let j = i + 1; j < recentMessages.length; j++) {
            const similarity = diceCoefficient(recentMessages[i], recentMessages[j]);
            avgSimilarity += similarity;
            comparisons++;
            if (similarity < threshold) {
                allSimilar = false;
            }
        }
    }

    avgSimilarity = comparisons > 0 ? avgSimilarity / comparisons : 0;

    if (allSimilar && avgSimilarity >= threshold) {
        return {
            isStuck: true,
            type: 'REPETITION',
            severity: Math.min(10, Math.round(avgSimilarity * 10)),
            summary: `AI 连续 ${consecutiveCount} 条回复高度相似 (相似度: ${(avgSimilarity * 100).toFixed(1)}%)`,
            details: { avgSimilarity, consecutiveCount }
        };
    }

    return { isStuck: false, severity: 0, summary: '' };
}

/**
 * 2. 拒绝配合探测器
 * 检测用户是否连续拒绝回答问题
 */
export function detectRefusal(
    userMessages: string[],
    consecutiveThreshold: number = 2
): StuckLoopResult {
    const refusalPatterns = [
        '不知道', '不想说', '不想回答', '不告诉你', '不方便说',
        '算了', '没什么', '别问了', '烦不烦', '能不能别问',
        '跳过', '略过', '下一个', '不想聊这个', '换个话题',
        '管那么多干嘛', '关你什么事', '不想配合', '不要问我',
    ];

    if (userMessages.length < consecutiveThreshold) {
        return { isStuck: false, severity: 0, summary: '' };
    }

    const recentMessages = userMessages.slice(-consecutiveThreshold);
    let refusalCount = 0;
    const matchedPatterns: string[] = [];

    for (const msg of recentMessages) {
        const lowerMsg = msg.toLowerCase();
        const matched = refusalPatterns.find(pattern => lowerMsg.includes(pattern));
        if (matched) {
            refusalCount++;
            matchedPatterns.push(matched);
        }
    }

    if (refusalCount >= consecutiveThreshold) {
        return {
            isStuck: true,
            type: 'REFUSAL',
            severity: Math.min(10, refusalCount * 3),
            summary: `用户连续 ${refusalCount} 次拒绝配合 (关键词: ${matchedPatterns.join(', ')})`,
            details: { refusalCount, matchedPatterns }
        };
    }

    return { isStuck: false, severity: 0, summary: '' };
}

/**
 * 3. 阶段滞留探测器
 * 检测评估阶段是否持续过长
 */
export function detectPhaseTimeout(
    messageCount: number,
    currentPhase: 'intake' | 'conclusion' | 'support' | undefined,
    phaseThreshold: number = 20
): StuckLoopResult {
    if (currentPhase === 'intake' && messageCount > phaseThreshold) {
        return {
            isStuck: true,
            type: 'PHASE_TIMEOUT',
            severity: Math.min(10, Math.floor((messageCount - phaseThreshold) / 5) + 5),
            summary: `评估阶段已持续 ${messageCount} 轮，超过阈值 ${phaseThreshold} 轮`,
            details: { messageCount, phaseThreshold }
        };
    }

    return { isStuck: false, severity: 0, summary: '' };
}

/**
 * 综合检测入口
 * 对一段对话进行全面的死循环检测
 */
export async function analyzeConversationForStuckLoop(
    conversationId: string
): Promise<StuckLoopResult | null> {
    try {
        const messages = await prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            select: { role: true, content: true, meta: true }
        });

        if (messages.length < 4) return null; // 太短，不检测

        const userMessages = messages.filter(m => m.role === 'user').map(m => m.content);
        const assistantMessages = messages.filter(m => m.role === 'assistant').map(m => m.content);

        // 1. 复读检测
        const repetitionResult = detectRepetition(assistantMessages);
        if (repetitionResult.isStuck) return repetitionResult;

        // 2. 拒绝检测
        const refusalResult = detectRefusal(userMessages);
        if (refusalResult.isStuck) return refusalResult;

        // 3. 阶段超时检测 (从最后一条消息的 meta 中推断当前阶段)
        const lastMessage = messages[messages.length - 1];
        const meta = lastMessage.meta as Record<string, any> | null;
        const currentPhase = meta?.assessmentStage as 'intake' | 'conclusion' | undefined;

        const timeoutResult = detectPhaseTimeout(messages.length, currentPhase);
        if (timeoutResult.isStuck) return timeoutResult;

        return null;
    } catch (error) {
        console.error('[StuckLoop] Analysis failed:', error);
        return null;
    }
}

/**
 * 创建死循环事件
 */
export async function createStuckLoopEvent(
    conversationId: string,
    result: StuckLoopResult
): Promise<void> {
    try {
        // 避免重复创建同类型事件
        const existing = await prisma.optimizationEvent.findFirst({
            where: {
                conversationId,
                type: 'STUCK_LOOP',
                subType: result.type,
                status: 'PENDING'
            }
        });

        if (existing) {
            console.log('[StuckLoop] Event already exists, skipping creation');
            return;
        }

        await prisma.optimizationEvent.create({
            data: {
                conversationId,
                type: 'STUCK_LOOP',
                subType: result.type,
                severity: result.severity,
                summary: result.summary,
                details: result.details,
                status: 'PENDING'
            }
        });

        console.log('[StuckLoop] Created event:', result.type, conversationId);
    } catch (error) {
        console.error('[StuckLoop] Failed to create event:', error);
    }
}
