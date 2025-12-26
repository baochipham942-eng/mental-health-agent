import { NextRequest, NextResponse } from 'next/server';
import { StreamData } from 'ai';
import { auth } from '@/auth'; // Adjust path if needed
import { prisma } from '@/lib/db/prisma';
import { quickAnalyze } from '@/lib/ai/groq';
import { streamCrisisReply } from '@/lib/ai/crisis';
import { streamSupportReply } from '@/lib/ai/support';
import { continueAssessment, streamAssessmentReply } from '@/lib/ai/assessment';
import { deepseek, streamEFTValidationReply } from '@/lib/ai/deepseek'; // Updated import
import { streamAssessmentConclusion } from '@/lib/ai/assessment/conclusion';
import { generateSFBTQuery } from '@/lib/ai/sfbt'; // SFBT logic
import { quickCrisisKeywordCheck } from '@/lib/ai/crisis-classifier';
import { ChatRequest, RouteType } from '@/types/chat';
import { memoryManager } from '@/lib/memory';
import { guardInput, getBlockedResponse } from '@/lib/ai/guardrails';
import { logInfo, logWarn, logError } from '@/lib/observability/logger';
import { analyzeRiskSignals, calculateTurn, inferPhase, shouldTriggerSafetyCheck } from '@/lib/ai/dialogue';
import { generateSummary, shouldSummarize, updateConversationSummary } from '@/lib/memory/summarizer';
import { analyzeConversationForStuckLoop, createStuckLoopEvent } from '@/lib/ai/detection/stuck-loop';
import { ChatService } from '@/lib/services/chat-service';

/**
 * Helper to create a stream response for fixed string content
 * Emulates the Vercel AI SDK protocol: 0:"text"\nd:{...}\n
 */
function createFixedStreamResponse(content: string, data: StreamData): NextResponse {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(`0:${JSON.stringify(content)}\n`));
      data.close();
      const reader = data.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
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

// =================================================================================
// 预设技能卡配置 - 用于直接技能请求的快速响应
// =================================================================================
// Export for testing
export const SKILL_CARDS = {
  breathing: {
    title: '4-7-8呼吸法',
    when: '思绪纷乱或焦虑时',
    effort: 'low' as const,
    widget: 'breathing',
    steps: [
      '找一个舒适的姿势坐好',
      '用鼻子吸气4秒',
      '屏住呼吸7秒',
      '用嘴缓慢呼气8秒',
      '重复3-4次'
    ],
  },
  meditation: {
    title: '5分钟正念冥想',
    when: '需要放松或专注时',
    effort: 'low' as const,
    widget: 'meditation',
    steps: [
      '找一个安静的地方坐下',
      '闭上眼睛，专注呼吸',
      '注意身体的感受',
      '当思绪飘走时，温柔地拉回',
      '保持5分钟'
    ],
  },
  grounding: {
    title: '五感着陆',
    when: '感到焦虑或恐慌时',
    effort: 'low' as const,
    widget: undefined,
    steps: [
      '说出你能看到的5样东西',
      '说出你能摸到的4样东西',
      '说出你能听到的3种声音',
      '说出你能闻到的2种气味',
      '说出你能尝到的1种味道'
    ],
  },
  reframing: {
    title: '认知重构练习',
    when: '当下陷入消极念头时',
    effort: 'medium' as const,
    widget: undefined,
    steps: [
      '识别当下的消极念头',
      '寻找支持这个念头的证据',
      '寻找反驳这个念头的证据',
      '尝试提出一个更平衡、客观的视角',
    ],
  },
  activation: {
    title: '行为激活小任务',
    when: '感到动力不足或情绪低落时',
    effort: 'low' as const,
    widget: undefined,
    steps: [
      '选择一件可以在5分钟内完成的小事',
      '立即去做，不要纠结感受',
      '完成后给自己一个微小的正反馈',
    ],
  },
  empty_chair: {
    title: '空椅子对话练习',
    when: '有未解的心结或强烈委屈时',
    effort: 'high' as const,
    widget: 'empty_chair',
    steps: [
      '设定对面椅子上坐着的人',
      '尽情宣泄你的真实感受',
      '互换位置，体验对方的视角',
      '重新整合你的感受'
    ],
  },
  mood_tracker: {
    title: '情绪记录',
    when: '感觉很糟但不清楚原因时',
    effort: 'low' as const,
    widget: 'mood_tracker',
    steps: [
      '停下来，觉察当下的感受',
      '选择一个最贴切的情绪词',
      '评估情绪的强烈程度',
      '记录触发情绪的想法或事件'
    ],
  },
  leaves_stream: {
    title: '溪流落叶',
    when: '反复纠结、被念头困扰时',
    effort: 'low' as const,
    widget: 'leaves_stream',
    steps: [] // Widget handles logical steps
  }
};

export type SkillType = keyof typeof SKILL_CARDS;

/**
 * 检测直接技能请求类型
 */
export function detectDirectSkillRequest(message: string): SkillType | null {
  const lowerMsg = message.toLowerCase();

  // 呼吸法
  if (/(进行|开始|我要|做个|练习|试试).*(呼吸|4.?7.?8|深呼吸)/.test(lowerMsg)) return 'breathing';
  // 冥想
  if (/(进行|开始|我要|做个|练习|试试).*(冥想|正念|静心)/.test(lowerMsg)) return 'meditation';
  // 着陆
  if (/(进行|开始|我要|做个|练习|试试).*(着陆|5.?4.?3.?2.?1)/.test(lowerMsg)) return 'grounding';
  // 重构
  if (/(进行|开始|我要|做个|练习|试试).*(认知重构|想法挑战)/.test(lowerMsg)) return 'reframing';
  // 行为激活
  if (/(进行|开始|我要|做个|练习|试试).*(行为激活|行动任务)/.test(lowerMsg)) return 'activation';
  // 空椅子
  if (/(进行|开始|我要|做个|练习|试试).*(空椅子|对话练习)/.test(lowerMsg)) return 'empty_chair';
  // 情绪记录 - 必须带有"记录"或"打卡"等动作词
  if (/(进行|开始|我要|做个|练习|打卡|试试).*(情绪记录|记录心情|心情记录|心情打卡)/.test(lowerMsg)) return 'mood_tracker';
  // 脱钩
  if (/(进行|开始|我要|做个|练习|试试).*(想法脱钩|溪流落叶|落叶练习)/.test(lowerMsg)) return 'leaves_stream';

  // 极度具体的指令
  if (/^4.?7.?8$/.test(lowerMsg)) return 'breathing';
  if (/^5.?4.?3.?2.?1$/.test(lowerMsg)) return 'grounding';

  return null;
}

/**
 * 创建带技能卡的快速流式响应（跳过 DeepSeek）
 */
function createSkillCardStreamResponse(
  skillType: SkillType,
  data: StreamData,
  metadata: Record<string, any>
): NextResponse {
  const skill = SKILL_CARDS[skillType];
  const introMessages: Record<SkillType, string> = {
    breathing: '没问题，我们一起来关注呼吸，这能帮你快速平静下来。请准备好，随节奏开始：',
    meditation: '好的，找一个不受打扰的空间，让我们通过冥想找回内心的宁静。点击开始：',
    grounding: '没关系，我们先试着回到当下。请跟着这个着陆练习的指引，一步步来：',
    reframing: '当念头让你感到困扰时，换个视角或许会有新发现。试试这个认知重构练习：',
    activation: '如果感到没动力，我们先通过一个小小的行动来打破僵局。请看下面的任务卡片：',
    empty_chair: '有些话憋在心里一定很难受吧。在“空椅子”面前，你可以放心地抒发出来。准备好了吗？',
    mood_tracker: '记录和觉察是愈合的开始。我一直在这里陪着你，先来记录下你此刻最真实的感觉吧：',
    leaves_stream: '感觉思绪乱糟糟的时候，试着把它们看作溪流上的落叶。让我们开始这个练习：',
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      // 1. 先输出简短文字
      const intro = introMessages[skillType];
      controller.enqueue(encoder.encode(`0:${JSON.stringify(intro)}\n`));

      // 2. 添加元数据（包含 actionCards）
      data.append({
        ...metadata,
        routeType: 'support',
        actionCards: [skill],
        fastSkillResponse: true,
      } as any);

      data.close();
      const reader = data.stream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
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


export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let finalSessionId: string | undefined;
  let finalUserId: string | undefined;
  let routeType: RouteType = 'support';
  const data = new StreamData();

  try {
    const body: ChatRequest = await request.json();
    const { message, history = [], state, assessmentStage, meta } = body;
    // data is already declared outside or at the start of POST.
    // Actually, I'll declare it here inside the try block to ensure it's available for all catch/finally.

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: '消息内容不能为空' }, { status: 400 });
    }

    // =================================================================================
    // 0.0.5 FAST SKILL CARD PATH - 极速路径，跳过所有 LLM 调用
    // =================================================================================
    const directSkillType = detectDirectSkillRequest(message);
    if (directSkillType) {
      console.log('[API] FAST PATH: Direct skill request detected, bypassing all LLM calls:', directSkillType);
      const skill = SKILL_CARDS[directSkillType];
      const introMessages: Record<SkillType, string> = {
        breathing: '没问题，我们一起来关注呼吸，这能帮你快速平静下来。请准备好，随节奏开始：',
        meditation: '好的，找一个不受打扰的空间，让我们通过冥想找回内心的宁静。点击开始：',
        grounding: '没关系，我们先试着回到当下。请跟着这个着陆练习的指引，一步步来：',
        reframing: '当念头让你感到困扰时，换个视角或许会有新发现。试试这个认知重构练习：',
        activation: '如果感到没动力，我们先通过一个小小的行动来打破僵局。请看下面的任务卡片：',
        empty_chair: '有些话憋在心里一定很难受吧。在“空椅子”面前，你可以放心地抒发出来。准备好了吗？',
        mood_tracker: '记录和觉察是愈合的开始。我一直在这里陪着你，先来记录下你此刻最真实的感觉吧：',
        leaves_stream: '感觉思绪乱糟糟的时候，试着把它们看作溪流上的落叶。让我们开始这个练习：',
      };

      // 异步保存消息（不阻塞）
      if (body.sessionId) {
        ChatService.saveAssistantMessage(body.sessionId, introMessages[directSkillType], {
          routeType: 'support', actionCards: [skill], fastSkillResponse: true
        });
      }

      return createSkillCardStreamResponse(directSkillType, data, {
        timestamp: new Date().toISOString(),
        emotion: { label: 'neutral', score: 5 },
        safety: { label: 'normal', score: 0, reasoning: '检测到明确练习请求，正在为你开启极速引导' },
      });
    }

    // =================================================================================
    // 0.1 Input Guardrail - 输入安全检测
    // =================================================================================
    const inputGuard = guardInput(message);
    if (!inputGuard.safe) {
      logWarn('input-guard-blocked', { reason: inputGuard.reason });
      const data = new StreamData();
      data.append({
        timestamp: new Date().toISOString(),
        routeType: 'support',
        guardBlocked: inputGuard.reason || 'unknown'
      } as Record<string, string>);
      return createFixedStreamResponse(getBlockedResponse(inputGuard.reason), data);
    }

    // =================================================================================
    // 0.2 Persistence Setup
    // =================================================================================
    const session = await auth();
    finalSessionId = body.sessionId;
    finalUserId = session?.user?.id;
    const sessionId = finalSessionId;
    const userId = finalUserId;

    // Import helper dynamically or at top? Top is better but for this refactor we assume top import added.
    // We will add the import in a separate block or assume it's available.
    // Wait, I need to add the import first.

    logInfo('chat-request', {
      hasSession: !!session,
      userId,
      sessionId: body.sessionId,
      messageLen: message.length
    });

    // Save User Message - 异步执行，不阻塞响应
    if (sessionId && userId) {
      // Return promise to not block? The original code didn't await the IIFE.
      ChatService.saveUserMessage(sessionId, userId, message);
    }

    // Helper wrapper to match previous usage
    const saveAssistantMessage = async (content: string, meta?: Record<string, any>) => {
      if (sessionId) {
        await ChatService.saveAssistantMessage(sessionId, content, meta);
      }
    };

    // =================================================================================
    // 0.5 Memory Retrieval + Groq Analysis (并行执行，节省 ~300ms)
    // =================================================================================
    let memoryContext = '';
    let processedHistory = history;

    // 并行执行：Groq 分析 + 记忆检索
    // 传入最近2条历史记录作为上下文，帮助 Groq 判断意图（如回答评估问题 vs 切换话题）
    const recentContext = history.slice(-2);
    const groqPromise = quickAnalyze(message, recentContext);

    const memoryPromise = (userId && history.length > 0)
      ? (async () => {
        try {
          // Phase 3: Get full memory object including raw memories array
          return await memoryManager.getMemoriesForContext(userId, message);
        } catch (e) {
          console.error('[Memory] Failed:', e);
        }
        return { contextString: '', memories: [] };
      })()
      : Promise.resolve({ contextString: '', memories: [] });

    // 同时等待两个结果 (Groq 现在包含 safety reasoning)
    const [analysis, retrievalResult] = await Promise.all([groqPromise, memoryPromise]);

    // Check if retrievalResult is string (old return) or object
    if (typeof retrievalResult === 'string') {
      memoryContext = retrievalResult;
    } else if (retrievalResult && typeof retrievalResult === 'object') {
      memoryContext = retrievalResult.contextString || '';
      // Phase 3 Active Push: Inject relevant memories into data stream
      if (retrievalResult.memories?.length > 0) {
        data.append({
          timestamp: new Date().toISOString(),
          relevantMemories: retrievalResult.memories.map((m: any) => ({
            id: m.id,
            content: m.content,
            topic: m.topic,
            sourceConvId: m.sourceConvId
          }))
        } as any);
      }
    }

    // 构建统一的 safety 对象 (从 Groq 分析结果中提取)
    const safetyData = {
      label: analysis.safety,
      score: analysis.safety === 'crisis' ? 9 : analysis.safety === 'urgent' ? 6 : 1,
      reasoning: analysis.safetyReasoning,
    };

    // 构建对话状态对象
    const stateData = {
      reasoning: analysis.stateReasoning,
      route: analysis.route,
    };

    console.log('[Groq] Quick analysis result:', analysis);
    console.log('[Safety] Assessment:', safetyData);

    // 如果 Groq 检测到危机，强制切换到危机路由
    if (analysis.safety === 'crisis') {
      console.log('[API] Groq detected crisis, overriding route');
      routeType = 'crisis';
    }



    // 检查是否需要生成对话摘要 (放在并行之后，因为依赖 history)
    if (userId && sessionId && history.length > 0 && shouldSummarize(history.length)) {
      try {
        console.log('[Summarizer] History length exceeds threshold, generating summary...');
        const summary = await generateSummary(history);
        if (summary) {
          await updateConversationSummary(sessionId, summary);
          memoryContext += `\n\n### 对话背景摘要\n${summary}\n`;
          processedHistory = history.slice(-8);
          console.log('[Summarizer] Summary generated and history trimmed.');
        }
      } catch (e) {
        console.error('[Summarizer] Failed:', e);
      }
    }

    // =================================================================================
    // 0.55 User Context Injection - 将用户昵称注入上下文，让 AI 可以自然使用
    // =================================================================================
    const userNickname = session?.user?.nickname;
    if (userNickname) {
      memoryContext += `\n\n**用户信息**：用户昵称为「${userNickname}」。你可以在合适的时机（如开场问候、鼓励语句）使用这个昵称来增加亲切感，但不要每句都用，保持自然。`;
    }

    // const data = new StreamData(); // Moved up
    const traceMetadata = { sessionId, userId };

    const emotionObj = { label: analysis.emotion.label, score: analysis.emotion.score };
    routeType = analysis.route;

    // 后备：关键词检测危机（防止小模型漏检）
    if (routeType !== 'crisis' && quickCrisisKeywordCheck(message)) {
      console.log('[API] Crisis keyword detected, overriding route');
      routeType = 'crisis';
    }

    // 移除原有硬编码的关键词强制路由逻辑，改由 Groq 分析意图

    // =================================================================================
    // 0.6 Dialogue State Tracking - 对话状态追踪
    // =================================================================================
    const conversationTurn = calculateTurn(history);
    const riskSignals = analyzeRiskSignals(message);
    const dialoguePhase = inferPhase(conversationTurn, riskSignals.shouldTriggerSafetyAssessment);
    const safetyCheck = shouldTriggerSafetyCheck(riskSignals, conversationTurn, emotionObj?.score);

    logInfo('dialogue-state', {
      turn: conversationTurn,
      phase: dialoguePhase,
      riskLevel: riskSignals.level,
      triggeredSignals: riskSignals.triggeredSignals.slice(0, 3),
      shouldTriggerSafety: safetyCheck.shouldTrigger,
    });

    // Append analysis and dialogue metadata to stream
    data.append({
      timestamp: new Date().toISOString(),
      safety: safetyData,
      state: stateData, // 对话状态推理
      dialogue: {
        turn: conversationTurn,
        phase: dialoguePhase,
        riskLevel: riskSignals.level,
      },
    } as any);

    // Fix: Sticky Logic Removed
    // Previously we forced 'assessment' if state was 'awaiting_followup'.
    // Now we trust Groq's context-aware routing.
    // However, if the route IS 'assessment' and we are 'awaiting_followup', that's fine.
    // If Groq says 'support' but we are 'awaiting_followup' -> user likely changed topic -> We respect 'support'.


    // =================================================================================
    // 1. Crisis Handler (Highest Priority)
    // =================================================================================
    console.log('[API] Route decision:', { routeType, state, message: message.substring(0, 50) });
    if (state === 'in_crisis' || routeType === 'crisis') {
      // 退出机制：
      // 1. 显式的安全声明 (正则)
      // 2. Groq 安全分析也认为是 'normal' (双重确认)
      const isExplicitSafety = /我没事了|感觉好多了|已经不处在危险中了|放心吧|删除.*记忆|不聊了|换个话题/.test(message);
      const isAnalysedSafe = safetyData.label === 'normal';

      if (state === 'in_crisis' && (isExplicitSafety || isAnalysedSafe)) {
        console.log('[API] De-escalating crisis state based on validation:', { isExplicitSafety, isAnalysedSafe });
        // De-escalate
        data.append({ timestamp: new Date().toISOString(), routeType: 'support', state: 'normal', emotion: null });

        const onFinishWithMeta = async (text: string, toolCalls?: any[]) => {
          // Non-blocking save
          saveAssistantMessage(text, {
            toolCalls,
            safety: safetyData,
            state: stateData,
          }).catch(e => console.error('[DB] Failed to save assistant message:', e));

          // CRITICAL FIX: Ensure full reply is in the data stream final packet
          data.append({
            reply: text,
            toolCalls,
            safety: safetyData,
          } as any);
          data.close();
        };

        const result = await streamSupportReply(message, history, { onFinish: onFinishWithMeta, traceMetadata });
        return result.toDataStreamResponse({ data });
      }

      data.append({ timestamp: new Date().toISOString(), routeType: 'crisis', state: 'in_crisis', emotion: emotionObj });

      const onCrisisFinish = async (text: string, toolCalls?: any[]) => {
        // Non-blocking save
        saveAssistantMessage(text, {
          toolCalls,
          safety: safetyData,
          state: stateData,
        }).catch(e => console.error('[DB] Failed to save assistant message:', e));

        data.append({
          reply: text,
          toolCalls,
          safety: safetyData,
        } as any);
        data.close();
      }

      const result = await streamCrisisReply(message, history, state === 'in_crisis', { onFinish: onCrisisFinish, traceMetadata });
      return result.toDataStreamResponse({ data });
    }

    // =================================================================================
    // 1.5 EFT Validation Logic - (The "Heart" Phase)
    // 优先处理高情绪唤起 (非危机状态下)
    // =================================================================================
    if (analysis.needsValidation) {
      console.log('[API] EFT Validation triggered (High Emotion Score)');

      const onFinishWithMeta = async (text: string) => {
        // Non-blocking save
        saveAssistantMessage(text, {
          routeType: 'support',
          subRoute: 'eft_validation',
          safety: safetyData,
          state: stateData
        }).catch(e => console.error('[DB] Failed to save assistant message:', e));

        data.append({
          reply: text,
          routeType: 'support',
          safety: safetyData,
          isEFT: true
        } as any);
        data.close();
      };

      const result = await streamEFTValidationReply(message, processedHistory, {
        onFinish: onFinishWithMeta,
        traceMetadata
      });
      return result.toDataStreamResponse({ data });
    }

    // =================================================================================
    // 2. Support Handler (Positive / Venting / Neutral)
    // =================================================================================
    if (routeType === 'support') {
      // SFBT Logic Detection
      // SFBT Logic Detection
      let sfbtInstruction = undefined;
      // Match: "我完成了“五感着陆”练习，现在感觉：🙂 (4分)"
      // Matches the format sent by ActionCardItem
      const sfbtMatch = message.match(/我完成了“(.+)”练习，现在感觉：.*\((\d+)分\)/);
      if (sfbtMatch) {
        const [_, exerciseName, scoreStr] = sfbtMatch;
        const postScore = parseInt(scoreStr);
        // preScore is unknown, so we rely on absolute postScore logic
        sfbtInstruction = generateSFBTQuery({ postScore, exerciseName });
        logInfo('sfbt-trigger', { exerciseName, postScore });
      }

      // 移除手动注入 actionCards 的逻辑，改由 LLM 通过工具调用 (support.ts) 自主推荐，
      // 从而确保推荐前会有共情话术。
      data.append({
        timestamp: new Date().toISOString(),
        routeType: 'support',
        state: 'normal',
        emotion: emotionObj,
      });

      const onFinishWithMeta = async (text: string, toolCalls?: any[]) => {
        // Non-blocking save
        saveAssistantMessage(text, {
          toolCalls,
          safety: safetyData,
          state: stateData
        }).catch(e => console.error('[DB] Failed to save assistant message:', e));

        data.append({
          reply: text,
          toolCalls,
          safety: safetyData,
        } as any);
        data.close();
      };

      const result = await streamSupportReply(message, processedHistory, {
        onFinish: onFinishWithMeta,
        traceMetadata,
        memoryContext,
        systemInstructionInjection: sfbtInstruction
      });
      // data.close() moved to onFinish
      return result.toDataStreamResponse({ data });
    }

    // =================================================================================
    // 3. Assessment Handler (Intake Loop -> Conclusion)
    // =================================================================================
    if (routeType === 'assessment') {
      // 移除 assessment 路由下的硬编码技能快捷路径

      // Call Assessment Loop with State Classifier (Streaming Version)
      const onAssessmentFinish = async (text: string, toolCalls?: any[]) => {
        // Determine if it's a conclusion based on tool calls
        const isConclusion = toolCalls?.some(tc => tc.function.name === 'finish_assessment') || false;

        // Non-blocking save
        saveAssistantMessage(text, {
          toolCalls,
          routeType: 'assessment',
          assessmentStage: isConclusion ? 'conclusion' : 'intake',
          safety: safetyData,
          state: stateData,
        }).catch(e => console.error('[DB] Failed to save assistant message:', e));

        // 🔄 异步检测死循环（不阻塞响应）
        if (!isConclusion && sessionId) {
          analyzeConversationForStuckLoop(sessionId).then(result => {
            if (result?.isStuck) {
              createStuckLoopEvent(sessionId, result);
            }
          }).catch(err => console.error('[StuckLoop] Detection failed:', err));
        }

        data.append({
          reply: text,
          toolCalls,
          routeType: 'assessment',
          assessmentStage: isConclusion ? 'conclusion' : 'intake',
          safety: safetyData,
        } as any);
        data.close();
      };

      // 🔄 Special Case: If we are already in conclusion stage OR the classifier says we should conclude
      if (assessmentStage === 'conclusion') {
        const allUserMessages = history.filter(m => m.role === 'user').map(m => m.content);
        allUserMessages.push(message);
        const initialMsg = allUserMessages[0] || message;
        const followupStr = allUserMessages.slice(1).join('\n\n') || '（无补充回答）';

        const onConclusionFinish = async (text: string, actionCards: any[]) => {
          // Non-blocking save
          saveAssistantMessage(text, {
            routeType: 'assessment',
            assessmentStage: 'conclusion',
            actionCards,
          }).catch(e => console.error('[DB] Failed to save assistant message:', e));

          data.append({
            reply: text,
            actionCards,
            routeType: 'assessment',
            assessmentStage: 'conclusion',
            safety: safetyData,
          } as any);
          data.close();
        };

        const conclusionResult = await streamAssessmentConclusion(initialMsg, followupStr, history, {
          traceMetadata,
          onFinish: onConclusionFinish
        });
        return conclusionResult.toDataStreamResponse({ data });
      }

      const assessmentResult = await streamAssessmentReply(message, processedHistory, {
        traceMetadata,
        memoryContext,
        onFinish: onAssessmentFinish
      });

      // Check if conclusion is needed (Dynamic)
      // Note: True streaming assessment means we might need to handle conclusion transition 
      // differently if we want to stream the conclusion REPORT immediately.
      // For now, keep it simple: Intake streams, then client sends another msg or tool triggers it.

      // If we are already heading for a conclusion (State classifier previously said so)
      // we might want to skip intake streaming and go straight to conclusion streaming.
      // But classifyDialogueState is currently non-streaming.

      return assessmentResult.toDataStreamResponse({ data });
    }

    // Fallback? Should cover all cases.
    await saveAssistantMessage("Unexpected error: No route matched.");
    return NextResponse.json({ error: 'Unexpected route match' }, { status: 500 });

  } catch (error: any) {
    console.error('Chat API Error:', error);
    return NextResponse.json({ error: error.message || 'Error processing request' }, { status: 500 });
  } finally {
    // =================================================================================
    // 异步触发记忆提取 - 不阻塞响应
    // =================================================================================
    // Session and userId are captured at the start of the try block
    if (finalSessionId && finalUserId) {
      const sessionId = finalSessionId;
      // 使用 setImmediate 模拟或直接在 finally 中异步执行
      Promise.resolve().then(async () => {
        try {
          await memoryManager.processConversation(sessionId);
          console.log('[Memory] Async extraction completed for:', sessionId);
        } catch (e) {
          console.error('[Memory] Async extraction failed:', e);
        }
      });
    }
  }
}
