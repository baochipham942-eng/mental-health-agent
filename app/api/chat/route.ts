import { NextRequest, NextResponse } from 'next/server';
import { generateCounselingReply } from '@/lib/ai/deepseek';
import { analyzeEmotion } from '@/lib/ai/emotion';
import { generateCrisisReply } from '@/lib/ai/crisis';
import { generateSupportReply } from '@/lib/ai/support';
import { generateAssessmentQuestions } from '@/lib/ai/assessment';
import { generateAssessmentConclusion } from '@/lib/ai/assessment/conclusion';
import { detectGap } from '@/lib/ai/assessment/gap';
import { ChatRequest, ChatResponse, RouteType, AssessmentStage, ChatState } from '@/types/chat';

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
  
  // 检查风险相关表达（明确的风险表达）
  const riskKeywords = [
    '想死', '不想活', '自杀', '结束生命', '割腕', '跳楼',
    '上吊', '服药', '吃药', '结束一切', '不想活了'
  ];
  const hasRisk = riskKeywords.some(keyword => message.includes(keyword));
  
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
  };
}

/**
 * 生成自适应的评估问题（1-2个）
 */
function generateAdaptiveAssessmentQuestions(userMessage: string): string[] {
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
  
  // 风险问题仅在特定情况下加入
  // 条件：用户首句出现明显抑郁/绝望表达，或者严重程度很高
  const shouldAskRisk = (info.hasRisk || info.hasHighSeverity) && questions.length < 2;
  
  if (shouldAskRisk) {
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
 * 根据用户消息判断路由类型
 * @param userMessage 用户消息内容
 * @returns 路由类型
 */
function determineRouteType(userMessage: string): RouteType {
  const message = userMessage.toLowerCase().trim();

  // 判断是否为 support 类型：用户明确说只想倾诉/不要建议/不要分析
  const supportKeywords = [
    '只想倾诉',
    '不要建议',
    '不要分析',
    '不需要建议',
    '不需要分析',
    '只要倾诉',
    '只想说说',
    '只想聊聊',
    '不要给建议',
    '不要给分析',
    '不需要给建议',
    '不需要给分析'
  ];
  
  if (supportKeywords.some(keyword => message.includes(keyword))) {
    return 'support';
  }

  // 判断是否为 crisis 类型：包含明显自伤/准备方式/告别等关键词
  // 注意：已移除"自残"、"自伤"、"伤害自己"等易误判的泛词
  const crisisKeywords = [
    '准备好了方式',
    '不想活了',
    '自杀',
    '割腕',
    '跳楼',
    '跳河',
    '上吊',
    '服药',
    '吃药',
    '结束生命',
    '结束自己',
    '告别',
    '永别',
    '再见',
    '再也不见',
    '离开这个世界',
    '离开世界',
    '不想活',
    '活不下去了',
    '活不下去',
    '死了算了',
    '想死',
    '去死',
    '结束一切',
    '结束所有',
    '准备好了',
    '准备好了方法',
    '准备好了办法'
  ];

  if (crisisKeywords.some(keyword => message.includes(keyword))) {
    return 'crisis';
  }

  // 默认为 assessment 类型
  return 'assessment';
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

    // 处理 followup 状态：不调用 determineRouteType，强制设为 assessment
    // 仅在明确高风险时才升级为 crisis
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
      
      // 检查 followupAnswer 是否包含明确的高风险表达
      let routeType: RouteType = 'assessment';
      
      if (isHighRiskFollowupAnswer(combinedFollowupAnswer)) {
        // 高风险：升级为 crisis
        routeType = 'crisis';
        const reply = await generateCrisisReply(message, history);
        
        const response: ChatResponse = {
          reply,
          timestamp: new Date().toISOString(),
          routeType,
          state: 'normal',
          assessmentStage: 'conclusion',
        };
        
        return NextResponse.json(response);
      }
      
      // 正常情况：先做 gap 检测（使用组合后的所有回答）
      const gapResult = detectGap(initialMessage, combinedFollowupAnswer);
      
      if (gapResult.hasGap) {
        // 有缺口：返回 gap_followup
        const reply = `为了更好地了解你的情况，请回答：\n\n${gapResult.question}`;
        
        const response: ChatResponse = {
          reply,
          timestamp: new Date().toISOString(),
          routeType: 'assessment',
          state: 'awaiting_followup',
          assessmentStage: 'gap_followup',
          assistantQuestions: [gapResult.question],
        };
        
        return NextResponse.json(response);
      }
      
      // 无缺口：生成评估结论（使用组合后的所有回答）
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
        // 仅在 dev 环境传递 perf 数据
        ...(process.env.NODE_ENV === 'development' && (conclusionResult as any).perf && { perf: (conclusionResult as any).perf }),
      };
      
      return NextResponse.json(response);
    }

    // 非 followup 状态：正常判断路由类型
    const routeType = determineRouteType(message);

    // 处理 assessment 路由的第一阶段逻辑
    if (routeType === 'assessment') {
      // 第一阶段（intake）：生成自适应的 1-2 个问题
      const questions = generateAdaptiveAssessmentQuestions(message);
      
      // 生成简短的引导语 + 问题（引导语不超过 160 字，不含问题）
      let reply = '为了更好地了解你的情况，请回答以下问题：\n\n';
      questions.forEach((q, idx) => {
        reply += `${idx + 1}. ${q}\n`;
      });
      reply = reply.trim();

      // 并行执行情绪分析（可选）
      const emotion = await analyzeEmotion(message);

      const response: ChatResponse = {
        reply,
        emotion: emotion ? {
          label: emotion.label,
          score: emotion.score,
        } : undefined,
        timestamp: new Date().toISOString(),
        routeType,
        state: 'awaiting_followup',
        assessmentStage: 'intake',
        assistantQuestions: questions,
      };

      return NextResponse.json(response);
    }

    // 其他路由类型的处理（crisis, support, default）
    let replyPromise: Promise<string>;
    switch (routeType) {
      case 'crisis':
        // 危机干预：不调用 generateCounselingReply，调用 generateCrisisReply
        replyPromise = generateCrisisReply(message, history);
        break;
      case 'support':
        // 支持性倾听：调用 generateSupportReply
        replyPromise = generateSupportReply(message, history);
        break;
      default:
        // 默认使用原来的心理咨询回复
        replyPromise = generateCounselingReply(message, history);
    }

    // 并行执行情绪分析和对话生成
    const [emotion, reply] = await Promise.all([
      analyzeEmotion(message),
      replyPromise,
    ]);

    const response: ChatResponse = {
      reply,
      emotion: emotion ? {
        label: emotion.label,
        score: emotion.score,
      } : undefined,
      timestamp: new Date().toISOString(),
      routeType,
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




