import { NextRequest, NextResponse } from 'next/server';
import Groq from 'groq-sdk';

const GROQ_API_KEY = process.env.GROQ_API_KEY;

// 保留百度配置作为降级方案
const BAIDU_APP_ID = process.env.BAIDU_SPEECH_APP_ID;
const BAIDU_API_KEY = process.env.BAIDU_SPEECH_API_KEY;
const BAIDU_SECRET_KEY = process.env.BAIDU_SPEECH_SECRET_KEY;

let accessToken: string | null = null;
let tokenExpiry: number = 0;

async function getBaiduAccessToken(): Promise<string> {
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
    tokenExpiry = Date.now() + (29 * 24 * 60 * 60 * 1000);

    return accessToken!;
}

/**
 * 使用 Groq Whisper 进行语音转文字
 * 添加 prompt 参数减少幻觉输出
 */
async function transcribeWithGroq(audioFile: File): Promise<string> {
    const groq = new Groq({ apiKey: GROQ_API_KEY });

    const transcription = await groq.audio.transcriptions.create({
        file: audioFile,
        model: 'whisper-large-v3-turbo',
        language: 'zh',
        response_format: 'text',
        // 添加 prompt 来引导模型，减少幻觉
        // 这是 OpenAI 官方推荐的解决幻觉问题的方法
        prompt: '这是一段中文心理咨询对话录音。用户正在表达自己的感受和想法。',
    });

    return typeof transcription === 'string' ? transcription : (transcription as any).text || '';
}

/**
 * 使用百度语音识别（降级方案）
 */
async function transcribeWithBaidu(audioFile: File): Promise<string> {
    const token = await getBaiduAccessToken();
    const arrayBuffer = await audioFile.arrayBuffer();
    const audioBase64 = Buffer.from(arrayBuffer).toString('base64');

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

    const baiduUrl = `https://vop.baidu.com/server_api`;
    const payload = {
        format: format,
        rate: 16000,
        dev_pid: 1936,
        channel: 1,
        cuid: 'mental_health_app_' + Date.now(),
        token: token,
        speech: audioBase64,
        len: arrayBuffer.byteLength,
    };

    const baiduResponse = await fetch(baiduUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });

    const result = await baiduResponse.json();

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
        throw new Error(errorMessages[result.err_no] || `百度错误 ${result.err_no}`);
    }

    return result.result?.[0]?.trim() || '';
}

/**
 * 语音转文字 API
 * 优先使用 Groq Whisper，失败时降级到百度
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

        if (audioFile.size > 10 * 1024 * 1024) {
            return NextResponse.json({ error: '音频文件过大（最大 10MB）' }, { status: 400 });
        }

        if (audioFile.size < 500) {
            return NextResponse.json({ error: '录音时间太短，请说话后再松手' }, { status: 400 });
        }

        let text = '';

        // 优先使用 Groq Whisper
        if (GROQ_API_KEY) {
            try {
                console.log('[Speech API] Using Groq Whisper...');
                const startTime = Date.now();
                text = await transcribeWithGroq(audioFile);
                console.log(`[Speech API] Groq completed in ${Date.now() - startTime}ms`);
            } catch (groqError) {
                console.error('[Speech API] Groq failed, falling back to Baidu:', groqError);
                // 降级到百度
                if (BAIDU_API_KEY && BAIDU_SECRET_KEY) {
                    text = await transcribeWithBaidu(audioFile);
                } else {
                    throw groqError;
                }
            }
        } else if (BAIDU_API_KEY && BAIDU_SECRET_KEY) {
            // 没有 Groq，直接用百度
            console.log('[Speech API] Using Baidu ASR...');
            text = await transcribeWithBaidu(audioFile);
        } else {
            return NextResponse.json({ error: '未配置语音识别服务' }, { status: 500 });
        }

        if (!text) {
            return NextResponse.json({ error: '未识别到语音内容' }, { status: 200 });
        }

        // 🛡️ Whisper 幻觉过滤器
        // Whisper 模型在音频过短/静音/模糊时会产生"幻觉"输出，常见的包括：
        // - YouTube/视频平台的订阅提示语
        // - 重复的无意义短语
        // - 明显与上下文无关的推广语句
        const HALLUCINATION_PATTERNS = [
            '请不吝点赞',
            '订阅转发',
            '打赏支持',
            '明镜与点点',
            '点赞订阅',
            '感谢观看',
            '记得点赞',
            '一键三连',
            '素质三连',
            '长按点赞',
            '谢谢大家',
            '下期再见',
            '我们下期见',
            '欢迎订阅',
            'thanks for watching',
            'please subscribe',
            'like and subscribe',
        ];

        const lowerText = text.toLowerCase();
        const isHallucination = HALLUCINATION_PATTERNS.some(pattern =>
            lowerText.includes(pattern.toLowerCase())
        );

        if (isHallucination) {
            console.warn('[Speech API] Detected Whisper hallucination, ignoring:', text);
            return NextResponse.json({
                error: '未识别到有效语音，请重新说话',
                hallucination: true
            }, { status: 200 });
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
