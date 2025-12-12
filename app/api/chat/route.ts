import { NextRequest, NextResponse } from 'next/server';
import { generateCounselingReply } from '@/lib/ai/deepseek';
import { analyzeEmotion } from '@/lib/ai/emotion';
import { ChatRequest, ChatResponse } from '@/types/chat';

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, history = [] } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: '消息内容不能为空' },
        { status: 400 }
      );
    }

    // 并行执行情绪分析和对话生成
    const [emotion, reply] = await Promise.all([
      analyzeEmotion(message),
      generateCounselingReply(message, history),
    ]);

    const response: ChatResponse = {
      reply,
      emotion: emotion ? {
        label: emotion.label,
        score: emotion.score,
      } : undefined,
      timestamp: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { 
        error: '处理请求时出错',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    );
  }
}



