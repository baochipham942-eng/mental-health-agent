/**
 * 评测报告导出 API
 *
 * GET /api/eval/report?days=30&limit=100
 * 返回独立 HTML 报告文件（Content-Disposition: attachment）。
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../auth-guard';
import { getConversationTitles } from '@/lib/eval/data-bridge';
import { findRecent } from '@/lib/eval/eval-store';
import { buildReportData, generateReportHtml } from '@/lib/eval/report-builder';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const days = Math.min(Math.max(parseInt(searchParams.get('days') || '30', 10), 1), 365);
  const limit = Math.min(Math.max(parseInt(searchParams.get('limit') || '100', 10), 1), 200);

  try {
    // 计算日期范围
    const now = new Date();
    const from = new Date();
    from.setDate(from.getDate() - days);

    // 获取评估数据
    const evals = findRecent(from.toISOString(), limit);

    // 批量获取对话标题
    const convIds = evals.map((e) => e.conversationId);
    const conversationTitles = await getConversationTitles(convIds);

    // 构建报告数据 & 生成 HTML
    const reportData = buildReportData(evals);
    const html = generateReportHtml(reportData, {
      title: '心灵树洞 - 评测报告',
      dateRange: { from, to: now },
      evals,
      conversationTitles,
    });

    const dateStr = now.toISOString().slice(0, 10);

    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `attachment; filename="eval-report-${dateStr}.html"`,
      },
    });
  } catch (e: any) {
    console.error('[EvalReport] Error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
