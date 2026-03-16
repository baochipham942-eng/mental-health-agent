import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireEvalAdmin } from '../../auth-guard';

const STATUS_DIR = path.join(process.cwd(), 'tests/eval/results/.status');

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const denied = await requireEvalAdmin();
    if (denied) return denied;
    const statusFile = path.join(STATUS_DIR, `${params.runId}.json`);

    if (!fs.existsSync(statusFile)) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    const data = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
