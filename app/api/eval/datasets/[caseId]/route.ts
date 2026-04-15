import { NextRequest, NextResponse } from 'next/server';
import { getCaseById } from '../../db-reader';
import { requireEvalAdmin } from '../../auth-guard';

export async function GET(_req: NextRequest, props: { params: Promise<{ caseId: string }> }) {
  const params = await props.params;
  try {
    const denied = await requireEvalAdmin();
    if (denied) return denied;

    const caseData = await getCaseById(decodeURIComponent(params.caseId));
    if (!caseData) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }
    return NextResponse.json({
      ...caseData,
      dialog: JSON.parse(caseData.dialog_json),
      metadata: caseData.metadata_json ? JSON.parse(caseData.metadata_json) : null,
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
