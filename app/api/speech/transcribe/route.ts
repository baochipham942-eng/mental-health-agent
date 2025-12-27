import { NextRequest, NextResponse } from 'next/server';

// Cloudflare Worker 代理地址
const GROQ_PROXY_URL = process.env.GROQ_PROXY_URL || 'https://falling-thunder-114b.baochipham942.workers.dev/';

/**
 * 语音转文字 API
 * 通过 Cloudflare Worker 代理调用 Groq Whisper API
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

        // 检查文件是否太小 (小于 500 bytes 可能是空录音)
        if (audioFile.size < 500) {
            console.warn('[Speech API] Audio file too small:', audioFile.size);
            return NextResponse.json({ error: '录音时间太短，请说话后再松手' }, { status: 400 });
        }

        // 将 File 转换为 Blob 确保兼容性
        const arrayBuffer = await audioFile.arrayBuffer();
        const audioBlob = new Blob([arrayBuffer], { type: audioFile.type || 'audio/webm' });

        // 确定文件名
        let fileName = audioFile.name;
        if (!fileName || fileName === 'blob') {
            const ext = audioFile.type?.includes('mp4') ? 'm4a' :
                audioFile.type?.includes('wav') ? 'wav' : 'webm';
            fileName = `audio.${ext}`;
        }

        // 准备发送到代理的 FormData
        const proxyFormData = new FormData();
        proxyFormData.append('file', audioBlob, fileName);
        proxyFormData.append('model', 'whisper-large-v3');
        proxyFormData.append('language', 'zh');
        proxyFormData.append('response_format', 'json');

        console.log('[Speech API] Sending to proxy:', GROQ_PROXY_URL, { fileName, size: audioBlob.size });

        // 调用 Cloudflare Worker 代理
        const proxyResponse = await fetch(GROQ_PROXY_URL, {
            method: 'POST',
            body: proxyFormData,
        });

        const responseText = await proxyResponse.text();
        console.log('[Speech API] Proxy response:', proxyResponse.status, responseText.substring(0, 200));

        let responseData;
        try {
            responseData = JSON.parse(responseText);
        } catch {
            return NextResponse.json({ error: `代理响应无效: ${responseText.substring(0, 50)}` }, { status: 500 });
        }

        if (!proxyResponse.ok) {
            const errorMessage = responseData.error?.message || responseData.error || 'unknown error';
            return NextResponse.json({ error: `代理(${proxyResponse.status}): ${errorMessage}` }, { status: proxyResponse.status });
        }

        const text = responseData.text?.trim() || '';

        if (!text) {
            return NextResponse.json({ error: '未识别到语音内容' }, { status: 200 });
        }

        console.log('[Speech API] Transcribed:', text.substring(0, 50) + (text.length > 50 ? '...' : ''));
        return NextResponse.json({ text });

    } catch (error) {
        console.error('[Speech API] Error:', error);
        return NextResponse.json({
            error: error instanceof Error ? error.message : '服务器错误'
        }, { status: 500 });
    }
}
