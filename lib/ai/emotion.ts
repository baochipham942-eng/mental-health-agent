import { EmotionAnalysis } from '@/types/emotion';
import { analyzeEmotion as deepseekAnalyzeEmotion } from './deepseek';

/**
 * 分析用户输入的情绪
 */
export async function analyzeEmotion(text: string): Promise<EmotionAnalysis | null> {
  if (!text || text.trim().length === 0) {
    return null;
  }

  return await deepseekAnalyzeEmotion(text);
}

