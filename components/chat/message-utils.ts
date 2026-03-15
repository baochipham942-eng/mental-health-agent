/**
 * MessageBubble 纯函数工具
 *
 * 从 MessageBubble.tsx 提取，确保可独立测试
 */

/**
 * 解析并分离 <thought>...</thought> 标签内容
 * 返回: { displayContent: 去除thought标签后的内容, thoughtContent: thought标签内的内容 }
 */
export function parseThoughtTags(content: string): { displayContent: string; thoughtContent: string | null } {
  if (!content) return { displayContent: '', thoughtContent: null };

  // 匹配 <thought>...</thought> 标签（支持多行）
  const thoughtRegex = /<thought>([\s\S]*?)<\/thought>/gi;
  const matches = content.matchAll(thoughtRegex);

  let thoughtContent = '';
  for (const match of matches) {
    thoughtContent += match[1].trim() + '\n\n';
  }

  // 移除所有 thought 标签及其内容
  const displayContent = content
    .replace(thoughtRegex, '')
    // 清洗 DeepSeek 泄漏的工具调用文本（如 "to=recommend_skill_card diýen here ..."）
    .replace(/to=(?:recommend_skill_card|recommend_lab_exploration)\b[^\u4e00-\u9fff]*/gi, '')
    .replace(/^\s*\n/gm, '') // 移除多余空行
    .trim();

  return {
    displayContent,
    thoughtContent: thoughtContent.trim() || null
  };
}

/**
 * 去除重复的 followup 问题文本
 * 当 assistantText 中包含与 followup 卡片内容高度相似的段落时，将其剔除
 */
export function stripDuplicateFollowupText(rawText: string, followupQuestionText?: string): string {
  if (!followupQuestionText || !rawText) {
    return rawText;
  }

  // 规范化文本：去除标点、空格、换行，转为小写
  const normalize = (text: string): string => {
    return text
      .toLowerCase()
      .replace(/[，,。；;：:！!？?\s\n\r]/g, '')
      .trim();
  };

  const normalizedQuestion = normalize(followupQuestionText);
  if (!normalizedQuestion) {
    return rawText;
  }

  // 去除常见的引导语前缀（扩展更多模式）
  let cleaned = rawText
    .replace(/^为了更好地了解你的情况[，,]?\s*请回答[：:]\s*/i, '')
    .replace(/^我想再确认一个小问题[：:]\s*/i, '')
    .replace(/^我想再确认两个小问题[：:]\s*/i, '')
    .replace(/^我想更准确地帮你[，,]?\s*补充一个小问题[：:]\s*/i, '')
    .replace(/^我想先理解清楚你的情况[，,]?\s*我们从一个具体时刻开始[。.]\s*/i, '')
    .trim();

  // 如果去重后为空，直接返回空字符串
  if (!cleaned) {
    return '';
  }

  // 按行分割，检查每一行是否与问题文本高度相似
  const lines = cleaned.split(/\n+/);
  const filteredLines: string[] = [];

  for (const line of lines) {
    const normalizedLine = normalize(line);

    // 如果这一行与问题文本高度相似（包含关系或相似度很高），则跳过
    if (normalizedLine && normalizedQuestion) {
      // 检查是否包含：问题文本是否包含在行中，或行是否包含在问题文本中
      const lineContainsQuestion = normalizedLine.includes(normalizedQuestion);
      const questionContainsLine = normalizedQuestion.includes(normalizedLine);

      // 如果行长度与问题文本长度相近（差异不超过30%），且高度相似，则跳过
      const lengthDiff = Math.abs(normalizedLine.length - normalizedQuestion.length);
      const maxLength = Math.max(normalizedLine.length, normalizedQuestion.length);
      const isSimilarLength = maxLength > 0 && lengthDiff / maxLength < 0.3;

      // 更严格的相似度检查：如果行包含问题文本的核心部分（至少50%），则跳过
      const minLength = Math.min(normalizedLine.length, normalizedQuestion.length);
      const overlapRatio = minLength > 0 ? Math.min(normalizedLine.length, normalizedQuestion.length) / maxLength : 0;

      if ((lineContainsQuestion || questionContainsLine) && (isSimilarLength || overlapRatio > 0.5)) {
        continue; // 跳过这一行
      }
    }

    filteredLines.push(line);
  }

  // 重新组合，去除多余空行
  const result = filteredLines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return result;
}
