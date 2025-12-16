/**
 * 缺口检测模块
 * 从用户输入中解析信息，检测缺失的关键信息
 */

export type IntakeInfo = {
  duration?: string;
  impactScore?: number; // 0-10
  riskLevel?: 'none' | 'passive' | 'frequent' | 'plan' | 'unknown';
  mainIssue?: string;
  context?: string; // 触发事件/场景
};

export type GapResult =
  | { hasGap: false; intake: IntakeInfo }
  | { hasGap: true; gapKey: 'duration' | 'impact' | 'risk' | 'context'; question: string; intake: IntakeInfo };

/**
 * 缺口问题模板
 */
const GAP_QUESTIONS = {
  risk: '为了确认你的安全：最近有没有出现伤害自己的想法？（没有/偶尔闪过/经常出现/已经计划）',
  impact: '它对你的睡眠/工作/社交影响有多大？请打分 0-10（0=几乎无影响，10=严重影响）',
  duration: '这种状态大概持续了多久？（几天/几周/几个月/不确定）',
  context: '通常在什么情境下最明显？（例如：上班/睡前/社交/独处/特定事件后）',
};

/**
 * 从文本中解析持续时间
 */
function parseDuration(text: string): string | undefined {
  const lowerText = text.toLowerCase();

  // 匹配具体时间表达
  const durationPatterns = [
    /(\d+)\s*(天|日)/,
    /(\d+)\s*周/,
    /(\d+)\s*个月/,
    /(\d+)\s*年/,
    /最近/,
    /这几天/,
    /两周/,
    /几个月/,
    /一直/,
    /半年/,
    /一年/,
    /很久/,
    /持续/,
    /开始/,
    /自从/,
    /以来/,
  ];

  for (const pattern of durationPatterns) {
    if (pattern.test(lowerText)) {
      const match = lowerText.match(pattern);
      if (match) {
        return match[0];
      }
    }
  }

  return undefined;
}

/**
 * 从文本中解析影响分数
 */
function parseImpactScore(text: string): number | undefined {
  const lowerText = text.toLowerCase();

  // Bug Fix Priority 1: 优先匹配纯数字（快捷回复按钮发送的是 "0" 而不是 "0/10"）
  const bareNumberPattern = /^(\d{1,2})$/;
  const bareMatch = lowerText.trim().match(bareNumberPattern);
  if (bareMatch) {
    const score = parseInt(bareMatch[1], 10);
    if (score >= 0 && score <= 10) {
      return score;
    }
  }

  // Bug Fix Priority 2: 检查最后一个词是否为裸数字（处理累计文本如 "压力大 能力不行 8"）
  const tokens = lowerText.trim().split(/\s+/);
  const lastToken = tokens[tokens.length - 1];
  if (lastToken && bareNumberPattern.test(lastToken)) {
    const score = parseInt(lastToken, 10);
    if (score >= 0 && score <= 10) {
      return score;
    }
  }

  // 匹配 "影响X/10" 或 "X/10" 或 "X分"
  const impactPatterns = [
    /影响\s*(\d+)\s*\/\s*10/,
    /(\d+)\s*\/\s*10/,
    /影响\s*(\d+)\s*分/,
    /(\d+)\s*分/,
  ];

  for (const pattern of impactPatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      const score = parseInt(match[1], 10);
      if (score >= 0 && score <= 10) {
        return score;
      }
    }
  }

  return undefined;
}

/**
 * 从文本中解析风险等级
 */
export function parseRiskLevel(text: string): 'none' | 'passive' | 'frequent' | 'plan' | 'unknown' {
  const lowerText = text.toLowerCase();

  // 明确排除
  if (lowerText.includes('没有伤害自己的想法') ||
    lowerText.includes('没有伤害自己') ||
    lowerText.includes('没有自伤') ||
    lowerText.includes('没有自杀')) {
    return 'none';
  }

  // 仅在风险问题语境时，识别独立出现的否定回答
  // 这个检查需要在明确自杀表达之前，避免误判
  const riskQuestionKeywords = [
    '伤害自己的想法',
    '自伤',
    '自杀',
    '为了确认你的安全',
    '伤害自己',
  ];

  const hasRiskQuestionContext = riskQuestionKeywords.some(keyword => lowerText.includes(keyword));

  if (hasRiskQuestionContext) {
    // 简短的否定回答关键词
    const shortNegativeKeywords = ['没有', '无', '没', '不存在', '没有这种想法'];

    // 检查文本结尾是否只包含简短的否定回答
    // 去除空白和标点
    const cleanedText = lowerText.replace(/[。，！？\s]/g, '').trim();
    const lastPart = cleanedText.slice(Math.max(0, cleanedText.length - 20));

    // 检查最后部分是否只包含简短的否定关键词
    for (const negativeKeyword of shortNegativeKeywords) {
      // 如果最后部分以否定关键词结尾
      if (lastPart.endsWith(negativeKeyword)) {
        // 检查 lastPart 的长度是否很短（允许前面有问题文本的一部分）
        if (lastPart.length <= 20) {
          return 'none';
        }
      }

      // 如果最后部分只包含否定关键词（可能前面有少量其他内容）
      if (lastPart === negativeKeyword) {
        return 'none';
      }
    }

    // 检查长文本中独立出现的否定词（避免误判"没有睡好"等）
    // 使用正则表达式匹配独立的否定词，确保它们不是其他词的一部分
    // 匹配模式：否定词前后是标点、空白、句首或句尾，或者否定词后跟语气词

    // 语气词
    const toneWords = '[啊呢吧呀哦嗯]';

    // 匹配独立的"没有"（可后跟语气词，然后跟标点、空白或结尾）
    // 排除"没有睡好"、"没有动力"等：如果"没有"后直接跟常见动词/名词，则不匹配
    // 使用全局匹配找到所有可能的匹配
    const meiYouPattern = /(没有)([啊呢吧呀哦嗯]?)([，。！？\s]|$)/g;
    let meiYouMatch;
    while ((meiYouMatch = meiYouPattern.exec(lowerText)) !== null) {
      const fullMatch = meiYouMatch[0];
      const matchIndex = meiYouMatch.index;
      const afterMatch = lowerText.slice(matchIndex + fullMatch.length);

      // 检查是否是误判模式（如"没有睡好"、"没有动力"等）
      // 如果"没有"后直接跟了常见动词/名词，则不识别
      const falsePositivePattern = /^(睡|动力|精神|食欲|兴趣|希望|目标|计划|想法|办法|方法|时间|钱|工作|学习|食欲|胃口|心情|状态|感觉|力气|精力)/;

      // 如果"没有"后跟了语气词或标点/空白/结尾，且不是误判模式，则识别为 'none'
      const hasToneWord = meiYouMatch[2] && meiYouMatch[2].length > 0;
      const hasPunctuation = meiYouMatch[3] && meiYouMatch[3].trim().length > 0;
      const isEnd = matchIndex + fullMatch.length >= lowerText.length;

      if ((hasToneWord || hasPunctuation || isEnd) && !falsePositivePattern.test(afterMatch.trim())) {
        return 'none';
      }
    }

    // 匹配独立的"无"（前后是标点、空白或句首/句尾，可后跟语气词）
    if (/(^|[，。！？\s])(无)([啊呢吧呀哦嗯]?)([，。！？\s]|$)/.test(lowerText)) {
      return 'none';
    }

    // 匹配独立的"没"（前后是标点、空白或句首/句尾，必须后跟语气词）
    // 注意："没"单独出现时容易误判（如"没睡好"），所以只匹配后跟语气词的情况
    if (/(^|[，。！？\s])(没)([啊呢吧呀哦嗯])([，。！？\s]|$)/.test(lowerText)) {
      return 'none';
    }

    // 匹配独立的"不存在"（前后是标点、空白或句首/句尾，可后跟语气词）
    if (/(^|[，。！？\s])(不存在)([啊呢吧呀哦嗯]?)([，。！？\s]|$)/.test(lowerText)) {
      return 'none';
    }
  }

  // 匹配风险问题选项
  if (lowerText.includes('已经计划') || lowerText.includes('伤害自己的想法：已经计划')) {
    return 'plan';
  }

  if (lowerText.includes('经常出现') || lowerText.includes('伤害自己的想法：经常出现')) {
    return 'frequent';
  }

  if (lowerText.includes('偶尔闪过') || lowerText.includes('伤害自己的想法：偶尔闪过')) {
    return 'passive';
  }

  // 明确自杀表达（需要在简短否定回答检查之后）
  if (lowerText.includes('想死') ||
    lowerText.includes('自杀') ||
    lowerText.includes('结束生命') ||
    lowerText.includes('不想活了')) {
    return 'plan'; // 视为高风险
  }

  // 即使没有风险问题关键词，也检查是否是纯否定回答（"没有/无/没/不存在"可带语气词）
  // 这种情况通常是对风险问题的简短回答
  // 支持文本以否定词结尾的情况（如"但是没有"、"但是没有啊"）
  const pureNegativePatterns = [
    /^(没有)([啊呢吧呀哦嗯]?)$/,
    /^(无)([啊呢吧呀哦嗯]?)$/,
    /^(没)([啊呢吧呀哦嗯])$/, // "没"必须后跟语气词，避免误判"没睡好"等
    /^(不存在)([啊呢吧呀哦嗯]?)$/,
    // 支持文本以否定词结尾的情况
    /(但是|不过|只是|就是)(没有)([啊呢吧呀哦嗯]?)$/,
    /(但是|不过|只是|就是)(无)([啊呢吧呀哦嗯]?)$/,
    /(但是|不过|只是|就是)(没)([啊呢吧呀哦嗯])$/,
    /(但是|不过|只是|就是)(不存在)([啊呢吧呀哦嗯]?)$/,
  ];

  const trimmedText = lowerText.trim();
  for (const pattern of pureNegativePatterns) {
    if (pattern.test(trimmedText)) {
      return 'none';
    }
  }

  return 'unknown';
}

/**
 * 从文本中解析上下文/触发事件
 */
function parseContext(text: string): string | undefined {
  const lowerText = text.toLowerCase();

  // 匹配触发词
  const contextPatterns = [
    /因为\s*([^，。！？]+)/,
    /由于\s*([^，。！？]+)/,
    /([^，。！？]+)\s*导致/,
    /发生了\s*([^，。！？]+)/,
    /当\s*([^，。！？]+)\s*时/,
    /在\s*([^，。！？]+)\s*时/,
  ];

  for (const pattern of contextPatterns) {
    const match = lowerText.match(pattern);
    if (match && match[1]) {
      const context = match[1].trim();
      if (context.length > 2 && context.length < 30) {
        return context;
      }
    }
  }

  // 检查是否包含情境关键词
  const contextKeywords = ['上班', '工作', '睡前', '社交', '独处', '考试', '演讲', '会议', '争吵', '分手'];
  for (const keyword of contextKeywords) {
    if (lowerText.includes(keyword)) {
      return keyword;
    }
  }

  return undefined;
}

/**
 * 判断初始消息是否很泛
 */
function isGenericMessage(message: string): boolean {
  const lowerMessage = message.toLowerCase();
  const genericPatterns = [
    /我好难受/,
    /我很焦虑/,
    /我很难过/,
    /我很痛苦/,
    /我心情不好/,
    /我压力很大/,
    /我很难受/,
  ];

  return genericPatterns.some(pattern => pattern.test(lowerMessage));
}

/**
 * 提取 followupAnswer 的最后一句回答
 * 用于识别用户对风险问题的回答
 */
function extractLastAnswer(followupAnswer: string): string {
  if (!followupAnswer || followupAnswer.trim().length === 0) {
    return '';
  }

  // 先按句号、问号、感叹号、换行符分割
  const sentences = followupAnswer.split(/[。！？\n]/);

  // 找到最后一个非空句子
  for (let i = sentences.length - 1; i >= 0; i--) {
    const sentence = sentences[i].trim();
    if (sentence.length > 0) {
      // 如果这个句子包含多个部分，尝试按不同分隔符分割
      // 1. 先按空格分割
      const spaceParts = sentence.split(/\s+/);
      if (spaceParts.length > 1) {
        return spaceParts[spaceParts.length - 1];
      }

      // 2. 如果按空格分割后只有一个部分，尝试按逗号分割
      const commaParts = sentence.split(/[，,]/);
      if (commaParts.length > 1) {
        return commaParts[commaParts.length - 1].trim();
      }

      // 3. 如果都没有，返回整个句子
      return sentence;
    }
  }

  // 如果没有找到句子分隔符，尝试按空格分割，取最后一部分
  const trimmed = followupAnswer.trim();
  const spaceParts = trimmed.split(/\s+/);
  if (spaceParts.length > 1) {
    return spaceParts[spaceParts.length - 1];
  }

  // 如果按空格分割后只有一个部分，尝试按逗号分割
  const commaParts = trimmed.split(/[，,]/);
  if (commaParts.length > 1) {
    return commaParts[commaParts.length - 1].trim();
  }

  // 如果只有一个部分，返回整个文本
  return trimmed;
}

/**
 * 检测信息缺口
 */
export function detectGap(initialMessage: string, followupAnswer: string): GapResult {
  const combinedText = `${initialMessage} ${followupAnswer}`;

  // 提取 followupAnswer 的最后一句，用于识别风险等级
  // 因为 followupAnswer 可能包含多轮用户回答，且不包含 assistant 的风险提问文本
  const lastAnswer = extractLastAnswer(followupAnswer);

  // 解析信息
  let intake: IntakeInfo = {
    duration: parseDuration(combinedText),
    impactScore: parseImpactScore(combinedText),
    // riskLevel 只用 followupAnswer 的最后一句
    riskLevel: parseRiskLevel(lastAnswer),
    context: parseContext(combinedText),
  };

  // Phase 2 Critical Fix: 优先级调整 - risk 降到最低优先级
  // 原因：风险评估应由 conclusion 阶段的 LLM 自然处理，而非在 gap_followup 强制插入
  // 新优先级：impact > duration > context > risk

  if (intake.impactScore === undefined) {
    return {
      hasGap: true,
      gapKey: 'impact',
      question: GAP_QUESTIONS.impact,
      intake,
    };
  }

  if (!intake.duration) {
    return {
      hasGap: true,
      gapKey: 'duration',
      question: GAP_QUESTIONS.duration,
      intake,
    };
  }

  // context 只在初始消息很泛时才作为缺口
  if (!intake.context && isGenericMessage(initialMessage)) {
    return {
      hasGap: true,
      gapKey: 'context',
      question: GAP_QUESTIONS.context,
      intake,
    };
  }

  // Phase 2 Fix: risk 检查移到最后（通常不会触发，因为 conclusion 会提前进入）
  // 只有在用户明确表达高风险语义但未分类时，才作为兜底
  if (intake.riskLevel === 'unknown') {
    return {
      hasGap: true,
      gapKey: 'risk',
      question: GAP_QUESTIONS.risk,
      intake,
    };
  }

  return {
    hasGap: false,
    intake,
  };
}
