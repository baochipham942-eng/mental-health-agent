/**
 * Skill 上下文提取模块
 * 从用户输入中提取 SkillSelectionContext
 */

import { SkillSelectionContext, RiskLevel, EmotionType, Duration } from './types';

/**
 * 从文本中提取风险等级
 */
function extractRiskLevel(text: string): RiskLevel {
  const lowerText = text.toLowerCase();

  // 检查自伤/自杀相关
  if (
    lowerText.includes('已经计划') ||
    lowerText.includes('准备好了方式') ||
    lowerText.includes('准备好了方法')
  ) {
    return 'crisis';
  }

  if (
    lowerText.includes('经常出现') ||
    lowerText.includes('伤害自己的想法：经常出现') ||
    lowerText.includes('自伤想法：经常出现')
  ) {
    return 'high';
  }

  if (
    lowerText.includes('偶尔闪过') ||
    lowerText.includes('伤害自己的想法：偶尔闪过') ||
    lowerText.includes('自伤想法：偶尔闪过')
  ) {
    return 'medium';
  }

  if (lowerText.includes('没有伤害自己的想法') || lowerText.includes('没有自伤')) {
    return 'low';
  }

  // 默认返回 low（如果没有明确表达）
  return 'low';
}

/**
 * 从文本中提取情绪类型
 */
function extractEmotionType(text: string): EmotionType {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('焦虑') || lowerText.includes('紧张') || lowerText.includes('担心')) {
    return 'anxiety';
  }

  if (lowerText.includes('抑郁') || lowerText.includes('低落') || lowerText.includes('沮丧')) {
    return 'depression';
  }

  if (lowerText.includes('愤怒') || lowerText.includes('生气') || lowerText.includes('烦躁')) {
    return 'anger';
  }

  if (lowerText.includes('悲伤') || lowerText.includes('难过') || lowerText.includes('失落')) {
    return 'sadness';
  }

  if (lowerText.includes('恐惧') || lowerText.includes('害怕') || lowerText.includes('恐慌')) {
    return 'fear';
  }

  // 如果同时包含多种情绪，返回 mixed
  const emotionKeywords = ['焦虑', '抑郁', '愤怒', '悲伤', '恐惧'];
  const foundEmotions = emotionKeywords.filter(keyword => lowerText.includes(keyword));
  if (foundEmotions.length > 1) {
    return 'mixed';
  }

  return 'neutral';
}

/**
 * 从文本中提取持续时间
 */
function extractDuration(text: string): Duration {
  const lowerText = text.toLowerCase();

  if (lowerText.includes('不确定') || lowerText.includes('不太清楚')) {
    return 'uncertain';
  }

  if (lowerText.includes('月') || lowerText.includes('几个月')) {
    return 'months';
  }

  if (lowerText.includes('周') || lowerText.includes('几周') || lowerText.includes('两周')) {
    return 'weeks';
  }

  if (lowerText.includes('天') || lowerText.includes('几天')) {
    return 'days';
  }

  return 'uncertain';
}

/**
 * 从文本中提取影响程度（0-10）
 */
function extractImpact(text: string): number {
  // 尝试匹配 X/10 格式
  const scoreMatch = text.match(/(\d{1,2})\s*\/\s*10/);
  if (scoreMatch) {
    const score = parseInt(scoreMatch[1], 10);
    if (score >= 0 && score <= 10) {
      return score;
    }
  }

  // 尝试匹配"影响X分"格式
  const impactMatch = text.match(/影响\s*(\d{1,2})\s*分/);
  if (impactMatch) {
    const score = parseInt(impactMatch[1], 10);
    if (score >= 0 && score <= 10) {
      return score;
    }
  }

  // 默认返回中等影响
  return 5;
}

/**
 * 从文本中提取是否有自伤念头
 */
function extractHasRiskThoughts(text: string): boolean | undefined {
  const lowerText = text.toLowerCase();

  if (
    lowerText.includes('没有伤害自己的想法') ||
    lowerText.includes('没有自伤') ||
    lowerText.includes('没有自杀')
  ) {
    return false;
  }

  if (
    lowerText.includes('伤害自己的想法') ||
    lowerText.includes('自伤想法') ||
    lowerText.includes('自伤') ||
    lowerText.includes('自杀')
  ) {
    return true;
  }

  return undefined;
}

/**
 * 从用户输入中提取 SkillSelectionContext
 */
export function extractSkillContext(initialMessage: string, followupAnswer: string): SkillSelectionContext {
  const combinedText = `${initialMessage} ${followupAnswer}`;

  return {
    riskLevel: extractRiskLevel(combinedText),
    emotion: extractEmotionType(combinedText),
    duration: extractDuration(combinedText),
    impact: extractImpact(combinedText),
    hasRiskThoughts: extractHasRiskThoughts(combinedText),
    routeType: 'assessment',
  };
}
