'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';
import { memoryCache } from '@/lib/memory/memory-cache';

export interface LogExerciseParams {
    cardId: string; // The ID of the action card (e.g. "breath_478")
    title: string;
    durationSeconds: number;
    preMoodScore: number; // 1-10
    postMoodScore: number; // 1-10
    feedback?: string;
    sessionId?: string; // Optional linkage to chat session
}

export async function logExercise(params: LogExerciseParams) {
    const session = await auth();
    if (!session?.user?.id) {
        throw new Error('Unauthorized');
    }

    // Persist to DB
    const log = await prisma.exerciseLog.create({
        data: {
            userId: session.user.id,
            // Map cardId to type (since we don't have a strict relation yet for ephemeral cards)
            type: params.cardId,
            duration: params.durationSeconds,
            preMood: params.preMoodScore,
            postMood: params.postMoodScore,
            feedback: params.feedback,
        },
    });

    revalidatePath('/dashboard');
    return log;
}

export async function recordExerciseCompletion(
    userId: string,
    exerciseType: string,
    exerciseName: string,
    postMood: number,
    duration?: number,
    feedback?: string
): Promise<void> {
    // Save to exercise_preference memory (V2: ProfileMemory)
    const content = `完成「${exerciseName}」练习，效果评分${postMood}/10${feedback ? `，反馈：${feedback}` : ''}`;

    await prisma.profileMemory.create({
        data: {
            userId,
            kind: 'coping',
            content,
            confidence: 0.9,
            fingerprint: `exercise_${exerciseType}_${Date.now()}`,
        }
    });

    // Also update therapy_progress
    await prisma.profileMemory.create({
        data: {
            userId,
            kind: 'identity',
            content: `${exerciseName}练习${postMood >= 6 ? '效果良好' : '效果一般'}(${postMood}/10)`,
            confidence: 0.8,
            fingerprint: `progress_${exerciseType}_${Date.now()}`,
        }
    });

    // 记忆写入后失效缓存
    memoryCache.invalidate(userId);
}

// Query exercise history for injection into support prompts
export async function getExerciseHistory(userId: string): Promise<string> {
    const recentLogs = await prisma.exerciseLog.findMany({
        where: { userId },
        orderBy: { completedAt: 'desc' },
        take: 10,
    });

    if (recentLogs.length === 0) return '';

    // Find most done exercise type
    const typeCounts: Record<string, number> = {};
    let bestType = '';
    let bestScore = 0;

    for (const log of recentLogs) {
        typeCounts[log.type] = (typeCounts[log.type] || 0) + 1;
        if (log.postMood && log.postMood > bestScore) {
            bestScore = log.postMood;
            bestType = log.type;
        }
    }

    const mostFrequent = Object.entries(typeCounts).sort((a, b) => b[1] - a[1])[0];

    let summary = '### 练习历史摘要\n';
    summary += `- 共完成 ${recentLogs.length} 次练习\n`;
    if (mostFrequent) summary += `- 最常做的练习：${mostFrequent[0]}（${mostFrequent[1]}次）\n`;
    if (bestType) summary += `- 效果最好的练习：${bestType}（${bestScore}/10分）\n`;

    return summary;
}

export async function getExerciseStats() {
    const session = await auth();
    if (!session?.user?.id) return null;

    // Get simple stats
    const totalLogs = await prisma.exerciseLog.count({
        where: { userId: session.user.id }
    });

    // Average mood improvement
    // Prisma aggregation
    const logs = await prisma.exerciseLog.findMany({
        where: { userId: session.user.id },
        select: { preMood: true, postMood: true, completedAt: true },
        orderBy: { completedAt: 'desc' }
    });

    const improvements = logs.map(l => (l.postMood || 0) - (l.preMood || 0));
    const avgImprovement = improvements.length > 0
        ? improvements.reduce((a, b) => a + b, 0) / improvements.length
        : 0;

    return {
        totalLogs,
        avgImprovement: avgImprovement.toFixed(1),
        recentLogs: logs.slice(0, 5) // Just latest 5 for now
    };
}
