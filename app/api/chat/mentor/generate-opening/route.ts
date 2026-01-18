import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { chatCompletion } from '@/lib/ai/deepseek';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        const userId = session?.user?.id;

        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await request.json();
        const { name, systemPrompt } = body;

        if (!name || !systemPrompt) {
            return NextResponse.json({ error: 'Missing name or systemPrompt' }, { status: 400 });
        }

        // Generate both title and opening message in one call
        const generationPrompt = `你是一个角色扮演生成器。根据以下角色设定，生成两样内容。

角色名称：${name}
角色设定：
${systemPrompt}

请严格按以下 JSON 格式输出（不要有任何其他内容）:
{
  "title": "角色的简短特点/身份描述，2-6个字，例如'诗仙'、'逍遥游者'、'哲学家'",
  "openingMessage": "符合角色风格的开场白，1-3句话，体现角色个性，是对用户的第一句问候"
}`;

        const response = await chatCompletion([
            { role: 'user', content: generationPrompt }
        ], {
            temperature: 0.9,
            max_tokens: 300,
            responseFormat: 'json_object',
        });

        try {
            const result = JSON.parse(response.reply);
            return NextResponse.json({
                title: result.title || '自定义大师',
                openingMessage: result.openingMessage || `你好，我是${name}。`,
            });
        } catch (parseError) {
            console.error('Failed to parse AI response:', response.reply);
            // Fallback
            return NextResponse.json({
                title: '自定义大师',
                openingMessage: `你好，我是${name}。有什么想和我聊的吗？`,
            });
        }

    } catch (error: any) {
        console.error('Generate Opening Error:', error);
        return NextResponse.json({ error: error.message || 'Generation failed' }, { status: 500 });
    }
}

