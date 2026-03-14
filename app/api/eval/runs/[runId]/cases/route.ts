import { NextRequest, NextResponse } from 'next/server';
import { getRunCaseSummaries, getCaseResults, getRunCaseIds } from '../../../db-reader';

/**
 * GET /api/eval/runs/[runId]/cases — 获取 run 下的用例列表或单个用例详情
 * Query params:
 *   ?caseId=xxx  — 获取单个用例的所有轮次结果
 *   (无 caseId)  — 获取所有用例的聚合摘要
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
) {
  try {
    const { runId } = await params;
    const decodedRunId = decodeURIComponent(runId);
    const caseId = req.nextUrl.searchParams.get('caseId');

    if (caseId) {
      // 单个用例详情
      const results = getCaseResults(decodedRunId, caseId);
      const caseIds = getRunCaseIds(decodedRunId);
      const currentIndex = caseIds.indexOf(caseId);

      return NextResponse.json({
        caseId,
        results,
        navigation: {
          prev: currentIndex > 0 ? caseIds[currentIndex - 1] : null,
          next: currentIndex < caseIds.length - 1 ? caseIds[currentIndex + 1] : null,
          current: currentIndex + 1,
          total: caseIds.length,
        },
      });
    }

    // 用例列表（聚合摘要）
    const summaries = getRunCaseSummaries(decodedRunId);
    return NextResponse.json({ cases: summaries });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
