import { prisma } from '@/lib/db/prisma';

export interface SkillStats {
    cardId: string;
    count: number;
    avgImprovement: number;
}

/**
 * 获取用户最有效的技能 (基于 Mood Improvement)
 * Phase 3.2 Feedback Loop
 */
export async function getEffectiveSkills(userId: string, limit: number = 2): Promise<SkillStats[]> {
    try {
        const logs = await prisma.exerciseLog.groupBy({
            by: ['cardId'],
            where: {
                userId: userId,
                postMoodScore: { gt: 0 }, // Ensure valid post score
            },
            _count: {
                cardId: true,
            },
            _avg: {
                preMoodScore: true,
                postMoodScore: true,
            },
        });

        // Calculate improvement delta
        const stats: SkillStats[] = logs.map(log => ({
            cardId: log.cardId,
            count: log._count.cardId,
            // Improvement = Post - Pre. (If Pre is null, assume default 5)
            avgImprovement: (log._avg.postMoodScore || 0) - (log._avg.preMoodScore || 5),
        }));

        // Filter positive improvement and sort by improvement desc
        return stats
            .filter(s => s.avgImprovement > 0)
            .sort((a, b) => b.avgImprovement - a.avgImprovement)
            .slice(0, limit);
    } catch (e) {
        console.error('[DB] Failed to get effective skills:', e);
        return [];
    }
}
