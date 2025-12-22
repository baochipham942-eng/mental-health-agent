import { chatStructuredCompletion, ChatMessage } from './deepseek';
import { z } from 'zod';
import { EVALUATION_PROMPT } from './prompts';

/**
 * 单个维度的评分 Schema
 */
export const DimensionScoreSchema = z.object({
    score: z.number().min(0).max(10).describe('评分：0-10'),
    issues: z.array(z.string()).describe('发现的问题列表'),
});

/**
 * 对话质量评估 Schema
 */
export const ConversationEvaluationSchema = z.object({
    legalCompliance: DimensionScoreSchema.describe('法律合规性'),
    ethicalStandard: DimensionScoreSchema.describe('伦理规范'),
    professionalism: DimensionScoreSchema.describe('专业性'),
    userExperience: DimensionScoreSchema.describe('用户体验'),
    improvements: z.array(z.string()).min(1).max(5).describe('改进建议（1-5条）'),
});

export type DimensionScore = z.infer<typeof DimensionScoreSchema>;
export type ConversationEvaluationResult = z.infer<typeof ConversationEvaluationSchema>;

/**
 * 完整评估结果（包含计算后的综合得分和等级）
 */
export interface EvaluationResult extends ConversationEvaluationResult {
    overallScore: number;
    overallGrade: string;
}

/**
 * 对话数据类型
 */
export interface ConversationData {
    id: string;
    userId: string;
    messages: Array<{
        role: string;
        content: string;
        createdAt: Date | string;
    }>;
}

/**
 * 计算综合等级
 */
function calculateGrade(score: number): string {
    if (score >= 9) return 'A';
    if (score >= 7) return 'B';
    if (score >= 5) return 'C';
    if (score >= 3) return 'D';
    return 'F';
}

/**
 * 评估对话质量（核心函数）
 * 
 * @param conversation - 对话数据（包含消息历史）
 * @returns 完整的评估结果（包含分数、问题、建议、等级）
 */
export async function evaluateConversationQuality(
    conversation: ConversationData
): Promise<EvaluationResult> {
    // 1. 提取有效对话
    const validMessages = conversation.messages
        .filter(m => m.content && m.content.trim().length > 0)
        .map(m => ({
            role: m.role,
            content: m.content,
            createdAt: typeof m.createdAt === 'string' ? new Date(m.createdAt) : m.createdAt,
        }))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    if (validMessages.length === 0) {
        throw new Error('No valid messages for evaluation');
    }

    // 2. 构建对话历史文本
    const conversationText = validMessages
        .map((m, i) => {
            const role = m.role === 'user' ? '用户' : 'AI咨询师';
            return `[${i + 1}] ${role}: ${m.content}`;
        })
        .join('\n\n');

    // 3. 准备 Prompt
    const messages: ChatMessage[] = [
        {
            role: 'system',
            content: EVALUATION_PROMPT,
        },
        {
            role: 'user',
            content: `对话历史（共 ${validMessages.length} 条消息）：\n\n${conversationText}`,
        },
    ];

    // 4. 调用 DeepSeek 评估
    console.log('[Evaluation] Generating quality evaluation...');
    const evaluation = await chatStructuredCompletion(
        messages,
        ConversationEvaluationSchema,
        {
            temperature: 0.2, // 低温度确保客观
            max_tokens: 1500,
        }
    );

    // 5. 计算综合得分和等级
    const overallScore = (
        evaluation.legalCompliance.score +
        evaluation.ethicalStandard.score +
        evaluation.professionalism.score +
        evaluation.userExperience.score
    ) / 4;

    const overallGrade = calculateGrade(overallScore);

    console.log('[Evaluation] Generated successfully:', {
        overallGrade,
        overallScore: overallScore.toFixed(2),
        legalScore: evaluation.legalCompliance.score,
        ethicalScore: evaluation.ethicalStandard.score,
        professionalScore: evaluation.professionalism.score,
        uxScore: evaluation.userExperience.score,
    });

    return {
        ...evaluation,
        overallScore,
        overallGrade,
    };
}
