'use server';

import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import { revalidatePath } from 'next/cache';

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
