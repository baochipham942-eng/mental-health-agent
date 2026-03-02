/**
 * 标准化问卷评估 API
 *
 * POST  - 创建新问卷会话，返回第一题
 * PATCH - 提交回答 + 返回下一题（或完成评分）
 * GET   - 查询用户历史评分
 */

import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db/prisma';
import {
  QuestionnaireType,
  getQuestionnaireConfig,
  getNextConversationalQuestion,
  parseUserResponse,
  scoreQuestionnaire,
  checkQ9Crisis,
  generateResultFeedback,
} from '@/lib/ai/assessment/questionnaire';

export const dynamic = 'force-dynamic';

/**
 * POST /api/assessment/questionnaire
 * 创建新问卷会话
 * Body: { type: 'phq9' | 'gad7', conversationId?: string }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { type, conversationId } = await request.json();
    if (!type || !['phq9', 'gad7'].includes(type)) {
      return NextResponse.json({ error: '无效的问卷类型' }, { status: 400 });
    }

    const config = getQuestionnaireConfig(type as QuestionnaireType);
    const firstQuestion = getNextConversationalQuestion(config, 0);

    return NextResponse.json({
      questionnaireType: type,
      currentIndex: 0,
      totalQuestions: config.questions.length,
      question: firstQuestion,
      responseOptions: config.responseOptions,
      conversationId,
    });
  } catch (error: any) {
    console.error('[Questionnaire] POST error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * PATCH /api/assessment/questionnaire
 * 提交单题回答，返回下一题或完成评分
 * Body: { type, currentIndex, response (string or number), responses (number[]), conversationId? }
 */
export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { type, currentIndex, response, responses = [], conversationId } = await request.json();

    if (!type || !['phq9', 'gad7'].includes(type)) {
      return NextResponse.json({ error: '无效的问卷类型' }, { status: 400 });
    }
    if (currentIndex === undefined || currentIndex < 0) {
      return NextResponse.json({ error: '无效的题目索引' }, { status: 400 });
    }

    const config = getQuestionnaireConfig(type as QuestionnaireType);

    // 解析用户回答
    let parsedScore: number | null;
    if (typeof response === 'number' && response >= 0 && response <= 3) {
      parsedScore = response;
    } else if (typeof response === 'string') {
      parsedScore = parseUserResponse(response);
    } else {
      parsedScore = null;
    }

    if (parsedScore === null) {
      return NextResponse.json({
        error: 'parse_failed',
        message: '我没有完全理解你的回答。你可以用以下方式回答：「完全不会」(0分)、「好几天」(1分)、「一半以上的天数」(2分)、「几乎每天」(3分），或者直接回复 0-3 的数字。',
        currentIndex,
        responseOptions: config.responseOptions,
      });
    }

    // 更新回答数组
    const updatedResponses = [...responses];
    updatedResponses[currentIndex] = parsedScore;

    const nextIndex = currentIndex + 1;

    // PHQ-9 Q9 危机检查（回答完第9题时立即检查）
    if (type === 'phq9' && currentIndex === 8 && checkQ9Crisis(updatedResponses)) {
      // 先保存已有回答
      const { score, severity } = scoreQuestionnaire(updatedResponses, type);
      await prisma.questionnaireScore.create({
        data: {
          userId: session.user.id,
          conversationId,
          type,
          responses: updatedResponses,
          score,
          severity,
        },
      });

      return NextResponse.json({
        completed: true,
        crisisTriggered: true,
        score,
        severity,
        responses: updatedResponses,
        message: '谢谢你愿意告诉我。你提到了有想要伤害自己的念头，我非常关心你的安全。如果你正在经历危机，请拨打全国心理援助热线 **400-161-9995** 或 **010-82951332**。你并不孤单，有人愿意帮助你。',
      });
    }

    // 还有下一题
    if (nextIndex < config.questions.length) {
      const nextQuestion = getNextConversationalQuestion(config, nextIndex);
      return NextResponse.json({
        currentIndex: nextIndex,
        totalQuestions: config.questions.length,
        question: nextQuestion,
        responses: updatedResponses,
        parsedScore,
        responseOptions: config.responseOptions,
      });
    }

    // 所有题目回答完毕 → 计算评分
    const { score, severity } = scoreQuestionnaire(updatedResponses, type);
    const feedback = generateResultFeedback(score, severity, type);

    // 保存到数据库
    await prisma.questionnaireScore.create({
      data: {
        userId: session.user.id,
        conversationId,
        type,
        responses: updatedResponses,
        score,
        severity,
      },
    });

    // 同时写入进度指标
    await prisma.progressMetric.create({
      data: {
        userId: session.user.id,
        metricType: type,
        value: score,
        sessionId: conversationId,
        note: severity,
      },
    }).catch((e: any) => console.error('[ProgressMetric] Failed to record:', e));

    return NextResponse.json({
      completed: true,
      score,
      severity,
      responses: updatedResponses,
      feedback,
    });
  } catch (error: any) {
    console.error('[Questionnaire] PATCH error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

/**
 * GET /api/assessment/questionnaire?type=phq9&days=90
 * 查询用户历史评分
 */
export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.id) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const days = parseInt(searchParams.get('days') || '90');

    const since = new Date();
    since.setDate(since.getDate() - days);

    const scores = await prisma.questionnaireScore.findMany({
      where: {
        userId: session.user.id,
        ...(type ? { type } : {}),
        completedAt: { gte: since },
      },
      orderBy: { completedAt: 'desc' },
    });

    return NextResponse.json({ scores });
  } catch (error: any) {
    console.error('[Questionnaire] GET error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
