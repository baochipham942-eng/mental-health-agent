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
            console.error('[Speech API] No audio file provided');
            return NextResponse.json({ error: '未提供音频文件' }, { status: 400 });
        }

        console.log('[Speech API] Received audio:', {
            name: audioFile.name,
            type: audioFile.type,
            size: audioFile.size,
        });

        // 检查文件大小 (限制 25MB)
        if (audioFile.size > 25 * 1024 * 1024) {
            return NextResponse.json({ error: '音频文件过大（最大 25MB）' }, { status: 400 });
        }

        // 检查文件是否太小 (小于 1KB 可能是空录音)
        if (audioFile.size < 1000) {
            console.warn('[Speech API] Audio file too small:', audioFile.size);
            return NextResponse.json({ error: '录音时间太短，请说话后再松手' }, { status: 400 });
        }

        const groqApiKey = process.env.GROQ_API_KEY;
        if (!groqApiKey) {
            console.error('[Speech API] GROQ_API_KEY not configured');
            return NextResponse.json({ error: '语音服务未配置' }, { status: 500 });
        }

        // 将 File 转换为 Blob 并确保有正确的 MIME 类型
        const arrayBuffer = await audioFile.arrayBuffer();
        const audioBuffer = Buffer.from(arrayBuffer);

        // 确定正确的文件扩展名
        let extension = 'webm';
        let mimeType = audioFile.type || 'audio/webm';

        if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
            extension = 'm4a';
        } else if (mimeType.includes('wav')) {
            extension = 'wav';
        } else if (mimeType.includes('ogg')) {
            extension = 'ogg';
        }

        // 创建新的 Blob 和 File 对象
        const audioBlob = new Blob([audioBuffer], { type: mimeType });
        const newAudioFile = new File([audioBlob], `audio.${extension}`, { type: mimeType });

        // 准备发送到 Groq 的 FormData
        const groqFormData = new FormData();
        groqFormData.append('file', newAudioFile);
        groqFormData.append('model', 'whisper-large-v3');
        groqFormData.append('language', 'zh'); // 中文优化
        groqFormData.append('response_format', 'json');

        console.log('[Speech API] Sending to Groq:', {
            fileName: `audio.${extension}`,
            mimeType,
            size: audioBuffer.length,
        });

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

            if (groqResponse.status === 400) {
                return NextResponse.json({ error: '音频格式不支持，请重试' }, { status: 400 });
            }

            return NextResponse.json({ error: '语音转写失败' }, { status: 500 });
        }

        const result = await groqResponse.json();
        const text = result.text?.trim() || '';

        console.log('[Speech API] Transcribed:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));

        if (!text) {
            return NextResponse.json({ error: '未识别到语音内容' }, { status: 200, });
        }

        return NextResponse.json({ text });

    } catch (error) {
        console.error('[Speech API] Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : '服务器错误'
        }, { status: 500 });
    }
}
