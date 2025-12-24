import { NextRequest, NextResponse } from 'next/server';
import { StreamData } from 'ai';
import { auth } from '@/auth'; // Adjust path if needed
import { prisma } from '@/lib/db/prisma';
import { quickAnalyze } from '@/lib/ai/groq';
import { streamCrisisReply } from '@/lib/ai/crisis';
import { streamSupportReply } from '@/lib/ai/support';
import { continueAssessment, streamAssessmentReply } from '@/lib/ai/assessment';
import { generateAssessmentConclusion, streamAssessmentConclusion } from '@/lib/ai/assessment/conclusion';
import { quickCrisisKeywordCheck } from '@/lib/ai/crisis-classifier';
import { ChatRequest, RouteType } from '@/types/chat';
import { memoryManager } from '@/lib/memory';
import { guardInput, getBlockedResponse } from '@/lib/ai/guardrails';
import { logInfo, logWarn, logError } from '@/lib/observability/logger';
import { analyzeRiskSignals, calculateTurn, inferPhase, shouldTriggerSafetyCheck } from '@/lib/ai/dialogue';
import { generateSummary, shouldSummarize, updateConversationSummary } from '@/lib/memory/summarizer';
import { analyzeConversationForStuckLoop, createStuckLoopEvent } from '@/lib/ai/detection/stuck-loop';
import { coordinateAgents } from '@/lib/ai/agents/orchestrator';
import { ChatMessage } from '@/lib/ai/deepseek';

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
const SKILL_CARDS = {
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
    title: '5-4-3-2-1着陆技术',
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
};

type SkillType = keyof typeof SKILL_CARDS;

/**
 * 检测直接技能请求类型
 */
function detectDirectSkillRequest(message: string): SkillType | null {
  const lowerMsg = message.toLowerCase();
  if (/呼吸|4.?7.?8|深呼吸/.test(lowerMsg)) return 'breathing';
  if (/冥想|正念|静心|meditation/.test(lowerMsg)) return 'meditation';
  if (/着陆|5.?4.?3.?2.?1|grounding/.test(lowerMsg)) return 'grounding';
  if (/重构|想法挑战|认知/.test(lowerMsg)) return 'reframing';
  if (/行为激活|活动|小任务/.test(lowerMsg)) return 'activation';
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
    breathing: '好的，这是一个简单有效的呼吸练习。点击下方开始，跟随节奏一起做：',
    meditation: '好的，让我们一起做个简短的正念冥想。点击开始，找一个安静的地方：',
    grounding: '好的，这是一个帮助你回到当下的着陆技术。按步骤试试看：',
    reframing: '这是一个认知重构练习，可以帮助你从不同角度看待当下的消极念头：',
    activation: '这是一个行为激活小任务，旨在通过微小的行动来提升你的动力和情绪：',
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
  let routeType: RouteType = 'support'; // Top-level definition

  try {
    const body: ChatRequest = await request.json();
    const { message, history = [], state, assessmentStage, meta } = body;

    if (!message || message.trim().length === 0) {
      return NextResponse.json({ error: '消息内容不能为空' }, { status: 400 });
    }

    // =================================================================================
    // 0.0.5 FAST SKILL CARD PATH - 极速路径，跳过所有 LLM 调用
    // =================================================================================
    const directSkillType = detectDirectSkillRequest(message);
    if (directSkillType) {
      console.log('[API] FAST PATH: Direct skill request detected, bypassing all LLM calls:', directSkillType);
      const data = new StreamData();
      const skill = SKILL_CARDS[directSkillType];
      const introMessages: Record<SkillType, string> = {
        breathing: '好的，这是一个简单有效的呼吸练习。点击下方开始，跟随节奏一起做：',
        meditation: '好的，让我们一起做个简短的正念冥想。点击开始，找一个安静的地方：',
        grounding: '好的，这是一个帮助你回到当下的着陆技术。按步骤试试看：',
        reframing: '这是一个认知重构练习，可以帮助你从不同角度看待当下的消极念头：',
        activation: '这是一个行为激活小任务，旨在通过微小的行动来提升你的动力和情绪：',
      };

      // 异步保存消息（不阻塞）
      if (body.sessionId) {
        prisma.message.create({
          data: {
            conversationId: body.sessionId,
            role: 'assistant',
            content: introMessages[directSkillType],
            meta: { routeType: 'support', actionCards: [skill], fastSkillResponse: true },
          }
        }).catch(e => console.error('[DB] Failed to save skill response:', e));
      }

      return createSkillCardStreamResponse(directSkillType, data, {
        timestamp: new Date().toISOString(),
        emotion: { label: 'neutral', score: 5 },
        safety: { label: 'normal', score: 0, reasoning: 'Fast skill path - no safety check needed' },
      });
    }

    // =================================================================================
    // 0.1 Parallel Orchestration - 多 Agent 协同 (安全监测等)
    // =================================================================================
    const orchestrationPromise = coordinateAgents(message, history as ChatMessage[], { traceMetadata: { sessionId: body.sessionId } });

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

    // Save User Message - 异步执行，不阻塞响应
    if (sessionId && userId) {
      // 不 await，让 DB 操作在后台执行
      (async () => {
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

          // 如果只有1条消息或者标题是默认值，则更新
          if (conversation && (conversation._count.messages <= 2 || conversation.title === '新对话')) {
            const newTitle = message.substring(0, 20) + (message.length > 20 ? '...' : '');
            await prisma.conversation.update({
              where: { id: sessionId },
              data: {
                title: newTitle,
                createdAt: new Date(),
              }
            });
          }
        } catch (e) {
          console.error('Failed to save user message or update title', e);
        }
      })();
    }

    // =================================================================================
    // 0.5 Memory Retrieval + Groq Analysis (并行执行，节省 ~300ms)
    // =================================================================================
    let memoryContext = '';
    let processedHistory = history;

    // 并行执行：Groq 分析 + 记忆检索
    const groqPromise = quickAnalyze(message);

    const memoryPromise = (userId && history.length > 0)
      ? (async () => {
        try {
          const { contextString } = await memoryManager.getMemoriesForContext(userId, message);
          if (contextString) {
            console.log('[Memory] Retrieved context for user:', userId, 'length:', contextString.length);
            return contextString;
          }
        } catch (e) {
          console.error('[Memory] Failed:', e);
        }
        return '';
      })()
      : Promise.resolve('');

    // 同时等待两个结果
    const [analysis, retrievedMemory, orchestration] = await Promise.all([groqPromise, memoryPromise, orchestrationPromise]);
    memoryContext = retrievedMemory;

    console.log('[Orchestrator] Result:', orchestration.safety);
    console.log('[Groq] Quick analysis result:', analysis);

    // 如果安全观察员检测到危机，强制切换到危机路由
    if (orchestration.safety.label === 'crisis') {
      console.log('[API] SafetyObserver detected crisis, overriding route');
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

    const data = new StreamData();
    const traceMetadata = { sessionId, userId };

    const emotionObj = { label: analysis.emotion.label, score: analysis.emotion.score };
    routeType = analysis.route;

    // 后备：关键词检测危机（防止小模型漏检）
    if (routeType !== 'crisis' && quickCrisisKeywordCheck(message)) {
      console.log('[API] Crisis keyword detected, overriding route');
      routeType = 'crisis';
    }

    // 旧逻辑降级（用于不精确匹配的情况）
    const skillKeywords = /做个练习|想试试|缓解焦虑|学习放松|放松技巧|放松方法/i;
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

    // Append analysis and dialogue metadata to stream
    data.append({
      timestamp: new Date().toISOString(),
      safety: orchestration.safety, // Use high-fidelity safety data from orchestrator
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
          await saveAssistantMessage(text, {
            toolCalls,
            safety: orchestration.safety,
          });
          // CRITICAL FIX: Ensure full reply is in the data stream final packet
          data.append({
            reply: text,
            toolCalls,
            safety: orchestration.safety,
          } as any);
          data.close();
        };

        const result = await streamSupportReply(message, history, { onFinish: onFinishWithMeta, traceMetadata });
        return result.toDataStreamResponse({ data });
      }

      data.append({ timestamp: new Date().toISOString(), routeType: 'crisis', state: 'in_crisis', emotion: emotionObj });

      const onCrisisFinish = async (text: string, toolCalls?: any[]) => {
        await saveAssistantMessage(text, {
          toolCalls,
          safety: orchestration.safety,
        });
        data.append({
          reply: text,
          toolCalls,
          safety: orchestration.safety,
        } as any);
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
        await saveAssistantMessage(text, actionCards
          ? { routeType: 'support', actionCards, toolCalls, safety: orchestration.safety }
          : { toolCalls, safety: orchestration.safety }
        );
        data.append({
          reply: text,
          toolCalls,
          safety: orchestration.safety,
        } as any);
        data.close();
      };

      const result = await streamSupportReply(message, processedHistory, { onFinish: onFinishWithMeta, traceMetadata, memoryContext });
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

      // Call Assessment Loop with State Classifier (Streaming Version)
      const onAssessmentFinish = async (text: string, toolCalls?: any[]) => {
        // Determine if it's a conclusion based on tool calls
        const isConclusion = toolCalls?.some(tc => tc.function.name === 'finish_assessment') || false;

        await saveAssistantMessage(text, {
          toolCalls,
          routeType: 'assessment',
          assessmentStage: isConclusion ? 'conclusion' : 'intake',
        });

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
          safety: orchestration.safety,
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
          await saveAssistantMessage(text, {
            routeType: 'assessment',
            assessmentStage: 'conclusion',
            actionCards,
          });
          data.append({
            reply: text,
            actionCards,
            routeType: 'assessment',
            assessmentStage: 'conclusion',
            safety: orchestration.safety,
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
