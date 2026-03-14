import { NextRequest, NextResponse } from 'next/server';
import { getDatasets, getCases, getCaseCount, searchCases } from '../db-reader';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const datasetId = searchParams.get('dataset') || undefined;
    const query = searchParams.get('q') || undefined;
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '50');

    // 如果有搜索
    if (query) {
      const cases = searchCases(query, datasetId);
      return NextResponse.json({ cases });
    }

    // 返回数据集列表 + 用例
    const datasets = getDatasets();

    if (datasetId) {
      const total = getCaseCount(datasetId);
      const rawCases = getCases(datasetId, pageSize, (page - 1) * pageSize);
      // 附带首轮角色信息
      const cases = rawCases.map(c => {
        let first_role = 'user';
        let first_prompt: string | null = null;
        try {
          const dialog = JSON.parse(c.dialog_json);
          if (dialog?.[0]?.role) first_role = dialog[0].role;
          const firstUser = dialog?.find((t: any) => t.role === 'user');
          if (firstUser?.content) first_prompt = firstUser.content.slice(0, 120);
        } catch { /* ignore */ }
        const { dialog_json, metadata_json, ...rest } = c;
        return { ...rest, first_role, first_prompt };
      });
      return NextResponse.json({ datasets, cases, total, page, pageSize });
    }

    return NextResponse.json({
      datasets: datasets.map(d => ({
        ...d,
        caseCount: getCaseCount(d.id),
      })),
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
