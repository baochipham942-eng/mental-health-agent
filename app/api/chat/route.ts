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

    // Define helper to save assistant message with optional metadata
    const saveAssistantMessage = async (content: string, meta?: Record<string, any>) => {
      if (sessionId && userId) {
        try {
          await prisma.message.create({
            data: {
              conversationId: sessionId,
              role: 'assistant',
              content: content,
              meta: meta, // Persist actionCards, routeType, etc. (undefined if not provided)
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
    const traceMetadata = { sessionId, userId };
    const emotionPromise = analyzeEmotion(message, traceMetadata);
    const orchestrationPromise = coordinateAgents(message, history.map(m => ({ role: m.role as any, content: m.content })), { traceMetadata });

    // Run parallel
    const [emotion, orchestration] = await Promise.all([emotionPromise, orchestrationPromise]);

    const emotionObj = emotion ? { label: emotion.label, score: emotion.score } : null;
    let routeType = determineRouteType(message, orchestration, emotionObj ? emotionObj : undefined);

    // =================================================================================
    // 0.5.5 Skill Card Override (Global Pre-check)
    // =================================================================================
    const skillKeywords = /呼吸练习|放松技巧|放松方法|做个练习|想试试|缓解焦虑|学习放松|冥想|正念|着陆技术/i;
    const wantsSkillCard = skillKeywords.test(message);
    if (wantsSkillCard) {
      console.log('[API] Skill keyword detected, forcing support route with action card.');
      routeType = 'support';
    }

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
    console.log('[API] Route decision:', { routeType, state, message: message.substring(0, 50) });
    if (state === 'in_crisis' || routeType === 'crisis') {
      const isExplicitSafety = /我没事了|感觉好多了|已经不处在危险中了|放心吧/.test(message);
      if (state === 'in_crisis' && isExplicitSafety) {
        // De-escalate
        data.append({ timestamp: new Date().toISOString(), routeType: 'support', state: 'normal', emotion: null });

        const onFinishWithMeta = async (text: string, toolCalls?: any[]) => {
          await saveAssistantMessage(text, { toolCalls });
          // CRITICAL FIX: Ensure full reply is in the data stream final packet
          data.append({ reply: text, toolCalls } as any);
          data.close();
        };

        const result = await streamSupportReply(message, history, { onFinish: onFinishWithMeta, traceMetadata });
        return result.toDataStreamResponse({ data });
      }

      data.append({ timestamp: new Date().toISOString(), routeType: 'crisis', state: 'in_crisis', emotion: emotionObj });

      const onCrisisFinish = async (text: string, toolCalls?: any[]) => {
        await saveAssistantMessage(text, { toolCalls });
        data.append({ reply: text, toolCalls } as any);
        data.close();
      }

      const result = await streamCrisisReply(message, history, state === 'in_crisis', { onFinish: onCrisisFinish, traceMetadata });
      return result.toDataStreamResponse({ data });
    }

    // =================================================================================
    // 2. Support Handler (Positive / Venting / Neutral)
    // =================================================================================
    if (routeType === 'support') {
      let actionCards: any[] | undefined;
      if (wantsSkillCard) {
        // 根据具体关键词选择合适的技能卡片
        if (/冥想|正念/.test(message)) {
          // 冥想相关关键词 -> 正念冥想卡片
          actionCards = [
            {
              title: '正念冥想',
              steps: [
                '找一个安静舒适的地方坐下',
                '轻轻闭上眼睛，放松身体',
                '专注于呼吸的感觉',
                '当注意力飘走时，温柔地拉回来',
              ],
              when: '想要放松心情或提高专注力时',
              effort: 'medium',
              widget: 'meditation',
            },
          ];
        } else {
          // 默认：呼吸练习卡片
          actionCards = [
            {
              title: '4-7-8 呼吸法',
              steps: [
                '吸气 4 秒',
                '屏息 7 秒',
                '呼气 8 秒',
                '重复 3-4 次',
              ],
              when: '感到焦虑或需要快速放松时',
              effort: 'low',
              widget: 'breathing',
            },
          ];
        }
      }

      // Force exit assessment if we were in it
      data.append({
        timestamp: new Date().toISOString(),
        routeType: 'support',
        state: 'normal',
        emotion: emotionObj,
        ...(actionCards && { actionCards }), // Inject skill cards
      });

      // Wrap saveAssistantMessage to include actionCards in metadata
      const onFinishWithMeta = async (text: string, toolCalls?: any[]) => {
        await saveAssistantMessage(text, actionCards ? { routeType: 'support', actionCards, toolCalls } : { toolCalls });
        data.append({ reply: text, toolCalls } as any);
        data.close();
      };

      const result = await streamSupportReply(message, history, { onFinish: onFinishWithMeta, traceMetadata });
      // data.close() moved to onFinish
      return result.toDataStreamResponse({ data });
    }

    // =================================================================================
    // 3. Assessment Handler (Intake Loop -> Conclusion)
    // =================================================================================
    if (routeType === 'assessment') {
      // ⚡ Skill Card Shortcut: If user explicitly requests a skill, bypass assessment loop
      const skillKeywords = /呼吸练习|放松技巧|放松方法|做个练习|想试试|缓解焦虑|学习放松|冥想|正念|着陆技术/i;
      const wantsSkillCard = skillKeywords.test(message);
      console.log('[API] Assessment route - skillKeywords test:', { message, wantsSkillCard });

      if (wantsSkillCard) {
        // 根据具体关键词选择合适的技能卡片
        let skillCard;
        let skillReply;

        if (/冥想|正念/.test(message)) {
          skillCard = {
            title: '正念冥想',
            steps: ['找一个安静舒适的地方坐下', '轻轻闭上眼睛，放松身体', '专注于呼吸的感觉', '当注意力飘走时，温柔地拉回来'],
            when: '想要放松心情或提高专注力时',
            effort: 'medium',
            widget: 'meditation',
          };
          skillReply = '好的，我们来做一个简单的正念冥想练习，帮助你放松身心。请点击下方的卡片开始：';
        } else {
          skillCard = {
            title: '4-7-8 呼吸法',
            steps: ['吸气 4 秒', '屏息 7 秒', '呼气 8 秒', '重复 3-4 次'],
            when: '感到焦虑或需要快速放松时',
            effort: 'low',
            widget: 'breathing',
          };
          skillReply = '好的，我们来做一个简单的呼吸练习来帮助你放松。请点击下方的卡片开始：';
        }

        // Save with metadata so actionCards persist across page refresh
        await saveAssistantMessage(skillReply, {
          routeType: 'support',
          state: 'normal',
          actionCards: [skillCard],
        });

        data.append({
          timestamp: new Date().toISOString(),
          routeType: 'support', // Switch to support mode
          state: 'normal',
          actionCards: [skillCard],
        });

        return createFixedStreamResponse(skillReply, data);
      }

      // Call Assessment Loop with State Classifier
      const { reply, isConclusion, toolCalls, stateClassification } = await continueAssessment(message, history, { traceMetadata });

      // =================================================================================
      // 🔄 Dynamic Mode Switch: If State Classifier recommends support, switch modes
      // =================================================================================
      if (stateClassification?.recommendedMode === 'support' && !isConclusion) {
        console.log('[API] State Classifier recommends switching to support mode:', stateClassification.reasoning);

        try {
          // Switch to support mode for better user experience
          data.append({
            timestamp: new Date().toISOString(),
            routeType: 'support',
            state: 'normal',
            emotion: emotionObj,
            modeSwitch: {
              from: 'assessment',
              to: 'support',
              reason: stateClassification.reasoning,
            },
          } as any);

          const onFinishWithMeta = async (text: string, toolCalls?: any[]) => {
            await saveAssistantMessage(text, { routeType: 'support', modeSwitch: true, toolCalls });
            data.append({ reply: text, toolCalls } as any);
            data.close();
          };

          const result = await streamSupportReply(message, history, { onFinish: onFinishWithMeta, traceMetadata });
          return result.toDataStreamResponse({ data });
        } catch (modeSwitchError) {
          console.error('[API] Mode switch to support failed, continuing with assessment reply:', modeSwitchError);
          // Fall through to use the assessment reply below
        }
      }

      if (isConclusion) {
        // LLM decided intake is done (via tool calling). Transition to Conclusion.
        const allUserMessages = history.filter(m => m.role === 'user').map(m => m.content);
        allUserMessages.push(message);

        const initialMsg = allUserMessages[0] || message;
        const followupStr = allUserMessages.slice(1).join('\n\n') || '（无补充回答）';

        const conclusionResult = await generateAssessmentConclusion(initialMsg, followupStr, history, { traceMetadata });

        // Save Conclusion Reply with metadata
        await saveAssistantMessage(conclusionResult.reply, {
          routeType: 'assessment',
          state: 'normal',
          assessmentStage: 'conclusion',
          actionCards: conclusionResult.actionCards,
          resources: conclusionResult.resources,
        });

        data.append({
          timestamp: new Date().toISOString(),
          routeType: 'assessment',
          state: 'normal',
          assessmentStage: 'conclusion',
          actionCards: conclusionResult.actionCards,
          resources: conclusionResult.resources,
          reply: conclusionResult.reply, // 补全 reply
          ...(conclusionResult.gate && { gate: conclusionResult.gate }),
        } as any);

        return createFixedStreamResponse(conclusionResult.reply, data);
      } else {
        // Continuing intake
        // If reply is empty but we have toolCalls, use a placeholder logic or pass toolCalls to client
        let finalReply = reply;
        if (!finalReply && toolCalls && toolCalls.length > 0) {
          // If explicit tool call (e.g. show_quick_replies), we might want to suppress "empty reply" error
          // by ensuring metadata has toolCalls.
          // Client checks for structured content.
          // We can also set a default text if needed, but client should handle "Text + Tool" or "Just Tool"
          console.log('[API] Assessment loop generated toolCalls without text:', toolCalls.map(tc => tc.function.name));
        }

        // Persist message
        await saveAssistantMessage(finalReply, {
          toolCalls,
          stateClassification: stateClassification ? {
            scebProgress: stateClassification.scebProgress,
            overallProgress: stateClassification.overallProgress,
          } : undefined,
        });

        data.append({
          timestamp: new Date().toISOString(),
          routeType: 'assessment',
          state: 'awaiting_followup',
          assessmentStage: 'intake',
          toolCalls: toolCalls, // Pass toolCalls to client
          reply: finalReply, // 补全 reply
          ...(stateClassification && { scebProgress: stateClassification.scebProgress }),
        } as any);

        return createFixedStreamResponse(finalReply, data);
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
