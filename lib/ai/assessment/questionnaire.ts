/**
 * PHQ-9 / GAD-7 会话式评估系统
 *
 * PHQ-9: Patient Health Questionnaire-9 (抑郁筛查)
 *   - 9 题, 0-3 Likert 量表, 总分 0-27
 * GAD-7: Generalized Anxiety Disorder-7 (焦虑筛查)
 *   - 7 题, 0-3 Likert 量表, 总分 0-21
 */

export type QuestionnaireType = 'phq9' | 'gad7';
export type Severity = 'minimal' | 'mild' | 'moderate' | 'moderately_severe' | 'severe';

export interface QuestionItem {
  id: string;
  text: string;           // 标准量表措辞
  conversational: string; // 会话式包装（更自然的提问方式）
}

export interface ScoringRange {
  range: [number, number];
  severity: Severity;
}

export interface QuestionnaireConfig {
  type: QuestionnaireType;
  name: string;
  description: string;
  questions: QuestionItem[];
  scoring: ScoringRange[];
  responseOptions: string[]; // 量表选项说明
}

// =============================================================================
// PHQ-9 抑郁筛查量表
// =============================================================================

export const PHQ9_CONFIG: QuestionnaireConfig = {
  type: 'phq9',
  name: '情绪健康度检查',
  description: '过去两周内，以下问题困扰你的频率',
  questions: [
    {
      id: 'phq9_1',
      text: '做事时提不起劲或没有兴趣',
      conversational: '过去两周里，你有没有觉得做事情提不起劲，或者对以前喜欢的事情失去了兴趣？',
    },
    {
      id: 'phq9_2',
      text: '感到心情低落、沮丧或绝望',
      conversational: '这段时间，你有没有经常感到心情低落、沮丧，或者觉得看不到希望？',
    },
    {
      id: 'phq9_3',
      text: '入睡困难、睡不安稳或睡眠过多',
      conversational: '你的睡眠情况怎么样？有没有难以入睡、半夜容易醒来，或者反而睡太多？',
    },
    {
      id: 'phq9_4',
      text: '感觉疲倦或没有活力',
      conversational: '你最近有没有觉得特别累，或者感觉整个人没什么力气？',
    },
    {
      id: 'phq9_5',
      text: '食欲不振或吃太多',
      conversational: '你的食欲有变化吗？是不太想吃东西，还是反而吃得比平时多？',
    },
    {
      id: 'phq9_6',
      text: '觉得自己很糟糕——觉得自己是失败者，或让自己和家人失望',
      conversational: '你有没有对自己感到失望，觉得自己不够好，或者让身边的人失望了？',
    },
    {
      id: 'phq9_7',
      text: '对事物专注有困难，例如读报或看电视',
      conversational: '你在做事情的时候能集中注意力吗？比如看书、看手机或者工作的时候？',
    },
    {
      id: 'phq9_8',
      text: '动作或说话速度缓慢到被别人注意到，或烦躁不安、坐立难安',
      conversational: '有没有人说你最近变慢了，或者你自己感觉坐不住、特别烦躁？',
    },
    {
      id: 'phq9_9',
      text: '有不如死掉或用某种方式伤害自己的念头',
      conversational: '最后一个问题，也是很重要的一个——你有没有出现过觉得活着没意思，或者想要伤害自己的念头？无论答案是什么，都没关系，这里是安全的。',
    },
  ],
  scoring: [
    { range: [0, 4], severity: 'minimal' },
    { range: [5, 9], severity: 'mild' },
    { range: [10, 14], severity: 'moderate' },
    { range: [15, 19], severity: 'moderately_severe' },
    { range: [20, 27], severity: 'severe' },
  ],
  responseOptions: [
    '完全不会 (0分)',
    '好几天 (1分)',
    '一半以上的天数 (2分)',
    '几乎每天 (3分)',
  ],
};

// =============================================================================
// GAD-7 焦虑筛查量表
// =============================================================================

export const GAD7_CONFIG: QuestionnaireConfig = {
  type: 'gad7',
  name: '压力指数检查',
  description: '过去两周内，以下问题困扰你的频率',
  questions: [
    {
      id: 'gad7_1',
      text: '感觉紧张、焦虑或急切',
      conversational: '过去两周里，你有没有经常感觉紧张、焦虑，或者心里很急？',
    },
    {
      id: 'gad7_2',
      text: '不能停止或控制担忧',
      conversational: '你有没有发现自己一直在担心某些事情，想停都停不下来？',
    },
    {
      id: 'gad7_3',
      text: '对各种各样的事情担忧过多',
      conversational: '你是不是会为很多不同的事情感到担心，觉得操心的事太多了？',
    },
    {
      id: 'gad7_4',
      text: '很难放松下来',
      conversational: '你能放松下来吗？还是觉得身体和心理都绷得很紧？',
    },
    {
      id: 'gad7_5',
      text: '由于不安而无法静坐',
      conversational: '你有没有因为太焦虑了而坐不住，需要不停地动来动去？',
    },
    {
      id: 'gad7_6',
      text: '变得容易烦恼或急躁',
      conversational: '最近你有没有变得特别容易烦躁，或者比以前更容易发脾气？',
    },
    {
      id: 'gad7_7',
      text: '感到似乎将有可怕的事情发生',
      conversational: '你有没有一种不安的感觉，好像有什么不好的事情要发生，但又说不清楚是什么？',
    },
  ],
  scoring: [
    { range: [0, 4], severity: 'minimal' },
    { range: [5, 9], severity: 'mild' },
    { range: [10, 14], severity: 'moderate' },
    { range: [15, 21], severity: 'severe' },
  ],
  responseOptions: [
    '完全不会 (0分)',
    '好几天 (1分)',
    '一半以上的天数 (2分)',
    '几乎每天 (3分)',
  ],
};

// =============================================================================
// 评分与辅助函数
// =============================================================================

export function getQuestionnaireConfig(type: QuestionnaireType): QuestionnaireConfig {
  return type === 'phq9' ? PHQ9_CONFIG : GAD7_CONFIG;
}

/**
 * 计算问卷总分和严重程度
 */
export function scoreQuestionnaire(
  responses: number[],
  type: QuestionnaireType
): { score: number; severity: Severity } {
  const config = getQuestionnaireConfig(type);
  const expectedLength = config.questions.length;

  if (responses.length !== expectedLength) {
    throw new Error(`Expected ${expectedLength} responses for ${type}, got ${responses.length}`);
  }

  const score = responses.reduce((sum, val) => sum + val, 0);
  const severity = config.scoring.find(
    s => score >= s.range[0] && score <= s.range[1]
  )?.severity ?? 'minimal';

  return { score, severity };
}

/**
 * 获取下一个会话式问题
 */
export function getNextConversationalQuestion(
  config: QuestionnaireConfig,
  currentIndex: number
): string | null {
  if (currentIndex >= config.questions.length) return null;

  const question = config.questions[currentIndex];
  const total = config.questions.length;
  const progress = `(${currentIndex + 1}/${total})`;

  // 第一题加引导语
  if (currentIndex === 0) {
    return `我想用几个小问题帮你了解自己最近的状态，一共 ${total} 个问题。每个问题你可以回答「完全不会」、「好几天」、「一半以上的天数」或「几乎每天」。\n\n${progress} ${question.conversational}`;
  }

  return `${progress} ${question.conversational}`;
}

/**
 * 将用户自然语言回复映射到 0-3 分
 *
 * 返回 null 表示无法解析，需要重新询问
 */
export function parseUserResponse(userMessage: string): number | null {
  const msg = userMessage.trim().toLowerCase();

  // 直接数字
  if (/^[0-3]$/.test(msg)) return parseInt(msg);
  if (/^[0-3]\s*分/.test(msg)) return parseInt(msg[0]);

  // 中文选项匹配
  const patterns: [RegExp, number][] = [
    // 0 分 - 完全不会
    [/完全不会|完全没有|从来没有|没有过|不会|从不|没有|0/, 0],
    // 1 分 - 好几天
    [/好几天|有几天|偶尔|有时候|有时|少数时候|一些时候|偶然|1/, 1],
    // 2 分 - 一半以上
    [/一半以上|超过一半|大部分时间|经常|较多|频繁|2/, 2],
    // 3 分 - 几乎每天
    [/几乎每天|每天都|天天|总是|一直都是|一直|始终|3/, 3],
  ];

  // 从高分到低分匹配
  // 频率否定: 短语匹配，避免 "不知道" 等非频率用语误匹配
  const hasFrequencyNegation = /完全不会|从来没有|没有过|从不|不会|^没有$|^没$/.test(msg);
  const hasAlways = /每天|天天|总是|一直|始终/.test(msg);

  if (hasAlways && !hasFrequencyNegation) return 3;
  if (/一半以上|超过一半|大部分/.test(msg)) return 2;
  if (/经常|频繁|较多/.test(msg)) return 2;
  if (/好几天|有几天|有时候|有时|偶尔/.test(msg)) return 1;
  if (hasFrequencyNegation && !hasAlways) return 0;

  // 语义推断
  if (/很严重|非常|极度/.test(msg)) return 3;
  if (/比较|有点|还好/.test(msg)) return 1;
  if (/一点点|轻微/.test(msg)) return 1;

  return null; // 无法解析
}

/**
 * 检测用户消息是否包含问卷触发关键词
 */
export function detectQuestionnaireRequest(message: string): QuestionnaireType | null {
  const msg = message.toLowerCase();

  // 收窄触发词：只保留明确的量表/自评请求，移除泛化触发词
  if (/phq[-\s]?9|抑郁.*评估|抑郁.*测试|测.*抑郁|情绪健康度/.test(msg)) return 'phq9';
  if (/gad[-\s]?7|焦虑.*评估|焦虑.*测试|测.*焦虑|压力.*自评|压力指数/.test(msg)) return 'gad7';
  // 以下泛化触发词已收窄（Pilot 前弱化 L3 量表入口）
  // 原: /做个评估|测试一下|评估一下|做个测试|心理测试|心理评估/ → phq9
  // 原: /了解一下自己|测一下|看看自己状态|了解自己/ → phq9

  return null;
}

/**
 * 检查 PHQ-9 Q9（自杀意念题）是否触发危机
 * Q9 分数 >= 2 表示需要立即关注
 */
export function checkQ9Crisis(responses: number[]): boolean {
  return responses.length >= 9 && responses[8] >= 2;
}

/**
 * 获取严重程度的中文描述
 */
export function getSeverityLabel(severity: Severity, type: QuestionnaireType): string {
  const labels: Record<Severity, string> = {
    minimal: '正常范围',
    mild: '轻度',
    moderate: '中度',
    moderately_severe: '中重度',
    severe: '重度',
  };
  const domain = type === 'phq9' ? '抑郁' : '焦虑';
  return severity === 'minimal' ? labels[severity] : `${labels[severity]}${domain}`;
}

/**
 * 生成评估结果的自然语言反馈
 */
export function generateResultFeedback(
  score: number,
  severity: Severity,
  type: QuestionnaireType
): string {
  const domain = type === 'phq9' ? '抑郁' : '焦虑';
  const total = type === 'phq9' ? 27 : 21;
  const severityLabel = getSeverityLabel(severity, type);

  let feedback = `评估完成！你的 ${type === 'phq9' ? 'PHQ-9' : 'GAD-7'} 得分是 **${score}/${total}**，属于「${severityLabel}」。\n\n`;

  switch (severity) {
    case 'minimal':
      feedback += `你目前的${domain}水平在正常范围内，这是个好消息！继续保持健康的生活方式，定期关注自己的心理状态。`;
      break;
    case 'mild':
      feedback += `你有一些轻度的${domain}状态。这很常见，通过自我调节和日常练习通常可以改善。我可以为你推荐一些放松练习。`;
      break;
    case 'moderate':
      feedback += `你目前有中度的${domain}状态，建议持续关注。如果这种状态已经持续两周以上，考虑寻求专业支持会是个好选择。`;
      break;
    case 'moderately_severe':
      feedback += `你的${domain}状态比较明显，我很关心你的状况。强烈建议你寻求专业支持或专业医生的帮助，获得更系统的评估和支持。`;
      break;
    case 'severe':
      feedback += `你的评估结果显示${domain}状态较为严重，我非常关心你。请尽快联系专业支持。如果你需要，我可以提供一些专业求助渠道的信息。`;
      break;
  }

  feedback += '\n\n⚠️ 请注意：这只是一个自我了解的小工具，帮你更好地认识自己。如果你感到困扰，建议寻求专业帮助。';

  return feedback;
}
