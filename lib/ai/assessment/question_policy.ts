/**
 * 苏格拉底式提问策略（Socratic Questioning Policy）
 * 用于优化 assessment 的 intake 和 gap_followup 阶段提问
 * 
 * 原则：
 * - 聚焦触发情境/自动想法/影响/证据/替代观点
 * - 每次最多 1-2 个问题
 * - 尽量包含可选项或 0-10 打分
 * - 轻量、可回答、可量化
 */

import { RouteType, PressureSocraticState, FollowupSlotState } from '@/types/chat';
import { IntakeInfo } from './gap';

/**
 * 提问上下文
 */
export interface QuestionContext {
  userMessage: string;
  routeType: RouteType;
  emotion?: {
    label: string;
    score: number; // 0-10
  };
  riskLevel?: 'none' | 'passive' | 'frequent' | 'plan' | 'unknown';
  existingIntake?: IntakeInfo;
  pressureSocratic?: PressureSocraticState;
  followupSlot?: FollowupSlotState;  // 新增：followup 槽位状态
}

/**
 * 最小触发器词典：用于判断是否应该进入 assessment
 * 规则：只要命中 A/B/C/E 任一即可进入 assessment
 * D (stressor) 需要与 A/B/C 任一组合才触发
 */
const ASSESSMENT_TRIGGERS = {
  // A. 困扰词（distress）
  distress: [
    '压力', '焦虑', '烦', '崩溃', '难受', '压抑', '心慌', '恐慌', '抑郁', '低落', '委屈', '内耗', '情绪失控', '想哭',
    '失眠', '睡不着', '睡不好', '早醒', '噩梦', '脑子停不下来', '停不住', '停不了'
  ],

  // B. 功能受损（impairment）
  impairment: [
    '影响睡眠', '影响工作', '影响效率', '影响注意力', '影响专注', '影响社交', '影响食欲',
    '没精神', '提不起劲', '拖延严重', '无法集中', '工作做不动'
  ],

  // C. 求助意图（help-seeking）
  helpSeeking: [
    '怎么办', '帮帮我', '能不能帮我', '想改善', '如何缓解', '怎么调整', '我需要建议', '我需要方法', '我需要行动', '给我一个办法'
  ],

  // D. 职场/关系高频压力源（stressor, 作为弱触发，需与A/B/C任一组合才触发）
  stressor: [
    '被领导骂', '被领导批评', '被领导pua', '被领导PUA', 'kpi', 'KPI', '绩效', '加班', '工作量太大', '项目压', '同事关系', '家庭矛盾', '伴侣吵架'
  ],
};

/**
 * 正向/中性口头禅（只做 guard，不做触发）
 * 这些词只能用于抑制误判：当 A/B/C/E 都没命中时 → 强制 support
 */
const POSITIVE_NEUTRAL_GUARDS = [
  '好开心', '满足', '放松', '泡温泉', '吃水果', '是呀', '对呀', '嗯嗯', '哈哈'
];

/**
 * 检查是否应该进入 assessment
 * 
 * 规则：
 * 1. 如果命中 A/B/C/E 任一 → 返回 true
 * 2. 如果只命中 D (stressor) → 返回 false（需要与 A/B/C 组合）
 * 3. 如果只命中正向/中性词且未命中 A/B/C/D/E → 返回 false（强制 support）
 * 
 * @param userText 用户输入文本
 * @param emotion 情绪分析结果（可选）
 * @returns 是否应该进入 assessment
 */
export function shouldEnterAssessment(
  userText: string,
  emotion?: { label: string; score: number }
): boolean {
  const message = userText.toLowerCase().trim();

  // E. 情绪强度：如果 emotion.score >= 7 且为负向情绪 → 直接触发 assessment
  if (emotion) {
    const negativeEmotions = ['焦虑', '抑郁', '愤怒', '悲伤', '恐惧'];
    const isNegativeEmotion = negativeEmotions.includes(emotion.label);
    const isHighIntensity = emotion.score >= 7;

    if (isNegativeEmotion && isHighIntensity) {
      return true;
    }
  }

  // A. 检查困扰词（distress）
  const hasDistress = ASSESSMENT_TRIGGERS.distress.some(keyword =>
    message.includes(keyword.toLowerCase())
  );

  // B. 检查功能受损（impairment）
  const hasImpairment = ASSESSMENT_TRIGGERS.impairment.some(keyword =>
    message.includes(keyword.toLowerCase())
  );

  // C. 检查求助意图（help-seeking）
  const hasHelpSeeking = ASSESSMENT_TRIGGERS.helpSeeking.some(keyword =>
    message.includes(keyword.toLowerCase())
  );

  // D. 检查压力源（stressor，弱触发）
  const hasStressor = ASSESSMENT_TRIGGERS.stressor.some(keyword =>
    message.includes(keyword.toLowerCase())
  );

  // 如果命中 A/B/C 任一，直接触发 assessment
  if (hasDistress || hasImpairment || hasHelpSeeking) {
    return true;
  }

  // 如果只命中 D (stressor)，需要与 A/B/C 组合才触发（这里已经检查过 A/B/C 都不命中，所以返回 false）
  // 但为了代码清晰，这里显式处理
  if (hasStressor && !hasDistress && !hasImpairment && !hasHelpSeeking) {
    return false;
  }

  // 如果命中 D 且同时命中 A/B/C 任一（虽然上面已经返回 true，但为了逻辑完整保留）
  if (hasStressor && (hasDistress || hasImpairment || hasHelpSeeking)) {
    return true;
  }

  // 检查是否只包含正向/中性词（guard）
  const hasPositiveNeutral = POSITIVE_NEUTRAL_GUARDS.some(keyword =>
    message.includes(keyword.toLowerCase())
  );

  // 如果只命中正向/中性词且未命中任何触发器 → 强制 support（返回 false）
  if (hasPositiveNeutral && !hasDistress && !hasImpairment && !hasHelpSeeking && !hasStressor) {
    return false;
  }

  // 默认：如果没有任何触发器，不进入 assessment（走 support）
  return false;
}

/**
 * 检查是否应该禁用苏格拉底式提问策略
 */
function shouldDisableSocraticPolicy(context: QuestionContext): boolean {
  // support 和 crisis 路由禁用
  if (context.routeType === 'support' || context.routeType === 'crisis') {
    return true;
  }

  // emotion >= 9 或 riskLevel >= urgent 时优先稳定化/安全问题
  if (context.emotion && context.emotion.score >= 9) {
    return true;
  }

  if (context.riskLevel === 'frequent' || context.riskLevel === 'plan') {
    return true;
  }

  return false;
}

/**
 * 检查用户消息中是否包含特定信息
 */
function checkUserMessageForInfo(userMessage: string): {
  hasTrigger: boolean;      // 触发器/情境
  hasDuration: boolean;     // 持续时间
  hasImpact: boolean;       // 影响
  hasRisk: boolean;         // 安全
  hasAutomaticThought: boolean; // 自动想法
  hasRiskClue: boolean;     // 明显风险线索（但未达到 crisis 关键词门槛）
} {
  const message = userMessage.toLowerCase();

  // 检查触发器/情境
  const triggerKeywords = [
    '因为', '由于', '当', '在', '发生', '遇到', '面对',
    '上班', '工作', '睡前', '社交', '独处', '考试', '演讲',
    '会议', '争吵', '分手', '压力', '冲突'
  ];
  const hasTrigger = triggerKeywords.some(keyword => message.includes(keyword));

  // 检查持续时间
  const durationKeywords = [
    '最近', '这几天', '两周', '几个月', '一直', '半年',
    '一年', '很久', '持续', '开始', '自从', '以来', '天', '周', '月'
  ];
  const hasDuration = durationKeywords.some(keyword => message.includes(keyword));

  // 检查影响
  const impactKeywords = [
    '影响睡眠', '影响工作', '没精神', '注意力差', '社交减少',
    '睡不着', '睡不好', '失眠', '效率低', '无法集中',
    '不想社交', '不想出门', '影响学习', '影响生活', '影响',
    '分', '/10', '打分', '评分'
  ];
  const hasImpact = impactKeywords.some(keyword => message.includes(keyword));

  // 检查安全（明确的自伤/自杀表达，达到 crisis 级别）
  const riskKeywords = [
    '想死', '不想活', '自杀', '结束生命', '割腕', '跳楼',
    '上吊', '服药', '吃药', '结束一切', '不想活了'
  ];
  const hasRisk = riskKeywords.some(keyword => message.includes(keyword));

  // 检查明显风险线索（但未达到 crisis 关键词门槛）
  // 这些线索提示可能需要询问自伤想法，但本身不足以触发 crisis
  const riskClueKeywords = [
    '绝望', '无望', '没有意义', '活不下去', '崩溃', '撑不住',
    '受不了', '极度', '非常痛苦', '很痛苦', '很难受',
    '无法承受', '承受不了', '看不到希望', '没有希望'
  ];
  const hasRiskClue = riskClueKeywords.some(keyword => message.includes(keyword));

  // 检查自动想法（负面认知）
  const automaticThoughtKeywords = [
    '觉得', '认为', '以为', '感觉', '担心', '害怕',
    '一定', '肯定', '总是', '永远', '不可能', '完蛋',
    '没用', '失败', '糟糕', '绝望', '无望'
  ];
  const hasAutomaticThought = automaticThoughtKeywords.some(keyword => message.includes(keyword));

  return {
    hasTrigger,
    hasDuration,
    hasImpact,
    hasRisk,
    hasAutomaticThought,
    hasRiskClue,
  };
}

/**
 * 解析风险等级（从用户文本中提取）
 * 支持："没有/偶尔闪过/经常出现/已经计划" 等可选项和自然表达
 */
export function parseRiskLevel(text: string): 'none' | 'passive' | 'active' | 'plan' | 'unknown' {
  const lowerText = text.toLowerCase().trim();

  // 明确排除"没有伤害自己的想法"的情况
  if (lowerText.includes('没有伤害自己的想法') ||
    lowerText.includes('没有伤害自己') ||
    lowerText.includes('没有自伤') ||
    lowerText.includes('没有自杀') ||
    lowerText === '没有' ||
    lowerText === '没有哦' ||
    lowerText === '没有啊') {
    return 'none';
  }

  // 匹配风险问题选项
  if (lowerText.includes('已经计划') || lowerText.includes('计划好了')) {
    return 'plan';
  }

  if (lowerText.includes('经常出现') || lowerText.includes('经常')) {
    return 'active';
  }

  if (lowerText.includes('偶尔闪过') || lowerText.includes('偶尔')) {
    return 'passive';
  }

  // 明确自杀表达
  if (lowerText.includes('想死') ||
    lowerText.includes('自杀') ||
    lowerText.includes('结束生命') ||
    lowerText.includes('不想活了')) {
    return 'plan';
  }

  return 'unknown';
}

/**
 * 解析影响分数（从用户文本中提取 0-10 的整数）
 * 支持："0" / "10" / "我觉得7分" 等表达
 */
export function parseImpactScore(text: string): number | undefined {
  const lowerText = text.toLowerCase().trim();

  // 匹配 0-10 的整数
  // 支持格式：0, 1, 2, ..., 10
  // 支持格式：0分, 1分, ..., 10分
  // 支持格式：我觉得7分, 大概是5分
  const patterns = [
    /^(\d+)$/,  // 纯数字
    /(\d+)\s*分/,  // 数字+分
    /(\d+)\s*\/\s*10/,  // 数字/10
    /影响.*?(\d+)/,  // 影响X
    /大概.*?(\d+)/,  // 大概X
    /我觉得.*?(\d+)/,  // 我觉得X
  ];

  for (const pattern of patterns) {
    const match = lowerText.match(pattern);
    if (match && match[1]) {
      const score = parseInt(match[1], 10);
      if (score >= 0 && score <= 10) {
        return score;
      }
    }
  }

  return undefined;
}

/**
 * 更新 followup 槽位状态
 * 根据用户消息更新槽位，并判断当前回答属于哪个槽位
 */
export function updateFollowupSlotState(
  userMessage: string,
  currentState?: FollowupSlotState,
  lastFollowupSlot?: 'risk' | 'impact'
): FollowupSlotState {
  // 如果没有当前状态，创建新状态
  if (!currentState) {
    const riskLevel = parseRiskLevel(userMessage);
    const impactScore = parseImpactScore(userMessage);

    // 判断当前回答属于哪个槽位
    let currentSlot: 'risk' | 'impact' | undefined;
    if (lastFollowupSlot === 'risk' || (riskLevel !== 'unknown' && !currentSlot)) {
      currentSlot = 'risk';
    } else if (lastFollowupSlot === 'impact' || (impactScore !== undefined && !currentSlot)) {
      currentSlot = 'impact';
    } else if (impactScore !== undefined) {
      currentSlot = 'impact';
    } else if (riskLevel !== 'unknown') {
      currentSlot = 'risk';
    }

    return {
      riskLevel,
      impactScore,
      asked: {
        risk: currentSlot === 'risk',
        impact: currentSlot === 'impact',
      },
      done: riskLevel !== 'unknown' && impactScore !== undefined,
      lastFollowupSlot: currentSlot,
    };
  }

  // 更新现有状态
  const riskLevel = parseRiskLevel(userMessage);
  const impactScore = parseImpactScore(userMessage);

  // 关键：当用户回复 "0" 时，不允许把 riskLevel 复位回 unknown
  // 只能更新 impactScore
  const finalRiskLevel = riskLevel !== 'unknown' ? riskLevel : currentState.riskLevel;

  // 判断当前回答属于哪个槽位（优先依据 lastFollowupSlot）
  let currentSlot: 'risk' | 'impact' | undefined;
  if (lastFollowupSlot === 'risk' && riskLevel !== 'unknown') {
    currentSlot = 'risk';
  } else if (lastFollowupSlot === 'impact' && impactScore !== undefined) {
    currentSlot = 'impact';
  } else if (impactScore !== undefined) {
    currentSlot = 'impact';
  } else if (riskLevel !== 'unknown') {
    currentSlot = 'risk';
  }

  // 更新 asked 状态（只标记当前回答的槽位）
  const asked = { ...currentState.asked };
  if (currentSlot === 'risk') {
    asked.risk = true;
  } else if (currentSlot === 'impact') {
    asked.impact = true;
  }

  return {
    riskLevel: finalRiskLevel,
    impactScore: impactScore !== undefined ? impactScore : currentState.impactScore,
    asked,
    done: finalRiskLevel !== 'unknown' && (impactScore !== undefined || currentState.impactScore !== undefined),
    lastFollowupSlot: currentSlot || currentState.lastFollowupSlot,
  };
}

/**
 * 检查是否应该询问自伤问题
 * 条件（必须收窄，避免普通压力场景误判）：
 * 1. 如果 riskLevel 已经有值（不是 'unknown'），说明已经问过，不再询问
 * 2. 如果 followupSlot 中已经问过 risk，不再询问
 * 3. 双门槛触发条件（必须同时满足）：
 *    - 必须命中明确风险提示词（不想活了/想死/轻生/自残/结束生命/活不下去/计划/方法 等）
 *    - 且（情绪强度高 >=8 或 已经出现绝望/无助等高危情绪标签）
 * 4. 明确排除：单纯"压力大/被骂/想辞职/担心裁员" 绝不触发
 */
function shouldAskRiskQuestion(context: QuestionContext, hasRiskClue: boolean): boolean {
  // 如果 existingIntake 中已经有 riskLevel 且不是 'unknown'，说明已经问过并得到答案
  if (context.existingIntake?.riskLevel && context.existingIntake.riskLevel !== 'unknown') {
    return false;
  }

  // 如果 followupSlot 中已经问过 risk，不再询问
  if (context.followupSlot?.asked?.risk) {
    return false;
  }

  const message = context.userMessage.toLowerCase();

  // 明确排除普通压力场景关键词（符合用户要求：单纯"压力大/被骂/想辞职/担心裁员" 绝不触发）
  const stressOnlyKeywords = [
    '压力大', '被老板骂', '被领导骂', '被骂', '担心被裁', '担心裁员',
    '想辞职', '想离职', '睡不好', '睡不着', '脑子停不下来', '停不下来',
    '工作压力', '加班', '绩效', 'kpi', '被批评', '被否定'
  ];
  const isStressOnly = stressOnlyKeywords.some(keyword => message.includes(keyword));

  // 如果只包含压力关键词，绝不触发自伤问句（符合用户要求）
  if (isStressOnly) {
    return false;
  }

  // 双门槛触发条件1：必须命中明确风险提示词（符合用户要求）
  const explicitRiskKeywords = [
    '不想活了', '想死', '轻生', '自残', '结束生命', '活不下去',
    '计划', '方法', '自杀', '割腕', '跳楼', '吞药', '已经想好怎么做',
    '不想活', '想消失', '想离开', '不想继续'
  ];
  const hasExplicitRisk = explicitRiskKeywords.some(keyword => message.includes(keyword));

  if (!hasExplicitRisk) {
    return false; // 没有明确风险提示词，不触发
  }

  // 双门槛触发条件2：且（情绪强度高 >=8 或 已经出现绝望/无助等高危情绪标签）
  const highRiskEmotionKeywords = [
    '绝望', '无望', '无助', '没有意义', '看不到希望', '没有希望',
    '崩溃', '撑不住', '受不了', '极度', '非常痛苦', '很痛苦', '很难受',
    '无法承受', '承受不了'
  ];
  const hasHighRiskEmotion = highRiskEmotionKeywords.some(keyword => message.includes(keyword));

  // 检查情绪强度
  const hasHighIntensityEmotion = context.emotion &&
    (['焦虑', '抑郁', '愤怒', '悲伤', '恐惧'].includes(context.emotion.label)) &&
    context.emotion.score >= 8;

  // 只有同时满足：明确风险提示词 + （高危情绪标签 或 高情绪强度），才触发自伤追问
  if (hasExplicitRisk && (hasHighRiskEmotion || hasHighIntensityEmotion)) {
    return true;
  }

  return false;
}

/**
 * 检查是否为正向情绪输入（不应进入评估式追问）
 * 使用 hasPositiveOverride 实现正向保护
 */
function isPositiveEmotionInput(userMessage: string): boolean {
  return hasPositiveOverride(userMessage);
}

/**
 * 检测压力槽位（精简版，使用正则+少量词根组合）
 * 返回 { isStress: boolean; reason?: string }
 * 
 * 规则（符合用户要求）：
 * 1. 压力信号：压力|焦虑|紧张|崩溃|喘不过气|睡不着|失眠|脑子停不下来
 * 2. 工作语境：工作|老板|领导|绩效|KPI|裁员|项目|加班|会议|汇报
 * 3. 身体/睡眠受影响：睡不着|失眠|心慌|胸闷|停不下来
 * 4. 组合规则（满足其一即可）：
 *    - (压力信号 && 工作语境) => stressSlot=true
 *    - 或者（工作语境 && 身体/睡眠受影响）=> stressSlot=true
 * 5. 否定/正向保护（命中则直接 false）：
 *    - 开心|放松|满意|很棒|太好了|舒服|享受|愉快
 */
export function detectStressSlot(text: string): { isStress: boolean; reason?: string } {
  const message = text.toLowerCase().trim();

  // 否定/正向保护（命中则直接 false）
  // 修复：扩展正向保护，包括"泡温泉"、"吃水果"等正向活动
  const positivePattern = /(开心|放松|满意|很棒|太好了|舒服|享受|愉快|满足|顺利|成功|泡温泉|温泉|吃水果|水果|好开心|很开心|很开心呀|好开心呀)/;
  if (positivePattern.test(message)) {
    return { isStress: false, reason: '正向保护' };
  }

  // 压力信号正则（符合用户要求）
  const stressSignalPattern = /(压力|焦虑|紧张|崩溃|喘不过气|睡不着|失眠|脑子停不下来|停不下来|停不了)/;

  // 工作语境正则（符合用户要求）
  const workplacePattern = /(工作|老板|领导|绩效|kpi|裁员|项目|加班|会议|汇报)/;

  // 身体/睡眠受影响正则（符合用户要求）
  const bodySleepPattern = /(睡不着|失眠|心慌|胸闷|停不下来|停不了)/;

  // 检查压力信号
  const hasStressSignal = stressSignalPattern.test(message);

  // 检查工作语境
  const hasWorkplace = workplacePattern.test(message);

  // 检查身体/睡眠受影响
  const hasBodySleep = bodySleepPattern.test(message);

  // 组合规则1：如果有任何明确的压力信号，直接判定为 stress（放宽条件，不再强制要求工作语境）
  if (hasStressSignal) {
    return { isStress: true, reason: '压力信号 (Explicit)' };
  }

  // 组合规则2：工作语境 + 身体/睡眠受影响（补充规则，针对没有直接说"压力"但描述了症状的情况）
  if (hasWorkplace && hasBodySleep) {
    return { isStress: true, reason: '工作语境+身体/睡眠受影响' };
  }

  return { isStress: false, reason: '未命中压力信号' };
}

/**
 * 检查是否包含压力信号（精简版，8-12个核心词根）
 * 用于触发苏格拉底式澄清，避免直接量表
 * 内部使用 detectStressSlot
 */
function hasStressSignal(userMessage: string): boolean {
  return detectStressSlot(userMessage).isStress;
}

/**
 * 正向保护：检查是否为正向情绪输入（不应进入 assessment 提问）
 * 若命中且不含明显负向/危机词，则直接走 support 陪伴，不进入 assessment 提问
 */
function hasPositiveOverride(userMessage: string): boolean {
  const message = userMessage.toLowerCase().trim();

  // 正向关键词（扩展：包括"泡温泉"、"吃水果"等正向活动）
  const positiveKeywords = [
    '开心', '高兴', '满足', '放松', '舒服', '顺利', '太棒', '很棒', '喜欢',
    '泡温泉', '温泉', '吃水果', '水果', '好开心', '很开心', '很开心呀', '好开心呀'
  ];

  // 负向/危机关键词（如果包含这些，不应走 support）
  const negativeKeywords = [
    '压力', '焦虑', '抑郁', '难受', '崩溃', '睡不着', '失眠', '烦',
    '痛苦', '想死', '不想活', '自杀', '伤害自己', '绝望', '撑不住',
    '想消失', '活不下去', '想轻生', '困扰', '问题', '困难', '麻烦',
    '担心', '害怕', '恐惧', '紧张', '不安', '忧虑', '想辞职'
  ];

  const hasPositive = positiveKeywords.some(keyword => message.includes(keyword));
  const hasNegative = negativeKeywords.some(keyword => message.includes(keyword));

  // 正向保护：包含正向词且不含负向/危机词
  return hasPositive && !hasNegative;
}

/**
 * 检查是否为危机（只保留明确自伤/自杀语义的少数高置信词）
 * 关键：压力 case ≠ 危机，且"想离职/想辞职"绝对不能触发自伤检查
 */
function isCrisis(userMessage: string): boolean {
  const message = userMessage.toLowerCase().trim();

  // 明确排除"想离职/想辞职"（绝对不能触发自伤检查）
  if (message.includes('想离职') || message.includes('想辞职')) {
    return false;
  }

  // 只保留明确自伤/自杀语义的高置信词
  const crisisKeywords = [
    '不想活', '想死', '自杀', '结束生命', '割腕', '跳楼',
    '吃药', '已经想好怎么做', '遗书'
  ];

  return crisisKeywords.some(keyword => message.includes(keyword));
}

/**
 * 检查是否已经问过并得到场景/想法信息
 * 注意：在首轮追问时，existingIntake 应该是 undefined，所以会返回 false，触发苏格拉底式追问
 */
function hasAskedSocraticQuestions(existingIntake?: IntakeInfo): boolean {
  // 如果 existingIntake 中有 context 或 mainIssue，说明已经问过场景并得到回答
  // 但空字符串不算（表示问过但用户没回答）
  if (existingIntake?.context && existingIntake.context.trim().length > 0) {
    return true;
  }
  if (existingIntake?.mainIssue && existingIntake.mainIssue.trim().length > 0) {
    return true;
  }

  // 首轮追问时，existingIntake 应该是 undefined，返回 false
  return false;
}

/**
 * 槽位判断：轻量、可维护的结构信号检测
 * 以"结构信号"为主，避免无限堆关键词
 */

// 结构信号：时间/最近一次/频率
const RE_TIME = /(最近|刚刚|刚才|昨天|今天|前天|这周|上周|这两天|这段时间|一直|经常|每次|一到)/;

// 结构信号：因果/转折/过程连接
const RE_CONNECTOR = /(因为|所以|导致|结果|于是|然后|但|但是|后来|同时|不过)/;

// 结构信号：引用/对话（发生过具体对话/事件）
const RE_QUOTE = /["""「」『』]/;

// 结构信号：角色（极少量即可，不要扩展到无穷）
const RE_ROLE = /(领导|老板|同事|客户|家里|家人|伴侣|对象|孩子)/;

// 结构信号：事件动词（少量，但覆盖"被动/冲突/任务压迫"）
// 扩展：包含"被 + 动词"的结构（如"被骂"、"被批评"、"被否定"、"被催"）
const RE_EVENT = /(被.*?(骂|批评|否定|催|开|辞|pua|PUA)|让|叫|说|骂|批评|安排|催|逼|改|加班|开会|对接|汇报|延期|出错|锅|被|想离职|想辞职)/;

// 认知/想法：内心语言 + 假设/后果
// 扩展：包含"担心/害怕 + 被/会"的组合（如"担心被开"、"害怕被骂"）
const RE_THOUGHT = /(我?觉得|我?想|我?担心|我?怕|我在想|我?怀疑|我?认为|我?感觉|会不会|是不是|要是.*就|万一|如果.*(就|那)|可能|一定|肯定|完了|糟了|担心.*被|害怕.*被|担心.*会|害怕.*会|最怕|最担心|最担心的是|最怕的是)/;

// 情绪/评价（少量）：不列"开心/水果"这类，主要用于 hasOnlyEmotion
const RE_EMOTION = /(难受|焦虑|烦|崩溃|委屈|低落|生气|气死|压力大|烦死|受不了|麻了|抑郁|恐慌|想哭|累死)/;
const RE_PROFANITY = /(傻逼|他妈的|妈的|垃圾|废物)/;

/**
 * 槽位判断：检查用户回答中是否包含场景信息（hasSituation）
 * 
 * 满足任一：
 * - 有时间/频率/最近一次信号
 * - 有人物/角色信号（领导/同事/家人/客户…）
 * - 有事件动词/发生信号（被/让/叫/说/骂/安排/加班/开会/改…）
 * - 有因果/转折信号（因为/所以/导致/结果/于是/然后/但/但是）
 * - 有引号/对话信号（"…" 或 『…』，暗示发生过对话/事件）
 * 
 * 重点：hasSituation 不追求"真理解"，只要能稳定区分"有事发生" vs "纯情绪吐槽"
 * 
 * 排除规则：如果"被"出现在"觉得"、"认为"等想法词之后，不算场景（如"我觉得会被开"）
 */
function hasSituation(userMessage: string): boolean {
  const text = (userMessage || "").trim();

  // 排除规则：如果"被"出现在"觉得"、"认为"等想法词之后，不算场景
  // 例如："我就觉得我完了会被开" → 不算场景，只算想法
  const thoughtBeforeBei = /(觉得|认为|以为|感觉|担心|害怕|是不是|会不会|完了|肯定要|要被|会被).*被/;
  if (thoughtBeforeBei.test(text)) {
    // 如果"被"出现在想法词之后，需要检查是否有其他场景信号
    // 如果有时间/因果/引号/角色+事件组合，仍然算场景
    if (RE_TIME.test(text) || RE_CONNECTOR.test(text) || RE_QUOTE.test(text) || (RE_ROLE.test(text) && RE_EVENT.test(text))) {
      return true;
    }
    // 否则不算场景
    return false;
  }

  // 排除规则2：如果"逼"出现在脏话中（如"傻逼"），不算场景
  // 检查是否包含脏话，如果包含，排除脏话中的"逼"字
  if (RE_PROFANITY.test(text)) {
    // 如果包含脏话，需要排除脏话中的"逼"字
    // 创建一个临时文本，移除脏话
    const textWithoutProfanity = text.replace(/傻逼|他妈的|妈的|垃圾|废物/g, '');
    // 检查移除脏话后的文本是否还有事件动词
    const hasEventAfterRemoval = RE_EVENT.test(textWithoutProfanity);
    // 如果移除脏话后还有事件动词，或者有其他场景信号，仍然算场景
    if (hasEventAfterRemoval || RE_TIME.test(text) || RE_CONNECTOR.test(text) || RE_QUOTE.test(text) || (RE_ROLE.test(text) && RE_EVENT.test(textWithoutProfanity))) {
      return true;
    }
    // 否则不算场景（只有脏话中的"逼"字）
    return false;
  }

  return (
    RE_TIME.test(text) ||
    RE_CONNECTOR.test(text) ||
    RE_QUOTE.test(text) ||
    (RE_ROLE.test(text) && RE_EVENT.test(text)) ||
    RE_EVENT.test(text)
  );
}

/**
 * 槽位判断：检查用户回答中是否包含想法/担心信息（hasThought）
 * 
 * 满足任一：
 * - 内心语言/认知框架：我觉得/我想/我担心/我怕/我在想/我怀疑/我认为
 * - 预期后果/灾难化/假设：会不会/是不是/要是…就/万一/如果…那/可能/一定/肯定/完了
 * - 自我评价/核心信念：我不行/我很差/我没用/我就是…（不用列太多，给少量典型）
 */
function hasThought(userMessage: string): boolean {
  const text = (userMessage || "").trim();

  return RE_THOUGHT.test(text);
}

/**
 * 槽位判断：检查是否只有情绪/评价，没有事件结构（hasOnlyEmotion）
 * 
 * 满足：
 * - hasSituation=false 且（命中情绪/评价词或脏话/强烈修辞）
 * - 同时没有明显的"发生了什么"结构信号
 */
function hasOnlyEmotion(userMessage: string): boolean {
  const text = (userMessage || "").trim();

  const situation = hasSituation(text);

  if (situation) {
    return false; // 如果有场景，不是"只有情绪"
  }

  // 检查是否命中情绪/评价词或脏话
  return RE_EMOTION.test(text) || RE_PROFANITY.test(text);
}

/**
 * 从用户回答中推断苏格拉底槽位状态
 * 返回 { situation: boolean, thought: boolean }
 */
function inferSocraticSlots(userMessage: string): { situation: boolean; thought: boolean } {
  return {
    situation: hasSituation(userMessage),
    thought: hasThought(userMessage),
  };
}

/**
 * 更新压力苏格拉底状态
 * 根据用户消息更新槽位状态（只会从 false→true，不会回退）
 */
export function updatePressureSocraticState(
  userMessage: string,
  currentState?: PressureSocraticState
): PressureSocraticState {
  const slots = inferSocraticSlots(userMessage);
  const onlyEmotion = hasOnlyEmotion(userMessage);

  // 如果当前状态不存在，创建新状态
  if (!currentState) {
    return {
      asked: false,
      situationDone: slots.situation,
      thoughtDone: slots.thought,
    };
  }

  // 更新状态（只会从 false→true，不会回退）
  return {
    ...currentState,
    situationDone: currentState.situationDone || slots.situation,
    thoughtDone: currentState.thoughtDone || slots.thought,
  };
}

/**
 * 生成 intake 阶段的苏格拉底式问题
 * 聚焦：触发情境/自动想法/影响/证据/替代观点
 * 
 * 策略：第一轮只问 1 个开放式问题，量表问题（0-10）放到 gap_followup 阶段
 * 
 * 特殊规则：
 * 1. 对于明显正向情绪输入，不生成评估式问题（返回空数组，让调用方走 support 逻辑）
 * 2. 对于压力相关输入，优先使用苏格拉底式澄清（情境+想法），而不是直接问持续时间/量表
 * 3. 苏格拉底首问只问一次，后续缺什么补什么（slot-filling）
 */
export function buildIntakeQuestions(context: QuestionContext): string[] {
  // 如果应该禁用，返回空数组（让调用方使用原逻辑）
  if (shouldDisableSocraticPolicy(context)) {
    return [];
  }

  // 特殊规则：对于明显正向情绪输入，不生成评估式问题
  // 这样会触发调用方使用原逻辑，而原逻辑会根据 routeType 走 support
  if (isPositiveEmotionInput(context.userMessage)) {
    return [];
  }

  const info = checkUserMessageForInfo(context.userMessage);
  const questions: string[] = [];

  // 判断是否已经问过苏格拉底首问
  const socraticAsked = hasAskedSocraticQuestions(context.existingIntake);

  // 使用新的槽位判断逻辑
  const slots = inferSocraticSlots(context.userMessage);

  // 获取压力苏格拉底状态（如果存在）
  const pressureSocratic = context.pressureSocratic;

  // 修复D: 优先级调整：压力场景苏格拉底式澄清 > 风险问题（如果风险信号强）> 其他模板问题
  // 注意：影响评分（0-10 量表）和持续时间不在第一轮问，放到 gap_followup 阶段
  // 第一轮问题不应包含任何选项提示或示例，只问纯开放式问题

  // 修复D: 压力场景优先于风险问题（除非风险信号很强）
  // 压力场景苏格拉底式澄清（stress_socratic_first 策略）
  // 触发条件：包含压力信号，且未命中 crisis/support，且是首轮追问（未问过场景/想法）
  // 修复：第一问必须是"具体表现/场景澄清"（苏格拉底式），不要第一步就抛量表
  if (hasStressSignal(context.userMessage)) {
    // 检查是否应该问苏格拉底问题
    const shouldAskSocratic = !pressureSocratic?.asked &&
      (!pressureSocratic?.situationDone || !pressureSocratic?.thoughtDone);

    if (shouldAskSocratic && !socraticAsked) {
      // 第一问：场景澄清（苏格拉底式，情境→想法方向）
      // 注意：问法要短，避免一口气三个长句；必要时拆成两句
      // 修复：根据测试要求，第一问需要包含"具体场景/发生了什么" + "想法/担心"
      // 但问法要短，可以合并成一个问题
      questions.push('最近一次压力最明显的具体场景是什么？当时发生了什么？你脑子里闪过的最强烈想法/担心是什么？');
      // 注意：asked 状态需要在调用方设置（route.ts 中）
    }
  }
  // 修复D: 如果风险信号很强（且不是压力场景），优先问自伤问题
  else if (shouldAskRiskQuestion(context, info.hasRiskClue)) {
    // 第一轮用开放式问法，不提供选项
    questions.push('为了确认你的安全：最近有没有出现伤害自己的想法？');
  }
  // 1. 如果缺少触发器/情境，优先问（纯开放式问题，不包含示例）
  else if (!info.hasTrigger) {
    questions.push('通常在什么情境下这种感觉最明显？');
  }
  // 2. 如果已有触发情境但缺少持续时间，问持续时间（纯开放式问题，不包含选项）
  // 注意：对于压力场景，持续时间问题应该在苏格拉底式澄清之后，所以这里不优先问
  else if (!info.hasDuration && !hasStressSignal(context.userMessage)) {
    questions.push('这种状态大概持续了多久？');
  }
  // 3. 如果触发情境和持续时间都有，问一个更开放的探索性问题
  else {
    questions.push('发生了什么让你有这种感受？或者最近最困扰你的是什么？');
  }

  // 确保只返回 1 个问题（第一轮策略）
  return questions.slice(0, 1);
}

/**
 * 检查是否为职场压力/睡眠/焦虑等典型压力场景
 * 这些场景的 gap_followup 应采用苏格拉底式提问 + 0-10 可选的结构
 */
function isWorkplaceStressScenario(userMessage: string): boolean {
  const message = userMessage.toLowerCase();
  const stressKeywords = [
    '工作压力', '职场压力', '工作负担', '被领导', '被老板', '被骂',
    '睡眠', '睡不着', '睡不好', '失眠', '脑子停不下来', '停不下来',
    '焦虑', '担心', '紧张', '压力大', '压力很大'
  ];
  return stressKeywords.some(keyword => message.includes(keyword));
}

/**
 * 检查问题是否包含 0-10 量表
 */
function hasScale0To10(question: string): boolean {
  return /0-10|0\s*到\s*10|0\s*至\s*10|0\s*～\s*10|0\s*~\s*10/.test(question) &&
    /影响|睡眠|工作|社交|打分|评分/.test(question);
}

/**
 * 检查是否为强风险信号（riskSignalStrong）
 * 只有在明确风险线索或明确高风险判定时才返回 true
 */
function isRiskSignalStrong(context: QuestionContext, hasRiskClue: boolean): boolean {
  // 条件1：文本包含明显风险线索
  if (hasRiskClue) {
    return true;
  }

  // 条件2：高负向情绪强度 + 文本包含风险提示（与 shouldAskRiskQuestion 保持一致）
  if (context.emotion) {
    const negativeEmotions = ['焦虑', '抑郁', '愤怒', '悲伤', '恐惧'];
    const isNegativeEmotion = negativeEmotions.includes(context.emotion.label);
    const isHighIntensity = context.emotion.score >= 7;

    if (isNegativeEmotion && isHighIntensity) {
      const message = context.userMessage.toLowerCase();
      const weakRiskHints = [
        '绝望', '无望', '没有意义', '活不下去', '崩溃', '撑不住',
        '受不了', '极度', '非常痛苦', '很痛苦', '很难受',
        '无法承受', '承受不了', '看不到希望', '没有希望',
        '想消失', '想离开', '不想继续', '没有意义'
      ];
      const textHasRiskHints = weakRiskHints.some(hint => message.includes(hint));

      if (textHasRiskHints) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 生成 gap_followup 阶段的苏格拉底式问题
 * 
 * 优先级（修复：压力场景优先于风险问题，除非风险信号很强）：
 * 1. crisis 明确命中 → 走 crisis 路由（已有，不改协议）
 * 2. risk 追问（自伤）：仅在 riskSignalStrong 时触发
 * 3. stress/work-pressure 场景 → 走苏格拉底式追问（slot-filling）
 * 4. 其他普通 intake/gap followup
 * 
 * 特殊规则：
 * - 苏格拉底首问只问一次，后续缺什么补什么（slot-filling）
 * - 如果已经问过首问，根据用户回答缺什么补什么
 * - 如果两个槽位都齐了，进入后续量化问题（0-10/持续多久/影响）
 * 
 * @returns 问题数组（最多 2 个），或 null（使用原逻辑）
 */
export function buildGapFollowupQuestion(
  context: QuestionContext,
  missingSlot: 'duration' | 'impact' | 'risk' | 'context'
): string[] | null {
  console.log('[DEBUG Policy] buildGapFollowup called', {
    missingSlot,
    socratic: context.pressureSocratic,
    msg: context.userMessage
  });
  // 如果应该禁用，返回 null（让调用方使用原逻辑）
  if (shouldDisableSocraticPolicy(context)) {
    return null;
  }

  // 获取 followup 槽位状态（如果存在）
  const followupSlot = context.followupSlot;

  // 检查风险信号强度
  const info = checkUserMessageForInfo(context.userMessage);
  const riskSignalStrong = isRiskSignalStrong(context, info.hasRiskClue);

  // 判断是否已经问过苏格拉底首问
  const socraticAsked = hasAskedSocraticQuestions(context.existingIntake);

  // 判断是否为压力场景
  const isStressScenario = hasStressSignal(context.userMessage) || isWorkplaceStressScenario(context.userMessage);

  // 获取压力苏格拉底状态（如果存在）
  const pressureSocratic = context.pressureSocratic;

  // 修复：使用 followupSlot 状态来判断是否应该问风险/影响问题
  // 如果已经问过并得到答案，不再重复问
  if (followupSlot) {
    // 如果风险槽位已完成（riskLevel != unknown），且 missingSlot 是 'risk'，不应该再问
    if (missingSlot === 'risk' && followupSlot.riskLevel !== 'unknown' && followupSlot.asked.risk) {
      // 如果影响槽位未完成，转向问影响
      if (followupSlot.impactScore === undefined && !followupSlot.asked.impact) {
        return ['这件事对你最近的睡眠/工作效率影响大吗？0-10 打个分（0=几乎无影响，10=非常严重）'];
      }
      // 如果两个槽位都完成了，返回 null（让调用方进入 conclusion）
      if (followupSlot.done) {
        return null;
      }
    }

    // 如果影响槽位已完成（impactScore 有值），且 missingSlot 是 'impact'，不应该再问
    if (missingSlot === 'impact' && followupSlot.impactScore !== undefined && followupSlot.asked.impact) {
      // 如果风险槽位未完成，转向问风险（但需要检查是否应该问）
      if (followupSlot.riskLevel === 'unknown' && !followupSlot.asked.risk && riskSignalStrong) {
        return ['为了确认你的安全：最近有没有出现伤害自己的想法？（没有/偶尔闪过/经常出现/已经计划）'];
      }
      // 如果两个槽位都完成了，返回 null（让调用方进入 conclusion）
      if (followupSlot.done) {
        return null;
      }
    }
  }

  // 判断是否应该进行 slot-filling（如果已经问过苏格拉底首问，且是压力相关场景）
  // 注意：即使不是明确的压力场景，如果已经问过首问，也应该进行 slot-filling
  const shouldDoSlotFilling = socraticAsked && (isStressScenario || hasStressSignal(context.userMessage) || context.existingIntake?.context || context.existingIntake?.mainIssue);

  // 修复：如果已经问过苏格拉底首问（socraticAsked 为 true），无论是否为压力场景，都应该进行 slot-filling
  // 这样可以处理"烦死了 傻逼"这种只有情绪词的情况
  const shouldEnterSlotFilling = socraticAsked || shouldDoSlotFilling;

  // 修复D: 压力场景优先于风险问题，除非风险信号很强
  // 对于压力场景，即使 missingSlot 是 'risk'，也应该走苏格拉底式追问，除非风险信号很强
  // 注意：如果用户消息只是简单的情绪词（如"我很难受"），且没有 existingIntake，应该走非压力场景逻辑
  const isSimpleEmotionOnly = !context.existingIntake && !socraticAsked &&
    hasOnlyEmotion(context.userMessage) && !isWorkplaceStressScenario(context.userMessage);

  if ((isStressScenario || shouldEnterSlotFilling) && !isSimpleEmotionOnly) {
    // 修复D: 只有在风险信号很强时，才优先问风险问题
    // 注意：对于普通压力场景（如"工作压力好大"、"被老板骂"），即使 missingSlot 是 'risk'，也不应该问风险问题
    // 只有明确的风险线索（如"绝望"、"看不到希望"、"活不下去"）才触发风险问题
    // 修复D: 检查是否应该问风险问题（使用收紧后的shouldAskRiskQuestion）
    if (missingSlot === 'risk' && shouldAskRiskQuestion(context, info.hasRiskClue) && !hasStressSignal(context.userMessage)) {
      // 只有在风险信号很强且不是普通压力场景时，才问风险问题
      return ['为了确认你的安全：最近有没有出现伤害自己的想法？（没有/偶尔闪过/经常出现/已经计划）'];
    }

    // 修复：使用 pressureSocratic 状态来判断是否应该问苏格拉底问题
    // 如果 pressureSocratic.asked === false 且（!situationDone || !thoughtDone）→ 输出苏格拉底问题
    // 否则（已 asked 或 slots 都齐）→ 进入下一步量化
    const shouldAskSocratic = !pressureSocratic?.asked &&
      (!pressureSocratic?.situationDone || !pressureSocratic?.thoughtDone);

    // 如果已经问过苏格拉底首问，进行 slot-filling
    // 或者虽然不是压力场景，但已经问过首问，也应该进行 slot-filling
    if (shouldEnterSlotFilling) {
      // 使用 pressureSocratic 状态（如果存在）或从用户消息推断
      // 但需要同时检查 hasOnlyEmotion，因为即使 pressureSocratic 状态显示两个槽位都是 false，
      // 也可能是因为用户只回答了情绪词（hasOnlyEmotion=true），此时应该优先问场景
      const slots = pressureSocratic ? {
        situation: pressureSocratic.situationDone,
        thought: pressureSocratic.thoughtDone,
      } : inferSocraticSlots(context.userMessage);

      const questions: string[] = [];

      // 防重复提问：检查是否与上一轮问题相同
      const lastQuestion = pressureSocratic?.lastQuestionText;
      const normalizeQuestion = (q: string) => q.replace(/[，,。；;：:！!？?\s\n\r]/g, '').toLowerCase();

      // 修复：压力 case 的两步 followup 策略
      // Q1（苏格拉底：情境→自动想法）：如果缺少场景或想法，先问场景
      // Q2（影响/强度）：如果场景和想法都有了，再问影响/强度（0-10 或可选项）

      // 优先检查 hasOnlyEmotion：如果只有情绪词，直接问场景（无论 missingSlot 是什么）
      if (hasOnlyEmotion(context.userMessage)) {
        const question = '能跟我多说说具体的情况吗？最近一次让你感到这种压力是在什么时候，当时发生了什么？';
        // 检查是否与上一轮问题相同
        if (!lastQuestion || normalizeQuestion(question) !== normalizeQuestion(lastQuestion)) {
          questions.push(question);
        } else {
          // 如果问题相同，但用户已经回答了（包含 situation），则推进到下一个槽位
          if (slots.situation) {
            questions.push('当时你脑子里闪过的最强烈想法/担心是什么？');
          }
        }
      }
      // 使用新的槽位判断逻辑进行 slot-filling
      // situation=true thought=false → 只问 thought（第二问）
      else if (slots.situation && !slots.thought) {
        const question = '当时你脑子里闪过的最强烈想法/担心是什么？';
        // 检查是否与上一轮问题相同
        if (!lastQuestion || normalizeQuestion(question) !== normalizeQuestion(lastQuestion)) {
          questions.push(question);
        }
      }
      // situation=false thought=true → 只问 situation（第一问）
      else if (!slots.situation && slots.thought) {
        const question = '能跟我多说说具体的情况吗？最近一次让你感到这种压力是在什么时候，当时发生了什么？';
        // 检查是否与上一轮问题相同
        if (!lastQuestion || normalizeQuestion(question) !== normalizeQuestion(lastQuestion)) {
          questions.push(question);
        } else {
          // 如果问题相同，但用户已经回答了（包含 thought），则推进到下一个槽位（影响/强度）
          if (slots.thought) {
            // 第二问：影响/强度（0-10 或可选项）
            questions.push('这件事对你最近的睡眠/工作效率影响大吗？0-10 打个分（0=几乎无影响，10=非常严重）');
          }
        }
      }
      // 都 true → 再进入量化（影响/强度），并且避免重复"首问"
      else if (slots.situation && slots.thought) {
        // 两个都有 → 进入后续量化问题（根据 missingSlot）
        // 修复：优先问影响/强度（0-10），不要重复问场景/想法
        switch (missingSlot) {
          case 'duration':
            // 如果用户已经回答了"持续多久/强度多少"，不要重复问同类问题
            // 检查用户消息中是否包含持续时间信息
            const hasDurationInfo = /(最近|这几天|两周|几个月|一直|半年|一年|很久|持续|开始|自从|以来|天|周|月)/.test(context.userMessage);
            if (hasDurationInfo) {
              // 已经有持续时间信息，转向问影响/强度
              questions.push('这件事对你最近的睡眠/工作效率影响大吗？0-10 打个分（0=几乎无影响，10=非常严重）');
            } else {
              questions.push('这种状态大概持续了多久？');
            }
            break;
          case 'impact':
            // 第二问：影响/强度（0-10 或可选项）
            questions.push('这件事对你最近的睡眠/工作效率影响大吗？0-10 打个分（0=几乎无影响，10=非常严重）');
            break;
          case 'context':
            // 如果已经有场景，不应该再问 context
            // 但可以问影响（0-10量表）
            questions.push('这件事对你最近的睡眠/工作效率影响大吗？0-10 打个分（0=几乎无影响，10=非常严重）');
            break;
          default:
            // 默认问影响/强度
            questions.push('这件事对你最近的睡眠/工作效率影响大吗？0-10 打个分（0=几乎无影响，10=非常严重）');
        }
      }
      // 两个都没有 → 根据 missingSlot 处理
      // 修复：确保所有 gap_followup 问题都包含可选项或0-10打分
      else {
        switch (missingSlot) {
          case 'duration':
            // 持续时间：自然询问（移除僵硬的选项）
            questions.push('这种状态大概持续了多久了？是最近几天才开始，还是有一段时间了？');
            break;
          case 'impact':
            // 影响：使用 0-10 打分
            questions.push('它对你的睡眠/工作/社交影响有多大？请打分 0-10（0=几乎无影响，10=严重影响）');
            break;
          case 'context':
            // 触发情境：自然询问（移除僵硬的选项，转为苏格拉底式引导）
            questions.push('能跟我多说说具体的情况吗？最近一次让你感到这种压力是在什么时候，当时发生了什么？');
            break;
          default:
            return null;
        }
      }

      // Guard：如果问题列表为空，返回 null（避免输出空问题）
      if (questions.length === 0) {
        return null;
      }

      return questions;
    } else if (shouldAskSocratic) {
      // 还没问过首问，且是压力场景，且应该问苏格拉底问题
      const questions: string[] = [];

      // 防重复提问：检查是否与上一轮问题相同
      const lastQuestion = pressureSocratic?.lastQuestionText;
      const normalizeQuestion = (q: string) => q.replace(/[，,。；;：:！!？?\s\n\r]/g, '').toLowerCase();

      // 修复：压力 case 的两步 followup 策略
      // Q1（苏格拉底：情境→自动想法）：合并问法（场景+想法）
      // Q2（影响/强度）：职场压力场景必须返回2问，第二问包含0-10量表

      // 特殊处理：如果 hasOnlyEmotion=true，只问 situation（不合并问法）
      if (hasOnlyEmotion(context.userMessage)) {
        const question = '最近一次压力最明显的具体场景是什么？当时发生了什么？';
        // 检查是否与上一轮问题相同
        if (!lastQuestion || normalizeQuestion(question) !== normalizeQuestion(lastQuestion)) {
          questions.push(question);
        }
      } else {
        // 否则问首问（合并问法）：情境化 + 认知
        // 修复：根据测试要求，职场压力场景需要返回2问（Q1 苏格拉底式，Q2 0-10）
        const question = '最近一次压力最明显的具体场景是什么？当时发生了什么？你脑子里闪过的最强烈想法/担心是什么？';
        // 检查是否与上一轮问题相同
        if (!lastQuestion || normalizeQuestion(question) !== normalizeQuestion(lastQuestion)) {
          questions.push(question);

          /* 修复：移除双重提问，保持单次单问原则
          // 修复：职场压力场景必须返回2问，第二问包含0-10量表
          // 如果 missingSlot 是 impact、context 或 risk，必须在首问后加上 0-10 量表（第二问）
          if (isWorkplaceStressScenario(context.userMessage)) {
            // 职场压力场景：必须在首问后加上 0-10 量表（第二问）
            questions.push('这件事对你最近的睡眠/工作效率影响大吗？0-10 打个分（0=几乎无影响，10=非常严重）');
          } else if (missingSlot === 'impact' || missingSlot === 'context' || missingSlot === 'risk') {
            // 非职场压力场景，但如果 missingSlot 是 impact、context 或 risk，也可以加上 0-10 量表
            questions.push('这件事对你最近的睡眠/工作效率影响大吗？0-10 打个分（0=几乎无影响，10=非常严重）');
          }
          */
        } else {
          // 如果问题相同，但用户已经回答了（包含 situation 和 thought），则推进到下一个槽位
          const slots = inferSocraticSlots(context.userMessage);
          if (slots.situation && slots.thought) {
            // 第二问：影响/强度（0-10 或可选项）
            questions.push('这件事对你最近的睡眠/工作效率影响大吗？0-10 打个分（0=几乎无影响，10=非常严重）');
          } else if (slots.situation && !slots.thought) {
            // 有场景但没想法，问想法
            questions.push('当时你脑子里闪过的最强烈想法/担心是什么？');
          }
        }
      }

      return questions;
    } else {
      // 已经问过或槽位都齐了，进入下一步量化
      // 修复：确保所有 gap_followup 问题都包含可选项或0-10打分
      const questions: string[] = [];

      switch (missingSlot) {
        case 'duration':
          // 持续时间：提供选项
          questions.push('这种状态大概持续了多久？更接近：A) 几天 B) 几周 C) 几个月 D) 不确定');
          break;
        case 'impact':
          // 影响：使用 0-10 打分
          questions.push('它对你的睡眠/工作/社交影响有多大？请打分 0-10（0=几乎无影响，10=严重影响）');
          break;
        case 'context':
          // 触发情境：提供选项
          questions.push('通常在什么情境下这种感觉最明显？更接近：A) 工作/学习压力 B) 人际关系 C) 独处/睡前 D) 特定事件触发');
          break;
        default:
          return null;
      }

      // Guard：如果问题列表为空，返回 null（避免输出空问题）
      if (questions.length === 0) {
        return null;
      }

      return questions;
    }
  }

  // 非压力场景：风险问题优先级最高，单独处理（不采用 2 问结构）
  // 修复：检查 followupSlot 状态，避免重复问已回答的槽位
  if (missingSlot === 'risk' && riskSignalStrong) {
    // 如果已经问过并得到答案，不再重复问
    if (followupSlot && followupSlot.riskLevel !== 'unknown' && followupSlot.asked.risk) {
      // 如果影响槽位未完成，转向问影响
      if (followupSlot.impactScore === undefined && !followupSlot.asked.impact) {
        return ['这件事对你最近的睡眠/工作效率影响大吗？0-10 打个分（0=几乎无影响，10=非常严重）'];
      }
      // 如果两个槽位都完成了，返回 null（让调用方进入 conclusion）
      if (followupSlot.done) {
        return null;
      }
      // 否则返回 null，让调用方进入 conclusion
      return null;
    }
    return ['为了确认你的安全：最近有没有出现伤害自己的想法？（没有/偶尔闪过/经常出现/已经计划）'];
  }

  // 其他场景：单问 + 选项/0-10 打分
  // 修复：确保所有 gap_followup 问题都包含可选项或0-10打分
  switch (missingSlot) {
    case 'context':
      // 触发情境：提供选项
      return ['通常在什么情境下这种感觉最明显？更接近：A) 工作/学习压力 B) 人际关系 C) 独处/睡前 D) 特定事件触发'];

    case 'duration':
      // 持续时间：提供选项
      return ['这种状态大概持续了多久？更接近：A) 几天 B) 几周 C) 几个月 D) 不确定'];

    case 'impact':
      // 影响：使用 0-10 打分
      // 修复：检查 followupSlot 状态，避免重复问已回答的槽位
      if (followupSlot && followupSlot.impactScore !== undefined && followupSlot.asked.impact) {
        // 如果影响槽位已完成，检查风险槽位
        if (followupSlot.riskLevel === 'unknown' && !followupSlot.asked.risk && riskSignalStrong) {
          return ['为了确认你的安全：最近有没有出现伤害自己的想法？（没有/偶尔闪过/经常出现/已经计划）'];
        }
        // 如果两个槽位都完成了，返回 null（让调用方进入 conclusion）
        if (followupSlot.done) {
          return null;
        }
        // 否则返回 null，让调用方进入 conclusion
        return null;
      }
      return ['它对你的睡眠/工作/社交影响有多大？请打分 0-10（0=几乎无影响，10=严重影响）'];

    case 'risk':
      // 风险问题：提供选项
      return ['为了确认你的安全：最近有没有出现伤害自己的想法？（没有/偶尔闪过/经常出现/已经计划）'];

    default:
      return null;
  }
}
