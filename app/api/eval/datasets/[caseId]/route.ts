import { NextRequest, NextResponse } from 'next/server';
import { getCaseById } from '../../db-reader';

export async function GET(
  _req: NextRequest,
  { params }: { params: { caseId: string } }
) {
  try {
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
