import { NextRequest, NextResponse } from 'next/server';
import { StreamData } from 'ai'; // ai sdk imports
import { streamChatCompletion } from '@/lib/ai/deepseek';
import { analyzeEmotion } from '@/lib/ai/emotion';
import { streamCrisisReply } from '@/lib/ai/crisis';
import { streamSupportReply } from '@/lib/ai/support';
import { generateAssessmentQuestions } from '@/lib/ai/assessment';
import { generateAssessmentConclusion } from '@/lib/ai/assessment/conclusion';
import { detectGap } from '@/lib/ai/assessment/gap';
import { buildIntakeQuestions, buildGapFollowupQuestion, shouldEnterAssessment, updatePressureSocraticState, updateFollowupSlotState, parseRiskLevel, parseImpactScore } from '@/lib/ai/assessment/question_policy';
import { classifyCrisisIntent, quickCrisisKeywordCheck } from '@/lib/ai/crisis-classifier';
import { ChatRequest, ChatResponse, RouteType, AssessmentStage, ChatState, PressureSocraticState, FollowupSlotState } from '@/types/chat';

/**
 * 评估问题题库
 */
const Q_DURATION = '这种状态大概持续了多久？（几天/几周/几个月/不确定）';
const Q_IMPACT = '它对你的睡眠/工作/社交影响有多大？请打分 0-10（0=几乎无影响，10=严重影响）';
const Q_RISK = '为了确认你的安全：最近有没有出现伤害自己的想法？（没有/偶尔闪过/经常出现/已经计划）';

/**
 * 检查 followupAnswer 是否包含明确的高风险表达
 * 仅在明确高风险时才升级为 crisis
 * 
 * 规则：
 * 1. 优先匹配风险问题选项（"伤害自己的想法：经常出现" 或 "伤害自己的想法：已经计划"）
 * 2. 次优匹配明确自杀表达（想死/自杀/结束生命等）
 * 3. 必须避免"演讲计划/工作计划"等误伤（出现"演讲/上台/项目/工作机会"等且没有自杀语义时不得升级）
 */
function isHighRiskFollowupAnswer(followupAnswer: string): boolean {
  const answer = followupAnswer.toLowerCase().trim();

  // 明确排除"没有伤害自己的想法"的情况（优先判断，避免误判）
  if (answer.includes('没有伤害自己的想法') ||
    answer.includes('没有伤害自己') ||
    answer.includes('没有自伤') ||
    answer.includes('没有自杀')) {
    return false;
  }

  // 1. 优先匹配风险问题选项（必须包含"伤害自己的想法"上下文）
  const riskQuestionOptions = [
    '伤害自己的想法：经常出现',
    '伤害自己的想法：已经计划',
    '伤害自己的想法经常出现',
    '伤害自己的想法已经计划',
    '自伤想法：经常出现',
    '自伤想法：已经计划',
    '自伤想法经常出现',
    '自伤想法已经计划',
  ];

  // 检查是否包含风险问题选项（必须同时包含"伤害自己的想法"或"自伤想法"和"经常出现"或"已经计划"）
  const hasRiskContext = answer.includes('伤害自己的想法') || answer.includes('自伤想法');
  const hasFrequentThoughts = answer.includes('经常出现');
  const hasPlanned = answer.includes('已经计划');

  // 如果包含风险上下文且包含"经常出现"或"已经计划"，则认为是高风险
  if (hasRiskContext && (hasFrequentThoughts || hasPlanned)) {
    // 但需要排除非自伤语境（如"演讲计划"、"工作计划"等）
    const nonSuicideContexts = [
      '演讲', '上台', '项目', '工作机会', '工作计划', '项目计划',
      '旅行计划', '学习计划', '考试计划', '会议计划'
    ];

    // 如果包含非自伤语境且没有明确的自杀语义，不升级
    const hasNonSuicideContext = nonSuicideContexts.some(ctx => answer.includes(ctx));
    if (hasNonSuicideContext) {
      // 检查是否有明确的自杀语义
      const hasExplicitSuicideIntent = answer.includes('想死') ||
        answer.includes('自杀') ||
        answer.includes('结束生命') ||
        answer.includes('不想活了');
      if (!hasExplicitSuicideIntent) {
        return false; // 非自伤语境，不升级
      }
    }

    return true; // 风险问题选项匹配成功
  }

  // 2. 次优匹配明确自杀表达（必须明确，避免误判）
  const explicitSuicideExpressions = [
    '想死',
    '自杀',
    '结束生命',
    '结束一切',
    '不想活了',
    '不想活',
    '结束自己',
    '割腕',
    '跳楼',
    '上吊',
    '服药自杀',
    '吃药自杀',
    '准备好了方式自杀',
    '准备好了方法自杀',
    '准备好了办法自杀'
  ];

  // 检查是否包含明确的自杀表达
  const hasExplicitSuicide = explicitSuicideExpressions.some(expr => answer.includes(expr));

  // 如果包含明确自杀表达，但同时也包含非自伤语境，需要更严格判断
  if (hasExplicitSuicide) {
    const nonSuicideContexts = [
      '演讲', '上台', '项目', '工作机会', '工作计划', '项目计划',
      '旅行计划', '学习计划', '考试计划', '会议计划'
    ];

    // 如果同时包含非自伤语境，需要确认是自杀相关的"计划"而不是其他计划
    const hasNonSuicideContext = nonSuicideContexts.some(ctx => answer.includes(ctx));
    if (hasNonSuicideContext) {
      // 如果"计划"出现在非自伤语境附近，可能是误判
      // 但如果有明确自杀表达，仍然认为是高风险
      return true;
    }

    return true; // 明确自杀表达，升级为 crisis
  }

  // 3. 不再仅凭"计划/已经计划好了"这种裸词升级（避免误伤）
  // 如果只有"已经计划"但没有风险上下文或明确自杀表达，不升级
  if (hasPlanned && !hasRiskContext && !hasExplicitSuicide) {
    return false;
  }

  return false; // 默认不升级
}

/**
 * 检查用户消息中是否包含特定信息
 */
function checkUserMessageForInfo(userMessage: string): {
  hasDuration: boolean;
  hasFunctionalImpact: boolean;
  hasRisk: boolean;
  hasHighSeverity: boolean;
  hasRiskClue: boolean; // 明显风险线索（但未达到 crisis 关键词门槛）
} {
  const message = userMessage.toLowerCase();

  // 检查持续时间相关表达
  const durationKeywords = [
    '最近', '这几天', '两周', '几个月', '一直', '半年',
    '一年', '很久', '持续', '开始', '自从', '以来'
  ];
  const hasDuration = durationKeywords.some(keyword => message.includes(keyword));

  // 检查功能影响相关表达
  const impactKeywords = [
    '影响睡眠', '影响工作', '没精神', '注意力差', '社交减少',
    '睡不着', '睡不好', '失眠', '效率低', '无法集中',
    '不想社交', '不想出门', '影响学习', '影响生活'
  ];
  const hasFunctionalImpact = impactKeywords.some(keyword => message.includes(keyword));

  // 检查风险相关表达（明确的风险表达，达到 crisis 级别）
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

  // 检查高严重程度表达
  const severityKeywords = [
    '崩溃', '撑不住', '受不了', '非常', '极度', '严重',
    '完全', '彻底', '绝望', '无望', '没有意义'
  ];
  const hasHighSeverity = severityKeywords.some(keyword => message.includes(keyword));

  return {
    hasDuration,
    hasFunctionalImpact,
    hasRisk,
    hasHighSeverity,
    hasRiskClue,
  };
}

/**
 * 生成自适应的评估问题（1-2个）
 * 注意：这是 question_policy 的后备方案，仅在禁用苏格拉底式提问策略时使用
 */
function generateAdaptiveAssessmentQuestions(userMessage: string, emotion?: { label: string; score: number }): string[] {
  const info = checkUserMessageForInfo(userMessage);
  const questions: string[] = [];

  // 默认优先补 duration 和 functional impact
  // 如果缺少 duration，优先问
  if (!info.hasDuration) {
    questions.push(Q_DURATION);
  }

  // 如果缺少 functional impact，优先问
  if (!info.hasFunctionalImpact && questions.length < 2) {
    questions.push(Q_IMPACT);
  }

  // 自伤问题仅在特定条件下询问（条件触发，必须收窄）
  // 条件：
  // 1. 文本包含明显风险线索（但未达到 crisis 关键词门槛）
  // 2. 或抽取到情绪为明显负向且强度高（score >= 7 且为负向情绪）且文本包含至少弱风险提示
  // 修复：不能仅凭 emotion.score >= 7 就触发，必须同时满足文本包含风险提示
  let shouldAskRisk = false;

  // 条件1：明显风险线索
  if (info.hasRiskClue) {
    shouldAskRisk = true;
  }

  // 条件2：高负面情绪强度 + 文本包含风险提示（不能仅凭情绪强度）
  if (emotion) {
    const negativeEmotions = ['焦虑', '抑郁', '愤怒', '悲伤', '恐惧'];
    const isNegativeEmotion = negativeEmotions.includes(emotion.label);
    const isHighIntensity = emotion.score >= 7;

    if (isNegativeEmotion && isHighIntensity) {
      // 检查文本是否包含至少弱风险提示
      const message = userMessage.toLowerCase();
      const weakRiskHints = [
        '绝望', '无望', '没有意义', '活不下去', '崩溃', '撑不住',
        '受不了', '极度', '非常痛苦', '很痛苦', '很难受',
        '无法承受', '承受不了', '看不到希望', '没有希望',
        '想消失', '想离开', '不想继续', '没有意义'
      ];
      const textHasRiskHints = weakRiskHints.some(hint => message.includes(hint));

      // 只有同时满足：高负向情绪强度 + 文本包含风险提示，才触发自伤追问
      if (textHasRiskHints) {
        shouldAskRisk = true;
      }
    }
  }

  // 只有在满足条件且未满2个问题时才加入风险问题
  if (shouldAskRisk && questions.length < 2) {
    // 如果已经问了 2 个问题，需要替换一个
    if (questions.length >= 2) {
      // 保留 duration（更重要），替换 impact
      questions[1] = Q_RISK;
    } else {
      questions.push(Q_RISK);
    }
  }

  // 如果所有信息都有，至少问一个问题（duration）
  if (questions.length === 0) {
    questions.push(Q_DURATION);
  }

  // 确保最多 2 个问题
  return questions.slice(0, 2);
}

/**
 * 从历史记录中提取初始用户消息作为 initialMessage
 * 逻辑：如果最后一条是 assistant，则找倒数第二条 user 消息；否则找最后一条 user 消息
 */
function extractInitialMessageFromHistory(
  history: Array<{ role: 'user' | 'assistant'; content: string }>
): string | null {
  if (history.length === 0) {
    return null;
  }

  // 如果最后一条是 assistant，找倒数第二条 user 消息（通常是初始消息）
  if (history[history.length - 1].role === 'assistant') {
    for (let i = history.length - 2; i >= 0; i--) {
      if (history[i].role === 'user') {
        return history[i].content;
      }
    }
  }

  // 否则从后往前找最后一条用户消息
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].role === 'user') {
      return history[i].content;
    }
  }

  return null;
}

/**
 * 意图分类结果
 */
interface IntentClassification {
  isCrisis: boolean;
  isSupportPositive: boolean;
  isSupportUserWantsVenting: boolean;
  shouldAssessment: boolean;
  needsLLMCheck?: boolean; // Optional: set to true if LLM check is needed for ambiguous cases
}

/**
 * 分类用户意图（不新增协议字段，只是内部函数）
 * 优先级：crisis > support(positive|venting) > assessment
 * 
 * @param userMessage 用户消息内容
 * @param emotion 情绪分析结果（可选）
 * @returns 意图分类结果
 */
function classifyIntent(
  userMessage: string,
  emotion?: { label: string; score: number }
): IntentClassification {
  const message = userMessage.toLowerCase().trim();

  // 1. 快速关键词检查（高置信度关键词直接命中）
  const quickCheck = quickCrisisKeywordCheck(message);
  if (quickCheck) {
    return {
      isCrisis: true,
      isSupportPositive: false,
      isSupportUserWantsVenting: false,
      shouldAssessment: false,
      needsLLMCheck: false,
    };
  }

  // 2. 扩展检查：旧的 hardcoded 列表已移除，统一集成到 quickCrisisKeywordCheck 中
  // 如果 quickCheck 没命中，且没有明确的 venting 意图，后续会 fallback 到 LLM assessment 或 support
  // 这里不再需要双重维护列表

  // 2. 检查用户是否明确要求只倾诉/不要建议
  const ventingKeywords = [
    '只想倾诉', '不要建议', '不要分析', '不需要建议', '不需要分析',
    '只要倾诉', '只想说说', '只想聊聊', '不要给建议', '不要给分析',
    '不需要给建议', '不需要给分析'
  ];
  const isSupportUserWantsVenting = ventingKeywords.some(keyword => message.includes(keyword));
  if (isSupportUserWantsVenting) {
    return {
      isCrisis: false,
      isSupportPositive: false,
      isSupportUserWantsVenting: true,
      shouldAssessment: false,
    };
  }

  // 3. 检查是否为正向场景（正向置信度 + 负向排除）
  // 正向关键词（核心正向表达）
  const positiveKeywords = [
    '开心', '高兴', '太好了', '顺利', '成功', '放松', '轻松', '安心',
    '感恩', '感谢', '幸福', '满足', '激动', '兴奋', '好消息', '喜提',
    '中奖了', '被夸了', '升职', '加薪', '好开心', '很开心', '很开心呀', '好开心呀',
    '泡了温泉', '泡温泉', '治愈', '很棒', '很好', '不错', '舒服',
    '愉快', '快乐', '愉悦', '舒畅', '惬意', '享受',
    '吃水果', '水果', '是呀是呀', '是呀', '是的呀', '对呀', '对的呀',
    '好喜欢', '很喜欢', '太棒了', '真棒', '真好', '真不错', '完成了'
  ];

  // 负向/困扰关键词（如果包含这些，不应走 support）
  const negativeKeywords = [
    '压力', '焦虑', '抑郁', '难受', '崩溃', '睡不着', '失眠', '烦',
    '痛苦', '想死', '不想活', '自杀', '伤害自己', '绝望', '撑不住',
    '想消失', '活不下去', '想轻生', '困扰', '问题', '困难', '麻烦',
    '担心', '害怕', '恐惧', '紧张', '不安', '忧虑', '想辞职',
    '脑子停不下来', '停不下来', '停不了'
  ];

  // 计算正向置信度
  const positiveScore = positiveKeywords.filter(keyword => message.includes(keyword)).length;
  const hasNegativeSignal = negativeKeywords.some(keyword => message.includes(keyword));

  // 检查是否包含求助/困扰诉求（转折词或求助词）
  const hasContrast = /但是|不过|虽然|尽管|可是|然而/.test(message);
  // 更精确的求助词匹配，避免误判"你好"、"怎么啦"等正常对话
  const hasHelpRequest = /帮帮我|求助|需要建议|需要方法|怎么办|如何解决|如何缓解|怎么调整|怎么改善/.test(message);

  // 正向判断：正向置信度 >= 1 且无负向信号且无求助诉求且非危机
  const isPositiveStrong = positiveScore >= 1;
  const isSupportPositive = isPositiveStrong && !hasNegativeSignal && !hasContrast && !hasHelpRequest;

  if (isSupportPositive) {
    return {
      isCrisis: false,
      isSupportPositive: true,
      isSupportUserWantsVenting: false,
      shouldAssessment: false,
    };
  }

  // 4. 剩余情况走 assessment（使用 shouldEnterAssessment 判断）
  const shouldAssessment = shouldEnterAssessment(userMessage, emotion);

  return {
    isCrisis: false,
    isSupportPositive: false,
    isSupportUserWantsVenting: false,
    shouldAssessment,
  };
}

/**
 * 根据用户消息判断路由类型
 * @param userMessage 用户消息内容
 * @param emotion 情绪分析结果（可选）
 * @returns 路由类型
 */
function determineRouteType(userMessage: string, emotion?: { label: string; score: number }): RouteType {
  const intent = classifyIntent(userMessage, emotion);

  // 优先级：crisis > support(positive|venting) > assessment
  if (intent.isCrisis) {
    return 'crisis';
  }

  if (intent.isSupportPositive || intent.isSupportUserWantsVenting) {
    return 'support';
  }

  if (intent.shouldAssessment) {
    return 'assessment';
  }

  // 默认走 support
  return 'support';
}

/**
 * 推断 assessmentStage
 */
function inferAssessmentStage(
  state: ChatState | undefined,
  assessmentStage: AssessmentStage | undefined,
  routeType: RouteType
): AssessmentStage {
  // 如果明确指定了 assessmentStage，使用它
  if (assessmentStage) {
    return assessmentStage;
  }

  // 根据 state 和 routeType 推断
  if (routeType === 'assessment') {
    if (state === 'awaiting_followup') {
      // 需要进一步判断是 gap_followup 还是 conclusion
      // 这里先返回 'gap_followup'，实际会在后续逻辑中根据 gap 检测结果决定
      return 'gap_followup'; // 临时值，会在后续逻辑中更新
    }
    return 'intake';
  }

  return 'conclusion'; // 默认值
}

export async function POST(request: NextRequest) {
  try {
    const body: ChatRequest = await request.json();
    const { message, history = [], state, meta, assessmentStage: requestedStage } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json(
        { error: '消息内容不能为空' },
        { status: 400 }
      );
    }

    // Initialize StreamData
    const data = new StreamData();

    // 每次请求都先基于最新 user message 重新判定 routeType
    // 优先级：crisis > support > assessment
    // 先分析 emotion（如果需要用于路由判断）
    const emotion = await analyzeEmotion(message);
    let routeType = determineRouteType(message, emotion ? {
      label: emotion.label,
      score: emotion.score,
    } : undefined);

    // 处理 crisis 持续状态
    if (state === 'in_crisis') {
      // 检查意图，看是否可以解除危机
      // 这里我们稍微放宽一点：如果 intent.isCrisis 为 false 且 (supportPositive 或 venting 或 包含了明确的安全声明)
      // 但为了安全，我们还是倾向于使用 LLM 来判断，或者简单地只要没有强烈的危机信号且有正向信号就尝试降级
      // 暂时策略：只要在 crisis 状态，除非用户明确说"我没事了"，否则继续保持 crisis
      // 为了简化，我们只检查是否是显式的 crisis。如果是隐晦的，或者是其他，我们继续 crisis followup

      const isExplicitSafety = /我没事了|感觉好多了|已经不处在危险中了|放心吧/.test(message);

      if (isExplicitSafety) {
        // 用户明确表示安全，降级为 support
        data.append({
          timestamp: new Date().toISOString(),
          routeType: 'support',
          state: 'normal',
          emotion: null,
        });
        const result = await streamSupportReply(message, history);
        data.close();
        return result.toDataStreamResponse({ data });
      }

      // 否则，继续保持 crisis 状态
      data.append({
        timestamp: new Date().toISOString(),
        routeType: 'crisis',
        state: 'in_crisis', // 保持状态
        emotion: emotion ? { label: emotion.label, score: emotion.score } : null,
      });

      // 调用 crisis reply，传入 isFollowup=true
      const result = await streamCrisisReply(message, history, true);
      data.close();
      return result.toDataStreamResponse({ data });
    }

    // 处理 followup 状态：允许路由切换（包括正向场景抢走）
    if (state === 'awaiting_followup') {
      // 获取 initialMessage：优先使用 meta.initialMessage，否则从 history 中提取
      const initialMessage = meta?.initialMessage || extractInitialMessageFromHistory(history) || message;

      // 组合所有 followup 回答（从 history 中提取所有用户回答）
      const allFollowupAnswers: string[] = [];
      // 当前消息是新的回答
      allFollowupAnswers.push(message);
      // 从 history 中提取之前的用户回答（跳过 assistant 回复）
      for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role === 'user') {
          allFollowupAnswers.unshift(history[i].content);
        }
      }
      const combinedFollowupAnswer = allFollowupAnswers.join(' ');

      // 重新分析 combinedFollowupAnswer 的 emotion（用于路由判断）
      const followupEmotion = await analyzeEmotion(combinedFollowupAnswer);

      // 使用 classifyIntent 判断意图（允许正向场景抢走）
      const intent = classifyIntent(combinedFollowupAnswer, followupEmotion ? {
        label: followupEmotion.label,
        score: followupEmotion.score,
      } : undefined);

      // 重新判断 routeType（基于组合后的回答和 emotion）
      routeType = determineRouteType(combinedFollowupAnswer, followupEmotion ? {
        label: followupEmotion.label,
        score: followupEmotion.score,
      } : undefined);

      // 检查最新消息是否触发 crisis（优先于 support）
      if (intent.isCrisis || isHighRiskFollowupAnswer(combinedFollowupAnswer)) {
        // 高风险：升级为 crisis
        routeType = 'crisis';

        // Append data
        data.append({
          timestamp: new Date().toISOString(),
          routeType,
          state: 'in_crisis',
          assessmentStage: 'conclusion',
        });

        // Stream the crisis reply
        const result = await streamCrisisReply(message, history);
        data.close(); // Close StreamData before returning
        return result.toDataStreamResponse({ data });
      }

      // 检查最新消息是否触发 support（包括正向场景）
      if (intent.isSupportPositive || intent.isSupportUserWantsVenting || routeType === 'support') {
        // 切换到 support：强制 state = normal、清理 assessmentStage

        data.append({
          timestamp: new Date().toISOString(),
          routeType: 'support',
          state: 'normal',
          emotion: followupEmotion ? {
            label: followupEmotion.label,
            score: followupEmotion.score,
          } : null,
        });

        const result = await streamSupportReply(message, history);
        data.close(); // Close StreamData before returning
        return result.toDataStreamResponse({ data });
      }

      // 否则继续走 assessment 流：先做 gap 检测（使用组合后的所有回答）
      const gapResult = detectGap(initialMessage, combinedFollowupAnswer);

      // 更新 followup 槽位状态
      const currentFollowupSlot = meta?.followupSlot;
      const lastFollowupSlot = currentFollowupSlot?.lastFollowupSlot;
      const updatedFollowupSlot = updateFollowupSlotState(combinedFollowupAnswer, currentFollowupSlot, lastFollowupSlot);

      // 修复D: 检查是否应该进入 conclusion
      // 条件1: followupSlot槽位都完成了 (riskLevel + impactScore)
      // 条件2: 压力场景收集到最小闭环信息 (场景+想法+影响分数)
      const hasPressureMinInfo = gapResult.intake?.context && gapResult.intake?.mainIssue;
      const hasImpactScore = updatedFollowupSlot.impactScore !== undefined;
      const shouldEnterConclusion = updatedFollowupSlot.done || (hasPressureMinInfo && hasImpactScore);

      if (shouldEnterConclusion) {
        // 槽位收集完整，进入 conclusion
        const conclusionResult = await generateAssessmentConclusion(initialMessage, combinedFollowupAnswer, history);

        data.append({
          timestamp: new Date().toISOString(),
          routeType: 'assessment',
          state: 'normal',
          assessmentStage: 'conclusion',
          actionCards: conclusionResult.actionCards,
          ...(conclusionResult.gate && { gate: conclusionResult.gate }),
          ...(process.env.DEBUG_PROMPTS === '1' && conclusionResult.debugPrompts && { debugPrompts: conclusionResult.debugPrompts }),
          ...(process.env.NODE_ENV === 'development' && (conclusionResult as any).perf && { perf: (conclusionResult as any).perf }),
        });

        // Manual stream for fixed string content (from blocking function)
        return createFixedStreamResponse(conclusionResult.reply, data);
      }

      if (gapResult.hasGap) {
        // 有缺口：返回 gap_followup
        // 更新压力槽位状态（Phase 1: 只基于当前消息，不使用累计文本）
        const currentPressureSocratic = meta?.pressureSocratic;
        const updatedPressureSocratic = updatePressureSocraticState(message, currentPressureSocratic);

        // Phase 1 Fix: 更新 existingIntake，合并用户回答中的槽位信息
        // 这确保了单一事实来源 (Single Source of Truth)
        const updatedIntake = {
          ...gapResult.intake,
          // 如果 Socratic 场景槽位已填，更新 context
          ...(updatedPressureSocratic.situationDone && !gapResult.intake.context && {
            context: message,
          }),
          // 如果 Socratic 想法槽位已填，更新 mainIssue
          ...(updatedPressureSocratic.thoughtDone && !gapResult.intake.mainIssue && {
            mainIssue: message,
          }),
        };

        // 优先使用苏格拉底式提问策略
        const policyQuestions = buildGapFollowupQuestion({
          userMessage: message,  // Phase 1 Fix: 传入单次消息，不使用累计文本
          routeType: 'assessment',
          emotion: followupEmotion ? {
            label: followupEmotion.label,
            score: followupEmotion.score,
          } : undefined,
          riskLevel: updatedIntake.riskLevel,
          existingIntake: updatedIntake,  // Phase 1 Fix: 使用更新后的 intake
          pressureSocratic: updatedPressureSocratic,
          followupSlot: updatedFollowupSlot,  // 传入更新后的槽位状态
        }, gapResult.gapKey);

        // 处理返回的问题（可能是数组或 null）
        const questions = policyQuestions
          ? (Array.isArray(policyQuestions) ? policyQuestions : [policyQuestions])
          : [gapResult.question];

        // Guard：确保最多 2 个问题，且过滤掉空问题
        const finalQuestions = questions.filter(q => q && q.trim().length > 0).slice(0, 2);

        // 修复：如果问题列表为空，直接进入 conclusion（不应该发生，但作为兜底）
        if (finalQuestions.length === 0) {
          const conclusionResult = await generateAssessmentConclusion(initialMessage, combinedFollowupAnswer, history);

          const response: ChatResponse = {
            reply: conclusionResult.reply,
            timestamp: new Date().toISOString(),
            routeType: 'assessment',
            state: 'normal',
            assessmentStage: 'conclusion',
            actionCards: conclusionResult.actionCards,
            ...(conclusionResult.gate && { gate: conclusionResult.gate }),
            ...(process.env.DEBUG_PROMPTS === '1' && conclusionResult.debugPrompts && { debugPrompts: conclusionResult.debugPrompts }),
            ...(process.env.NODE_ENV === 'development' && (conclusionResult as any).perf && { perf: (conclusionResult as any).perf }),
          };

          return NextResponse.json(response);
        }

        // 检查是否包含苏格拉底问题（需要在生成 reply 之前判断）
        const hasSocraticQuestion = finalQuestions.some(q =>
          q.includes('具体场景') ||
          q.includes('发生了什么') ||
          q.includes('想法') ||
          q.includes('担心')
        );

        // 修复：禁止输出空壳文案
        // reply 只保留短引导，不包含问题正文（问题放在 assistantQuestions 中）
        let reply = '';
        if (finalQuestions.length > 0) {
          // 根据问题类型生成不同的引导语
          if (hasSocraticQuestion) {
            // 苏格拉底式问题：使用更自然的引导
            reply = '我想更准确地帮你，补充一个小问题：';
          } else {
            // 其他问题：简短引导
            // 修复：不要输出"我想再确认两个小问题"这种空壳句，确保后续真的列出问题
            if (finalQuestions.length > 1) {
              reply = '我想再确认两个小问题：';
            } else if (finalQuestions.length === 1) {
              reply = '我想再确认一个小问题：';
            }
          }
        }

        // 开发环境调试打印
        if (process.env.NODE_ENV === 'development') {
          console.log('[DEBUG] gap_followup 阶段返回字段:');
          console.log('  reply:', reply);
          console.log('  assistantQuestions:', finalQuestions);
          console.log('  reply 长度:', reply.length);
          console.log('  questions 数量:', finalQuestions.length);
          console.log('  hasSocraticQuestion:', hasSocraticQuestion);
        }

        // 保存本轮问题文本，用于防重复
        const lastQuestionText = finalQuestions.length > 0 ? finalQuestions[0] : undefined;

        const finalPressureSocratic: PressureSocraticState = {
          ...updatedPressureSocratic,
          asked: updatedPressureSocratic.asked || hasSocraticQuestion,
          lastQuestionText,
        };

        // 更新 followupSlot 的 lastFollowupSlot（根据问题类型判断）
        let nextFollowupSlot: 'risk' | 'impact' | undefined;
        if (finalQuestions.some(q => q.includes('伤害自己') || q.includes('自伤'))) {
          nextFollowupSlot = 'risk';
        } else if (finalQuestions.some(q => q.includes('0-10') || q.includes('打分') || q.includes('评分'))) {
          nextFollowupSlot = 'impact';
        }

        const finalFollowupSlot: FollowupSlotState = {
          ...updatedFollowupSlot,
          lastFollowupSlot: nextFollowupSlot || updatedFollowupSlot.lastFollowupSlot,
        };

        // 构建 debug 信息（如果启用）
        const debugInfo: any = {};
        if (process.env.DEBUG_PROMPTS === '1') {
          debugInfo.debugPrompts = {
            routeType: 'assessment',
            assessmentStage: 'gap_followup',
            pressureSocratic: finalPressureSocratic,
            slots: {
              situation: updatedPressureSocratic.situationDone,
              thought: updatedPressureSocratic.thoughtDone,
              onlyEmotion: false, // 可以从 inferSocraticSlots 获取
            },
            questionType: hasSocraticQuestion ? 'socratic' : (finalQuestions.some(q => q.includes('0-10')) ? 'scale' : 'other'),
          };
        }

        data.append({
          timestamp: new Date().toISOString(),
          routeType: 'assessment',
          state: 'awaiting_followup',
          assessmentStage: 'gap_followup',
          assistantQuestions: finalQuestions,
          meta: {
            pressureSocratic: finalPressureSocratic,
            followupSlot: finalFollowupSlot,
          },
          ...debugInfo,
        });

        return createFixedStreamResponse(reply, data);
      }

      // 无缺口：生成评估结论（使用组合后的所有回答）
      const conclusionResult = await generateAssessmentConclusion(initialMessage, combinedFollowupAnswer, history);

      data.append({
        timestamp: new Date().toISOString(),
        routeType: 'assessment',
        state: 'normal',
        assessmentStage: 'conclusion',
        actionCards: conclusionResult.actionCards,
        ...(conclusionResult.gate && { gate: conclusionResult.gate }),
        ...(process.env.DEBUG_PROMPTS === '1' && conclusionResult.debugPrompts && { debugPrompts: conclusionResult.debugPrompts }),
        ...(process.env.NODE_ENV === 'development' && (conclusionResult as any).perf && { perf: (conclusionResult as any).perf }),
      });

      return createFixedStreamResponse(conclusionResult.reply, data);
    }

    // 非 followup 状态：routeType 已在上面声明，直接使用

    // 处理 crisis 路由：立即返回危机响应，不进行评估
    if (routeType === 'crisis') {
      console.log('[DEBUG] Initial message crisis route triggered');
      data.append({
        timestamp: new Date().toISOString(),
        routeType: 'crisis',
        state: 'in_crisis',
        emotion: emotion ? { label: emotion.label, score: emotion.score } : null,
      });

      const result = await streamCrisisReply(message, history);
      data.close();
      return result.toDataStreamResponse({ data });
    }

    // 处理 assessment 路由的第一阶段逻辑
    if (routeType === 'assessment') {
      // 第一阶段（intake）：优先使用苏格拉底式提问策略
      // 更新压力槽位状态
      const currentPressureSocratic = meta?.pressureSocratic;
      const updatedPressureSocratic = updatePressureSocraticState(message, currentPressureSocratic);

      // 如果 policy 返回问题，使用 policy；否则使用原逻辑
      // 使用之前已经分析好的 emotion
      const policyQuestions = buildIntakeQuestions({
        userMessage: message,
        routeType,
        emotion: emotion ? {
          label: emotion.label,
          score: emotion.score,
        } : undefined,
        pressureSocratic: updatedPressureSocratic,
      });

      const questions = policyQuestions.length > 0
        ? policyQuestions
        : generateAdaptiveAssessmentQuestions(message, emotion ? {
          label: emotion.label,
          score: emotion.score,
        } : undefined);

      // 如果输出了苏格拉底问题，更新 asked 状态
      const hasSocraticQuestion = questions.some(q =>
        q.includes('具体场景') ||
        q.includes('发生了什么') ||
        q.includes('想法') ||
        q.includes('担心')
      );

      // 保存本轮问题文本，用于防重复
      const lastQuestionText = questions.length > 0 ? questions[0] : undefined;

      const finalPressureSocratic: PressureSocraticState = {
        ...updatedPressureSocratic,
        asked: updatedPressureSocratic.asked || hasSocraticQuestion,
        lastQuestionText,
      };

      // 修复：reply 只保留短引导，不包含问题正文（问题放在 assistantQuestions 中）
      // 根据问题类型生成不同的引导语
      let reply = '';
      if (hasSocraticQuestion) {
        // 苏格拉底式问题：使用更自然的引导
        reply = '我想先理解清楚你的情况，我们从一个具体时刻开始。';
      } else if (questions.length === 1) {
        // 单个问题：简短引导
        reply = '为了更好地了解你的情况，请回答：';
      } else {
        // 多个问题：简短引导
        reply = '为了更好地了解你的情况，请回答以下问题：';
      }

      // 构建 debug 信息（如果启用）
      const debugInfo: any = {};

      if (process.env.DEBUG_PROMPTS === '1') {
        debugInfo.debugPrompts = {
          routeType: 'assessment',
          assessmentStage: 'intake',
          pressureSocratic: finalPressureSocratic,
          slots: {
            situation: updatedPressureSocratic.situationDone,
            thought: updatedPressureSocratic.thoughtDone,
            onlyEmotion: false,
          },
          questionType: hasSocraticQuestion ? 'socratic' : 'other',
        };
      }

      data.append({
        timestamp: new Date().toISOString(),
        routeType: 'assessment',
        state: 'awaiting_followup',
        assessmentStage: 'intake',
        assistantQuestions: questions,
        meta: {
          pressureSocratic: finalPressureSocratic,
        },
        ...debugInfo,
      });

      return createFixedStreamResponse(reply, data);
    }

    // Default fallback to support
    data.append({
      timestamp: new Date().toISOString(),
      routeType: 'support',
      state: 'normal',
      emotion: emotion ? { label: emotion.label, score: emotion.score } : null,
    });

    const result = await streamSupportReply(message, history);
    data.close(); // Close StreamData before returning
    return result.toDataStreamResponse({ data });

  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json(
      { error: error.message || 'Error processing request', details: error.toString() },
      { status: 500 }
    );
  }
}

/**
 * Helper to create a stream response for fixed string content
 * Emulates the Vercel AI SDK protocol: 0:"text", d:{"data"}
 */
function createFixedStreamResponse(content: string, data: StreamData): NextResponse {
  // Create a readable stream that pushes the content and then the data
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // Push text content (Protocol: 0:"content")
      // We wrap it in quotes and escaping is needed for JSON validity if we were strict,
      // but AI SDK protocol is 0:string_content\n
      // Actually strictly it is 0:"quoted string"\n
      controller.enqueue(encoder.encode(`0:${JSON.stringify(content)}\n`));

      // Close data to finalize it and get the stream
      data.close();

      // Consume data stream and pipe to controller
      const reader = data.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          // data stream already formatted as d:{...}\n
          controller.enqueue(value);
        }
      } catch (e) {
        console.error('Error reading data stream', e);
      }

      controller.close();
    }
  });

  return new NextResponse(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'X-Vercel-AI-Data-Stream': 'v1',
    },
  });
}





