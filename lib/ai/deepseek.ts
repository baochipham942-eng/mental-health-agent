import { EmotionAnalysis } from '@/types/emotion';
import { SYSTEM_PROMPT, EMOTION_ANALYSIS_PROMPT } from './prompts';
import { createTrace, createGeneration, endGeneration, flushLangfuse, updateTrace } from '@/lib/observability/langfuse';

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

// Vercel AI SDK Integration
import { createOpenAI } from '@ai-sdk/openai';
import { streamText, generateText } from 'ai';

// Create DeepSeek provider instance
// Start with base URL but remove '/chat/completions' as the SDK appends it or uses standard endpoints
// DeepSeek uses standard OpenAI compatible endpoints: https://api.deepseek.com/v1
const deepseekBaseUrl = (process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1').replace(/\/chat\/completions$/, '');

export const deepseek = createOpenAI({
  baseURL: deepseekBaseUrl,
  apiKey: DEEPSEEK_API_KEY,
});

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionResponse {
  id: string;
  choices: Array<{
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 调用DeepSeek API进行对话
 */
export async function chatCompletion(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    max_tokens?: number;
    stream?: boolean;
  }
): Promise<string> {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  const response = await fetch(DEEPSEEK_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'deepseek-chat',
      messages: messages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2000,
      stream: options?.stream ?? false,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`DeepSeek API error: ${response.status} - ${error}`);
  }

  const data: ChatCompletionResponse = await response.json();

  if (!data.choices || data.choices.length === 0) {
    throw new Error('No response from DeepSeek API');
  }

  const output = data.choices[0].message.content;

  // LangFuse Tracing
  // LangFuse Tracing
  const trace = createTrace(
    'chatCompletion',
    {
      model: 'deepseek-chat',
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.max_tokens ?? 2000,
    },
    messages // Input
  );
  if (trace) {
    const generation = createGeneration(trace, 'DeepSeek Chat', messages, 'deepseek-chat');
    endGeneration(generation, output, {
      promptTokens: data.usage?.prompt_tokens,
      completionTokens: data.usage?.completion_tokens,
      totalTokens: data.usage?.total_tokens,
    });

    // Update trace with output
    updateTrace(trace, { output: output });

    await flushLangfuse();
  }

  return output;
}

/**
 * Stream chat completion using Vercel AI SDK
 */
export async function streamChatCompletion(
  messages: ChatMessage[],
  options?: {
    temperature?: number;
    max_tokens?: number;
  }
) {
  if (!DEEPSEEK_API_KEY) {
    throw new Error('DEEPSEEK_API_KEY is not configured');
  }

  // Convert ChatMessage to CoreMessage format expected by AI SDK
  // They are basically the same structure { role, content }
  const coreMessages = messages.map(m => ({
    role: m.role as 'system' | 'user' | 'assistant',
    content: m.content
  }));

  const result = await streamText({
    model: deepseek('deepseek-chat'),
    messages: coreMessages,
    temperature: options?.temperature ?? 0.7,
    maxTokens: options?.max_tokens ?? 2000,
    onFinish: async ({ text, usage, finishReason }) => {
      // LangFuse Tracing (Async)
      const trace = createTrace(
        'streamChatCompletion',
        {
          model: 'deepseek-chat',
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.max_tokens ?? 2000,
          finishReason,
        },
        messages // Input
      );

      if (trace) {
        const generation = createGeneration(trace, 'DeepSeek Stream', messages, 'deepseek-chat');
        endGeneration(generation, text, {
          promptTokens: usage.promptTokens,
          completionTokens: usage.completionTokens,
          totalTokens: usage.totalTokens,
        });

        // Update trace with output
        updateTrace(trace, { output: text });

        await flushLangfuse();
      }
    },
  });

  return result;
}

/**
 * 生成心理咨询回复
 */
export async function generateCounselingReply(
  userMessage: string,
  history: Array<{ role: 'user' | 'assistant'; content: string }> = []
): Promise<string> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: SYSTEM_PROMPT,
    },
    ...history.map(msg => ({
      role: msg.role as 'user' | 'assistant',
      content: msg.content,
    })),
    {
      role: 'user',
      content: userMessage,
    },
  ];

  return await chatCompletion(messages, {
    temperature: 0.8,
    max_tokens: 500,
  });
}

/**
 * 分析用户情绪
 */
export async function analyzeEmotion(userMessage: string): Promise<EmotionAnalysis | null> {
  if (!DEEPSEEK_API_KEY) {
    // 如果API未配置，返回默认情绪
    return {
      label: '平静',
      score: 5,
      confidence: 0.5,
    };
  }

  try {
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content: EMOTION_ANALYSIS_PROMPT,
      },
      {
        role: 'user',
        content: `请分析以下文本的情绪：\n\n${userMessage}`,
      },
    ];

    const response = await chatCompletion(messages, {
      temperature: 0.3,
      max_tokens: 200,
    });

    // 尝试解析JSON响应
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          label: parsed.label || '平静',
          score: Math.min(10, Math.max(0, parsed.score || 5)),
          confidence: 0.8,
        };
      }
    } catch (e) {
      // JSON解析失败，使用关键词匹配
    }

    // 关键词匹配作为后备方案
    return matchEmotionByKeywords(userMessage);
  } catch (error) {
    console.error('Emotion analysis error:', error);
    return matchEmotionByKeywords(userMessage);
  }
}

/**
 * 基于关键词的情绪匹配（后备方案）
 */
function matchEmotionByKeywords(text: string): EmotionAnalysis {
  const lowerText = text.toLowerCase();

  const keywords: Record<string, string[]> = {
    '焦虑': ['焦虑', '担心', '紧张', '不安', '害怕', '恐慌'],
    '抑郁': ['抑郁', '沮丧', '低落', '无望', '绝望', '难过'],
    '愤怒': ['愤怒', '生气', '烦躁', '不满', '恼火', '气愤'],
    '悲伤': ['悲伤', '难过', '失落', '痛苦', '伤心', '哭泣'],
    '恐惧': ['恐惧', '害怕', '担忧', '恐慌', '恐惧', '担心'],
    '快乐': ['快乐', '开心', '满足', '愉悦', '高兴', '兴奋'],
  };

  for (const [emotion, words] of Object.entries(keywords)) {
    if (words.some(word => lowerText.includes(word))) {
      return {
        label: emotion as any,
        score: 7,
        confidence: 0.6,
      };
    }
  }

  return {
    label: '平静',
    score: 5,
    confidence: 0.5,
  };
}




