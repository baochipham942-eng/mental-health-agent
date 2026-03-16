import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { deleteRun, getRunById } from '../../db-reader';
import { requireEvalAdmin } from '../../auth-guard';

const RESULTS_DIR = path.join(process.cwd(), 'tests/eval/results');

export async function GET(
  _req: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const denied = await requireEvalAdmin();
    if (denied) return denied;

    const { runId } = params;

    // 先查 JSON 文件
    if (fs.existsSync(RESULTS_DIR)) {
      const files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json') && !f.includes('.status'));
      const target = files.find(f => {
        try {
          const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf-8'));
          return data.runId === runId;
        } catch { return false; }
      });
      if (target) {
        const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, target), 'utf-8'));
        return NextResponse.json(data);
      }
    }

    // Fallback: 从 SQLite 读取
    const dbRun = await getRunById(runId);
    if (!dbRun) {
      return NextResponse.json({ error: 'Run not found' }, { status: 404 });
    }

    const config = dbRun.config_json ? JSON.parse(dbRun.config_json) : {};
    return NextResponse.json({
      runId: dbRun.id,
      model: dbRun.model || config.model || 'deepseek',
      mode: dbRun.mode || 'benchmark',
      dataset: dbRun.dataset_id || config.dataset || 'unknown',
      status: dbRun.status,
      startedAt: dbRun.started_at,
      finishedAt: dbRun.finished_at,
      gitCommit: dbRun.git_commit || '',
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read run data' }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { runId: string } }
) {
  try {
    const denied = await requireEvalAdmin();
    if (denied) return denied;

    const { runId } = params;

    // 1. 从 SQLite 删除
    const dbResult = await deleteRun(runId);

    // 2. 删除对应的 JSON 和 HTML 报告文件
    let filesDeleted = 0;
    if (fs.existsSync(RESULTS_DIR)) {
      const files = fs.readdirSync(RESULTS_DIR).filter(f =>
        (f.endsWith('.json') || f.endsWith('.html')) && f.includes(runId.replace(/^(academic|product)-/, ''))
      );
      for (const file of files) {
        try {
          fs.unlinkSync(path.join(RESULTS_DIR, file));
          filesDeleted++;
        } catch { /* ignore */ }
      }
    }

    return NextResponse.json({
      success: true,
      deletedResults: dbResult.deletedResults,
      deletedRun: dbResult.deletedRun,
      filesDeleted,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to delete run' }, { status: 500 });
  }
}
