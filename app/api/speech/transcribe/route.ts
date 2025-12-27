import { NextRequest, NextResponse } from 'next/server';

// 百度语音识别凭证
const BAIDU_APP_ID = process.env.BAIDU_SPEECH_APP_ID;
const BAIDU_API_KEY = process.env.BAIDU_SPEECH_API_KEY;
const BAIDU_SECRET_KEY = process.env.BAIDU_SPEECH_SECRET_KEY;

// Access Token 缓存
let accessToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * 获取百度 Access Token
 */
async function getBaiduAccessToken(): Promise<string> {
    // 如果 token 未过期，直接返回
    if (accessToken && Date.now() < tokenExpiry) {
        return accessToken;
    }

    const url = `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${BAIDU_API_KEY}&client_secret=${BAIDU_SECRET_KEY}`;

    const response = await fetch(url, { method: 'POST' });

    if (!response.ok) {
        throw new Error('获取百度 Token 失败');
    }

    const data = await response.json();
    accessToken = data.access_token;
    // Token 有效期约 30 天，这里设置为 29 天自动刷新
    tokenExpiry = Date.now() + (29 * 24 * 60 * 60 * 1000);

    return accessToken!;
}

/**
 * 语音转文字 API
 * 使用百度短语音识别 API
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

        // 检查文件大小 (百度限制约 10MB)
        if (audioFile.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: '音频文件过大（最大 10MB）' }, { status: 400 });
        }

        // 检查文件是否太小
        if (audioFile.size < 500) {
            return NextResponse.json({ error: '录音时间太短，请说话后再松手' }, { status: 400 });
        }

        // 获取 Access Token
        const token = await getBaiduAccessToken();

        // 读取音频数据并转为 Base64
        const arrayBuffer = await audioFile.arrayBuffer();
        const audioBase64 = Buffer.from(arrayBuffer).toString('base64');

        // 确定音频格式 - 百度支持 pcm, wav, amr, m4a
        let format = 'wav';
        const mimeType = audioFile.type || audioFile.name;

        if (audioFile.name.endsWith('.pcm') || mimeType.includes('octet-stream')) {
            format = 'pcm';
        } else if (mimeType.includes('pcm')) {
            format = 'pcm';
        } else if (mimeType.includes('webm')) {
            format = 'wav';
        } else if (mimeType.includes('mp4') || mimeType.includes('m4a')) {
            format = 'm4a';
        } else if (mimeType.includes('amr')) {
            format = 'amr';
        }

        // 调用百度语音识别 API
        const baiduUrl = `https://vop.baidu.com/server_api?dev_pid=1537&cuid=mental_health_app&token=${token}`;

        const baiduResponse = await fetch(baiduUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                format: format,
                rate: 16000,
                channel: 1,
                cuid: 'mental_health_app_' + Date.now(),
                token: token,
                speech: audioBase64,
                len: arrayBuffer.byteLength,
            }),
        });

        const result = await baiduResponse.json();
        console.log('[Speech API] Baidu response:', JSON.stringify(result).substring(0, 200));

        // 百度返回格式: { err_no: 0, result: ["识别结果"] }
        if (result.err_no !== 0) {
            const errorMessages: Record<number, string> = {
                3300: '输入参数不正确',
                3301: '音频质量过差',
                3302: '鉴权失败',
                3303: '语音服务器后端问题',
                3304: '用户的请求 QPS 超限',
                3305: '用户的日 pv 超限',
                3307: '语音服务器后端识别出错问题',
                3308: '音频过长',
                3309: '音频数据问题',
                3310: '输入的音频文件过大',
                3311: '采样率 rate 参数不在选项里',
                3312: '音频格式 format 参数不在选项里',
            };
            const errorMsg = errorMessages[result.err_no] || `百度错误 ${result.err_no}`;
            return NextResponse.json({ error: errorMsg }, { status: 400 });
        }

        const text = result.result?.[0]?.trim() || '';

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
