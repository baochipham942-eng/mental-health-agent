import { deepseek } from '@/lib/ai/deepseek';
import { generateObject } from 'ai';
import { z } from 'zod';
import { MentorPersona } from '@/lib/ai/mentors/personas';

const StanceSchema = z.object({
    stances: z.array(z.object({
        mentorId: z.string(),
        stance: z.enum(['for', 'against', 'neutral']),
        briefReason: z.string().describe('一句话说明该大师对此话题的基本立场'),
    })),
});

export type StanceResult = z.infer<typeof StanceSchema>;

/**
 * 辩论模式前置步骤：分析每位大师对话题的立场倾向
 * 返回按正反方排序的大师列表（正→反→中立交叉排列）
 */
export async function analyzeStances(
    topic: string,
    mentors: MentorPersona[]
): Promise<StanceResult> {
    const mentorDescriptions = mentors
        .map(m => `- ${m.id}: ${m.name}（${m.title}）— ${m.description}`)
        .join('\n');

    const { object } = await generateObject({
        model: deepseek('deepseek-chat'),
        schema: StanceSchema,
        prompt: `你是一位哲学辩论主持人。以下大师将围绕一个话题展开辩论。
请根据每位大师的思想体系和核心理念，快速判断他们对这个话题最可能持有的立场。

**话题**: ${topic}

**参与大师**:
${mentorDescriptions}

请为每位大师判断立场（for=支持/赞同、against=反对/质疑、neutral=中立/超越二元）。
一句话说明理由。`,
        temperature: 0.3,
    });

    return object;
}

/**
 * 根据立场分析结果，返回辩论发言顺序（正反方交叉排列）
 */
export function getDebateOrder(stances: StanceResult, mentorIds: string[]): string[] {
    const forGroup = stances.stances.filter(s => s.stance === 'for').map(s => s.mentorId);
    const againstGroup = stances.stances.filter(s => s.stance === 'against').map(s => s.mentorId);
    const neutralGroup = stances.stances.filter(s => s.stance === 'neutral').map(s => s.mentorId);

    // 交叉排列：正、反、正、反...，中立放最后
    const result: string[] = [];
    const maxLen = Math.max(forGroup.length, againstGroup.length);
    for (let i = 0; i < maxLen; i++) {
        if (i < forGroup.length) result.push(forGroup[i]);
        if (i < againstGroup.length) result.push(againstGroup[i]);
    }
    result.push(...neutralGroup);

    // 确保所有 mentorIds 都在结果中（防御性编程）
    for (const id of mentorIds) {
        if (!result.includes(id)) result.push(id);
    }

    return result;
}
