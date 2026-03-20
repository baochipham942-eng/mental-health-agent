import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getRuns, getAnnotationStats } from '../db-reader';
import { requireEvalAdmin } from '../auth-guard';

const RESULTS_DIR = path.join(process.cwd(), 'tests/eval/results');

export interface EvalRunSummary {
  runId: string;
  dataset: string;
  model: string;
  mode: string;
  version: string;
  gitCommit: string;
  status: string;
  timestamp: string;
  totalCases: number;
  totalTurns: number;
  avgTtftMs: number;
  passRate: number;
  failCount: number;
  driftCount?: number;   // v4: 三态失败分类 — Drift 偏离数
  // v3: 标注进度
  annotationStats: { total: number; annotated: number; pass: number; fail: number; pending: number };
  // v3: 进度
  progress: { completed: number; total: number };
}

export async function GET() {
  try {
    const denied = await requireEvalAdmin();
    if (denied) return denied;
    // 优先从 SQLite 读取 runs 元信息
    const dbRuns = await getRuns(50);

    // 同时从 JSON 文件读取结果详情（兼容旧数据）
    const jsonData = new Map<string, any>();
    if (fs.existsSync(RESULTS_DIR)) {
      const files = fs.readdirSync(RESULTS_DIR)
        .filter(f => f.startsWith('academic-') && f.endsWith('.json'));
      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(RESULTS_DIR, file), 'utf-8');
          const data = JSON.parse(raw);
          if (data.runId) jsonData.set(data.runId, data);
        } catch { /* skip */ }
      }
    }

    const runs: EvalRunSummary[] = [];

    // 合并 DB runs + JSON 数据
    const seenIds = new Set<string>();

    for (const dbRun of dbRuns) {
      seenIds.add(dbRun.id);
      const json = jsonData.get(dbRun.id);
      const config = dbRun.config_json ? JSON.parse(dbRun.config_json) : {};
      const summary = dbRun.summary_json ? JSON.parse(dbRun.summary_json) : json?.summary || {};

      const datasets = dbRun.dataset_id || (json?.results?.map((r: any) => r.dataset).filter(Boolean).join(', ')) || 'unknown';

      // 通过率
      const allChecks = { ...summary.codeCheckStats, ...summary.judgeStats };
      let totalPass = 0, totalAll = 0;
      for (const v of Object.values(allChecks || {}) as { pass: number; total: number }[]) {
        totalPass += v.pass;
        totalAll += v.total;
      }

      // 标注统计
      let annotationStats = { total: 0, annotated: 0, pass: 0, fail: 0, pending: 0 };
      try { annotationStats = await getAnnotationStats(dbRun.id); } catch { /* db may not have results */ }

      runs.push({
        runId: dbRun.id,
        dataset: datasets,
        model: dbRun.model || json?.model || config.model || 'deepseek',
        mode: dbRun.mode || 'benchmark',
        version: dbRun.version || config.version || '',
        gitCommit: dbRun.git_commit || config.gitCommit || '',
        status: dbRun.status || 'unknown',
        timestamp: dbRun.started_at || '',
        totalCases: summary.totalCases || 0,
        totalTurns: summary.totalTurns || 0,
        avgTtftMs: summary.avgTtftMs || 0,
        passRate: totalAll > 0 ? Math.round(totalPass / totalAll * 1000) / 10 : 0,
        failCount: summary.failCases?.length || 0,
        annotationStats,
        progress: {
          completed: annotationStats.total || summary.totalCases || 0,
          total: config.limit || summary.totalCases || 0,
        },
      });
    }

    // 补充纯 JSON 文件的 runs（没有 DB 记录的旧实验）
    for (const [runId, data] of jsonData) {
      if (seenIds.has(runId)) continue;
      const s = data.summary || {};
      const allChecks = { ...s.codeCheckStats, ...s.judgeStats };
      let totalPass = 0, totalAll = 0;
      for (const v of Object.values(allChecks || {}) as { pass: number; total: number }[]) {
        totalPass += v.pass;
        totalAll += v.total;
      }
      const datasets = [...new Set(data.results?.map((r: any) => r.dataset) || [])].join(', ') || 'unknown';

      runs.push({
        runId,
        dataset: datasets,
        model: data.model || 'deepseek',
        mode: 'benchmark',
        version: '',
        gitCommit: '',
        status: 'completed',
        timestamp: '',
        totalCases: s.totalCases || 0,
        totalTurns: s.totalTurns || 0,
        avgTtftMs: s.avgTtftMs || 0,
        passRate: totalAll > 0 ? Math.round(totalPass / totalAll * 1000) / 10 : 0,
        failCount: s.failCases?.length || 0,
        annotationStats: { total: 0, annotated: 0, pass: 0, fail: 0, pending: 0 },
        progress: { completed: s.totalCases || 0, total: s.totalCases || 0 },
      });
    }

    // 按时间倒序
    runs.sort((a, b) => (b.timestamp || b.runId).localeCompare(a.timestamp || a.runId));

    return NextResponse.json({ runs });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Failed to read eval results' }, { status: 500 });
  }
}
