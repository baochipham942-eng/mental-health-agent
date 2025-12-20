import { deepseek } from '@/lib/ai/deepseek';
import { generateObject } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/db/prisma';

// Schema for deep psychological insights
const LabInsightSchema = z.object({
    insights: z.array(z.object({
        topic: z.enum(['emotional_pattern', 'coping_preference', 'personal_context']),
        content: z.string().describe("The deep psychological insight extracted, abstracting away roleplay details."),
        confidence: z.number().min(0).max(1).describe("Confidence score, typically 0.6-0.9 for lab insights."),
    })).describe("List of extracted psychological insights"),
});

const LAB_EXTRACTOR_PROMPT = `
你是一位专业的深度心理分析师。你正在阅读一段用户与AI角色（如苏格拉底、荣格、MBTI人格）的“角色扮演”对话。
你的任务是：**忽略表面的角色扮演细节，挖掘用户深层的心理模式**。

**提取原则**：
1. **忽略皮毛**：忽略用户为了配合角色扮演而说的客套话、场景设定（如“我正在雅典广场上”）。
2. **直击内核**：关注用户表达的**核心价值观、恐惧、渴望、认知扭曲**或**情感模式**。
3. **抽象化**：将具体的对话内容抽象为心理学描述。
   - 例子：用户对苏格拉底说“我怕输，不敢去比赛”，提取为“用户表现出对失败的强烈的灾难化思维，回避竞争场景”。
4. **保守原则**：如果不确定，不要提取。只提取有价值的洞察。

请输出 JSON 格式的 insight 列表。
`;

export async function extractLabInsights(
    userId: string,
    messages: { role: string; content: string }[],
    contextType: 'mentor' | 'mbti',
    contextId: string
): Promise<number> {
    try {
        // Filter out system messages, only keep user and assistant exchange
        // Limit to reasonable context window (last 20 messages)
        const relevantMessages = messages
            .filter(m => m.role === 'user' || m.role === 'assistant')
            .slice(-20);

        if (relevantMessages.length < 2) return 0;

        const conversationText = relevantMessages
            .map(m => `${m.role === 'user' ? 'User' : 'AI_Mentor'}: ${m.content}`)
            .join('\n');

        const { object } = await generateObject({
            model: deepseek('deepseek-chat'),
            schema: LabInsightSchema,
            prompt: `${LAB_EXTRACTOR_PROMPT}\n\n【对话内容】\n${conversationText}`,
            temperature: 0.3,
        });

        if (!object.insights || object.insights.length === 0) return 0;

        let savedCount = 0;

        // Save to DB
        // We tag these as specific topics but append logic to content if needed, 
        // or rely on the 'sourceConvId' to track origin. 
        // Since `sourceConvId` is usually a CUID, we can use a special prefix or just the contextId string if allowed?
        // `sourceConvId` in schema is String?. Ideally it matches a conversation ID but it's not a foreign key?
        // Checking schema: `sourceConvId` is just String?, NO Foreign Key relation to Conversation table (UserMemory has no relation to Conversation).
        // Correct. So we can put "lab_mentor_socrates" there.

        const sourceId = `lab_${contextType}_${contextId}`;

        for (const insight of object.insights) {
            // Add a prefix tag to the content to distinguish it further if retrieved later?
            // "Strategy: Any memory extracted from Lab should be tagged with context: 'lab_simulation'"
            // Since we don't have a 'tags' field in UserMemory, we append it to content or rely on sourceConvId.
            // Let's prepend [实验室洞察].

            const finalContent = `[实验室洞察] ${insight.content}`;

            await prisma.userMemory.create({
                data: {
                    userId,
                    topic: insight.topic,
                    content: finalContent,
                    confidence: insight.confidence * 0.8, // Apply a penalty factor to lab insights as planned (0.8)
                    sourceConvId: sourceId,
                }
            });
            savedCount++;
        }

        return savedCount;

    } catch (error) {
        console.error('[LabExtractor] Failed to extract:', error);
        return 0; // Fail safe
    }
}
