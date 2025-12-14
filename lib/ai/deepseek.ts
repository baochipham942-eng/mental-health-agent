import { EmotionAnalysis } from '@/types/emotion';
import { SYSTEM_PROMPT, EMOTION_ANALYSIS_PROMPT } from './prompts';

const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY;

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

  return data.choices[0].message.content;
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




