import { NextRequest, NextResponse } from 'next/server';

/**
 * 语音转文字 API
 * 使用 Groq Whisper API 进行转写
 */
export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const audioFile = formData.get('audio') as File;

        if (!audioFile) {
            return NextResponse.json({ error: '未提供音频文件' }, { status: 400 });
        }

        // 检查文件大小 (限制 25MB)
        if (audioFile.size > 25 * 1024 * 1024) {
            return NextResponse.json({ error: '音频文件过大（最大 25MB）' }, { status: 400 });
        }

        const groqApiKey = process.env.GROQ_API_KEY;
        if (!groqApiKey) {
            console.error('[Speech API] GROQ_API_KEY not configured');
            return NextResponse.json({ error: '语音服务未配置' }, { status: 500 });
        }

        // 准备发送到 Groq 的 FormData
        const groqFormData = new FormData();
        groqFormData.append('file', audioFile);
        groqFormData.append('model', 'whisper-large-v3');
        groqFormData.append('language', 'zh'); // 中文优化
        groqFormData.append('response_format', 'json');

        // 调用 Groq Whisper API
        const groqResponse = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${groqApiKey}`,
            },
            body: groqFormData,
        });

        if (!groqResponse.ok) {
            const errorText = await groqResponse.text();
            console.error('[Speech API] Groq error:', groqResponse.status, errorText);

            if (groqResponse.status === 429) {
                return NextResponse.json({ error: '语音服务繁忙，请稍后再试' }, { status: 429 });
            }

            return NextResponse.json({ error: '语音转写失败' }, { status: 500 });
        }

        const result = await groqResponse.json();
        const text = result.text?.trim() || '';

        console.log('[Speech API] Transcribed:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));

        return NextResponse.json({ text });

    } catch (error) {
        console.error('[Speech API] Error:', error);
        return NextResponse.json({ error: '服务器错误' }, { status: 500 });
    }
}
