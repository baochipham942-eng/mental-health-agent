import { NextRequest, NextResponse } from 'next/server';
import { StreamData } from 'ai';
import { auth } from '@/auth'; // Adjust path if needed
import { prisma } from '@/lib/db/prisma';
import { analyzeEmotion } from '@/lib/ai/emotion';
import { streamCrisisReply } from '@/lib/ai/crisis';
import { streamSupportReply } from '@/lib/ai/support';
import { continueAssessment } from '@/lib/ai/assessment';
import { generateAssessmentConclusion } from '@/lib/ai/assessment/conclusion';
import { quickCrisisKeywordCheck } from '@/lib/ai/crisis-classifier';
import { ChatRequest, RouteType } from '@/types/chat';
import { memoryManager } from '@/lib/memory';
import { guardInput, getBlockedResponse } from '@/lib/ai/guardrails';
import { logInfo, logWarn, logError } from '@/lib/observability/logger';
import { coordinateAgents, OrchestrationResult } from '@/lib/ai/agents/orchestrator';
import { analyzeRiskSignals, calculateTurn, inferPhase, shouldTriggerSafetyCheck } from '@/lib/ai/dialogue';

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

/**
 * 意图分类结果
 */
interface IntentClassification {
  isCrisis: boolean;
  isSupportPositive: boolean;
  isSupportUserWantsVenting: boolean;
  shouldAssessment: boolean;
}

/**
 * 分类用户意图 (Simplified)
 */
function classifyIntent(
  userMessage: string,
  orchestration: OrchestrationResult,
  emotion?: { label: string; score: number }
): IntentClassification {
  const message = userMessage.toLowerCase().trim();

  // 1. Crisis Check (Multi-Agent Result)
  if (orchestration.safety.label === 'crisis') {
    return { isCrisis: true, isSupportPositive: false, isSupportUserWantsVenting: false, shouldAssessment: false };
  }

  // Layer 2: Keyword Backup Check
  const quickCheck = quickCrisisKeywordCheck(message);
  if (quickCheck) {
    return { isCrisis: true, isSupportPositive: false, isSupportUserWantsVenting: false, shouldAssessment: false };
  }

  // 2. Venting Check
  const ventingKeywords = ['只想倾诉', '不要建议', '不要分析', '不需要建议', '不需要分析', '只要倾诉', '只想说说', '只想聊聊', '不要给建议', '不需要给建议'];
  if (ventingKeywords.some(k => message.includes(k))) {
    return { isCrisis: false, isSupportPositive: false, isSupportUserWantsVenting: true, shouldAssessment: false };
  }

  // 3. Positive Check
  const positiveKeywords = ['开心', '高兴', '太好了', '顺利', '成功', '放松', '轻松', '幸福', '满足', '激动', '兴奋', '好消息', '喜提', '中奖', '被夸', '升职', '加薪', '泡温泉', '治愈', '很棒', '很好', '不错', '舒服', '愉快', '快乐', '愉悦', '舒畅', '惬意', '享受', '喜欢', '太棒', '真棒', '真好', '真不错'];
  const negativeKeywords = ['压力', '焦虑', '抑郁', '难受', '崩溃', '睡不着', '失眠', '烦', '痛苦', '想死', '不想活', '自杀', '伤害自己', '绝望', '撑不住', '困扰', '问题', '困难', '麻烦', '担心', '害怕', '恐惧', '紧张', '不安', '忧虑'];

  const positiveScore = positiveKeywords.filter(k => message.includes(k)).length;
  const hasNegativeSignal = negativeKeywords.some(k => message.includes(k));
  const hasContrast = /但是|不过|虽然|尽管|可是|然而/.test(message);
  const hasHelpRequest = /帮帮我|求助|需要建议|需要方法|怎么办|如何解决|如何缓解|怎么调整|怎么改善/.test(message);

  const isSupportPositive = positiveScore >= 1 && !hasNegativeSignal && !hasContrast && !hasHelpRequest;
  if (isSupportPositive) {
    return { isCrisis: false, isSupportPositive: true, isSupportUserWantsVenting: false, shouldAssessment: false };
  }

  // 4. Default to Assessment if negative or help seeking
  // Simplified logic: If negative signal OR help request, go assessment (unless explicitly venting)
  // Otherwise default to support (neutral chat)
  const shouldAssessment = hasNegativeSignal || hasHelpRequest || emotion && ['焦虑', '抑郁', '悲伤', '恐惧', '愤怒'].includes(emotion.label) && emotion.score >= 5;

  return {
    isCrisis: false,
    isSupportPositive: false,
    isSupportUserWantsVenting: false,
    shouldAssessment: !!shouldAssessment
  };
}

function determineRouteType(
  userMessage: string,
  orchestration: OrchestrationResult,
  emotion?: { label: string; score: number }
): RouteType {
  const intent = classifyIntent(userMessage, orchestration, emotion);
  if (intent.isCrisis) return 'crisis';
  if (intent.isSupportPositive || intent.isSupportUserWantsVenting) return 'support';
  if (intent.shouldAssessment) return 'assessment';
  return 'support'; // Default
}

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  let finalSessionId: string | undefined;
  let finalUserId: string | undefined;

  try {
    const body: ChatRequest = await request.json();
    const { message, history = [], state, meta } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: '消息内容不能为空' }, { status: 400 });
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

    logInfo('chat-request', {
      hasSession: !!session,
      userId,
      sessionId: body.sessionId,
      messageLen: message.length
    });

    // Define helper to save assistant message
    const saveAssistantMessage = async (content: string) => {
      if (sessionId && userId) {
        try {
          await prisma.message.create({
            data: {
              conversationId: sessionId,
              role: 'assistant',
              content: content,
            }
          });
        } catch (e) {
          console.error('Failed to save assistant message', e);
        }
      }
    };

    // Save User Message immediately
    if (sessionId && userId) {
      try {
        await prisma.message.create({
          data: {
            conversationId: sessionId,
            role: 'user',
            content: message,
          }
        });

        // 自动更新会话标题逻辑
        const conversation = await prisma.conversation.findUnique({
          where: { id: sessionId },
          select: { title: true, _count: { select: { messages: true } } }
        });

        console.log('[AutoTitle] Checking:', {
          id: sessionId,
          title: conversation?.title,
          msgCount: conversation?._count?.messages
        });

        // 如果只有1条消息（刚保存的那条）或者标题是默认值，则更新
        if (conversation && (conversation._count.messages <= 2 || conversation.title === '新对话')) {
          // Relaxation: <= 2 to account for potential race where assistant msg might be saved or counted
          const newTitle = message.substring(0, 20) + (message.length > 20 ? '...' : '');
          console.log('[AutoTitle] Updating to:', newTitle);
          await prisma.conversation.update({
            where: { id: sessionId },
            data: {
              title: newTitle,
              // Update createdAt to now (first message time) for better sidebar display
              createdAt: new Date(),
            }
          });
        } else {
          console.log('[AutoTitle] Update skipped.');
        }
      } catch (e) {
        console.error('Failed to save user message or update title', e);
        // Continue anyway? Or fail? Continue.
      }
    }

    // =================================================================================
    // 0.5 Memory Retrieval - 获取用户记忆并注入上下文
    // =================================================================================
    let memoryContext = '';
    if (userId) {
      try {
        const { contextString } = await memoryManager.getMemoriesForContext(userId, message);
        if (contextString) {
          memoryContext = contextString;
          console.log('[Memory] Retrieved context for user:', userId, 'length:', contextString.length);
        }
      } catch (e) {
        console.error('[Memory] Failed to retrieve memories:', e);
        // 继续执行，不影响主流程
      }
    }

    const data = new StreamData();
    const emotionPromise = analyzeEmotion(message);
    const orchestrationPromise = coordinateAgents(message, history.map(m => ({ role: m.role as any, content: m.content })));

    // Run parallel
    const [emotion, orchestration] = await Promise.all([emotionPromise, orchestrationPromise]);

    const emotionObj = emotion ? { label: emotion.label, score: emotion.score } : null;
    let routeType = determineRouteType(message, orchestration, emotionObj ? emotionObj : undefined);

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

    // Append orchestration and dialogue metadata to stream
    data.append({
      timestamp: new Date().toISOString(),
      safety: orchestration.safety,
      dialogue: {
        turn: conversationTurn,
        phase: dialoguePhase,
        riskLevel: riskSignals.level,
      },
    } as any);

    // Fix: If we are in evaluation flow (awaiting_followup), continue assessment unless it's a crisis
    if (state === 'awaiting_followup' && routeType !== 'crisis') {
      routeType = 'assessment';
    }

    // =================================================================================
    // 1. Crisis Handler (Highest Priority)
    // =================================================================================
    if (state === 'in_crisis' || routeType === 'crisis') {
      const isExplicitSafety = /我没事了|感觉好多了|已经不处在危险中了|放心吧/.test(message);
      if (state === 'in_crisis' && isExplicitSafety) {
        // De-escalate
        data.append({ timestamp: new Date().toISOString(), routeType: 'support', state: 'normal', emotion: null });

        // Use onFinish to save
        const result = await streamSupportReply(message, history, { onFinish: saveAssistantMessage });
        data.close();
        return result.toDataStreamResponse({ data });
      }

      data.append({ timestamp: new Date().toISOString(), routeType: 'crisis', state: 'in_crisis', emotion: emotionObj });
      const result = await streamCrisisReply(message, history, state === 'in_crisis', { onFinish: saveAssistantMessage }); // isFollowup = true if already in crisis
      data.close();
      return result.toDataStreamResponse({ data });
    }

    // =================================================================================
    // 2. Support Handler (Positive / Venting / Neutral)
    // =================================================================================
    if (routeType === 'support') {
      // Force exit assessment if we were in it
      data.append({ timestamp: new Date().toISOString(), routeType: 'support', state: 'normal', emotion: emotionObj });
      const result = await streamSupportReply(message, history, { onFinish: saveAssistantMessage });
      data.close();
      return result.toDataStreamResponse({ data });
    }

    // =================================================================================
    // 3. Assessment Handler (Intake Loop -> Conclusion)
    // =================================================================================
    if (routeType === 'assessment') {
      // Collect contexts for assessment loop
      // If we are in 'awaiting_followup', we combine history context.
      // But for Prompt-Driven Loop, we pass message + history to LLM, LLM decides.

      // Determine if we are starting or continuing
      // (Actually doesn't matter, Prompt handles both)

      // Call Assessment Loop
      const { reply, isConclusion } = await continueAssessment(message, history);

      if (isConclusion) {
        // LLM decided intake is done (via tool calling). Transition to Conclusion.
        const allUserMessages = history.filter(m => m.role === 'user').map(m => m.content);
        allUserMessages.push(message);

        const initialMsg = allUserMessages[0] || message;
        const followupStr = allUserMessages.slice(1).join('\n\n') || '（无补充回答）';

        const conclusionResult = await generateAssessmentConclusion(initialMsg, followupStr, history);

        // Save Conclusion Reply
        await saveAssistantMessage(conclusionResult.reply);

        data.append({
          timestamp: new Date().toISOString(),
          routeType: 'assessment',
          state: 'normal',
          assessmentStage: 'conclusion',
          actionCards: conclusionResult.actionCards,
          resources: conclusionResult.resources,
          ...(conclusionResult.gate && { gate: conclusionResult.gate }),
        } as any);

        return createFixedStreamResponse(conclusionResult.reply, data);
      } else {
        // Continuing intake
        await saveAssistantMessage(reply);

        data.append({
          timestamp: new Date().toISOString(),
          routeType: 'assessment',
          state: 'awaiting_followup',
          assessmentStage: 'intake',
        });

        return createFixedStreamResponse(reply, data);
      }
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
