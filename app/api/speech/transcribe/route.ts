import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';
import { toFile } from 'groq-sdk/uploads';

/**
 * 语音转文字 API
 * 使用 Groq Whisper API 进行转写 (官方 SDK)
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

        console.log('[Speech API] Using Groq SDK with key:', groqApiKey.substring(0, 10) + '...');

        // 创建 Groq 客户端
        const groq = new Groq({ apiKey: groqApiKey });

        // 将 File 转换为 Groq SDK 可接受的格式
        const arrayBuffer = await audioFile.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);

        // 确定正确的文件名和类型
        let fileName = audioFile.name || 'audio.webm';
        if (!fileName.includes('.')) {
            const ext = audioFile.type?.includes('mp4') ? 'm4a' :
                audioFile.type?.includes('wav') ? 'wav' : 'webm';
            fileName = `audio.${ext}`;
        }

        console.log('[Speech API] Sending to Groq SDK:', { fileName, size: buffer.length });

        // 调用 Groq Whisper API
        const transcription = await groq.audio.transcriptions.create({
            file: await toFile(buffer, fileName),
            model: 'whisper-large-v3',
            language: 'zh',
            response_format: 'json',
        });

        const text = transcription.text?.trim() || '';
        console.log('[Speech API] Transcribed:', text.substring(0, 100) + (text.length > 100 ? '...' : ''));

        if (!text) {
            return NextResponse.json({ error: '未识别到语音内容' }, { status: 200 });
        }

        return NextResponse.json({ text });

    } catch (error) {
        console.error('[Speech API] Error:', error);

        // 提取错误信息
        let errorMessage = '服务器错误';
        if (error instanceof Error) {
            errorMessage = error.message;
            // Groq SDK 错误通常有 status 属性
            if ('status' in error) {
                const status = (error as any).status;
                if (status === 403) {
                    errorMessage = `认证失败(403)`;
                } else if (status === 400) {
                    errorMessage = `格式错误: ${error.message.substring(0, 50)}`;
                } else if (status === 429) {
                    errorMessage = '语音服务繁忙，请稍后再试';
                }
            }
        }

        return NextResponse.json({ error: errorMessage }, { status: 500 });
    }
}
