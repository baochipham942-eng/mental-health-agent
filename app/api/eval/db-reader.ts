/**
 * Node.js 端读取/写入 eval-academic SQLite 数据库
 * v3: 支持读写（人工标注需要写入）
 */
import Database from 'better-sqlite3';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'scripts/eval-academic/eval-academic.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    // v3 迁移（幂等）
    migrateV3(_db);
  }
  return _db;
}

function migrateV3(db: Database.Database) {
  const cols = db.pragma('table_info(eval_results)') as any[];
  const colNames = new Set(cols.map((c: any) => c.name));
  const newCols = [
    { name: 'weighted_score', sql: 'ALTER TABLE eval_results ADD COLUMN weighted_score REAL' },
    { name: 'human_status', sql: 'ALTER TABLE eval_results ADD COLUMN human_status TEXT' },
    { name: 'human_tags', sql: 'ALTER TABLE eval_results ADD COLUMN human_tags TEXT' },
    { name: 'human_note', sql: 'ALTER TABLE eval_results ADD COLUMN human_note TEXT' },
    { name: 'first_fail_turn', sql: 'ALTER TABLE eval_results ADD COLUMN first_fail_turn INTEGER' },
    { name: 'annotated_at', sql: 'ALTER TABLE eval_results ADD COLUMN annotated_at TEXT' },
  ];
  for (const col of newCols) {
    if (!colNames.has(col.name)) {
      try { db.exec(col.sql); } catch { /* column might already exist */ }
    }
  }
  // eval_runs 新字段
  const runCols = db.pragma('table_info(eval_runs)') as any[];
  const runColNames = new Set(runCols.map((c: any) => c.name));
  if (!runColNames.has('model')) try { db.exec('ALTER TABLE eval_runs ADD COLUMN model TEXT'); } catch {}
  if (!runColNames.has('mode')) try { db.exec("ALTER TABLE eval_runs ADD COLUMN mode TEXT DEFAULT 'benchmark'"); } catch {}
  if (!runColNames.has('version')) try { db.exec('ALTER TABLE eval_runs ADD COLUMN version TEXT'); } catch {}
}

// ========== Datasets ==========

export interface DatasetInfo {
  id: string;
  name: string;
  language: string;
  source_url: string;
  total_cases: number;
  imported_at: string;
}

export function getDatasets(): DatasetInfo[] {
  return getDb().prepare('SELECT * FROM datasets ORDER BY id').all() as DatasetInfo[];
}

// ========== Cases ==========

export interface CaseRow {
  id: string;
  dataset_id: string;
  category: string | null;
  emotion_type: string | null;
  situation: string | null;
  psychotherapy: string | null;
  dialog_json: string;
  metadata_json: string | null;
  turn_count: number;
}

export function getCases(datasetId?: string, limit?: number, offset?: number): CaseRow[] {
  let sql = 'SELECT * FROM eval_cases';
  const params: any[] = [];
  if (datasetId) {
    sql += ' WHERE dataset_id = ?';
    params.push(datasetId);
  }
  sql += ' ORDER BY id';
  if (limit) {
    sql += ' LIMIT ?';
    params.push(limit);
    if (offset) {
      sql += ' OFFSET ?';
      params.push(offset);
    }
  }
  return getDb().prepare(sql).all(...params) as CaseRow[];
}

export function getCaseById(caseId: string): CaseRow | undefined {
  return getDb().prepare('SELECT * FROM eval_cases WHERE id = ?').get(caseId) as CaseRow | undefined;
}

export function getCaseCount(datasetId?: string): number {
  if (datasetId) {
    const row = getDb().prepare('SELECT COUNT(*) as cnt FROM eval_cases WHERE dataset_id = ?').get(datasetId) as any;
    return row.cnt;
  }
  const row = getDb().prepare('SELECT COUNT(*) as cnt FROM eval_cases').get() as any;
  return row.cnt;
}

export function searchCases(query: string, datasetId?: string): CaseRow[] {
  let sql = 'SELECT * FROM eval_cases WHERE (category LIKE ? OR situation LIKE ? OR id LIKE ?)';
  const params: any[] = [`%${query}%`, `%${query}%`, `%${query}%`];
  if (datasetId) {
    sql += ' AND dataset_id = ?';
    params.push(datasetId);
  }
  sql += ' ORDER BY id LIMIT 50';
  return getDb().prepare(sql).all(...params) as CaseRow[];
}

// ========== v3: Runs ==========

export interface RunRow {
  id: string;
  dataset_id: string | null;
  started_at: string;
  finished_at: string | null;
  config_json: string | null;
  summary_json: string | null;
  git_commit: string | null;
  status: string;
  model: string | null;
  mode: string | null;
  version: string | null;
}

export function getRuns(limit = 50): RunRow[] {
  return getDb().prepare('SELECT * FROM eval_runs ORDER BY started_at DESC LIMIT ?').all(limit) as RunRow[];
}

export function getRunById(runId: string): RunRow | undefined {
  return getDb().prepare('SELECT * FROM eval_runs WHERE id = ?').get(runId) as RunRow | undefined;
}

// ========== v3: Results ==========

export function getRunResults(runId: string): any[] {
  return getDb().prepare(
    'SELECT * FROM eval_results WHERE run_id = ? ORDER BY case_id, turn_index'
  ).all(runId);
}

export function getRunCaseIds(runId: string): string[] {
  const rows = getDb().prepare(
    'SELECT DISTINCT case_id FROM eval_results WHERE run_id = ? ORDER BY case_id'
  ).all(runId) as any[];
  return rows.map(r => r.case_id);
}

export function getCaseResults(runId: string, caseId: string): any[] {
  return getDb().prepare(
    'SELECT * FROM eval_results WHERE run_id = ? AND case_id = ? ORDER BY turn_index'
  ).all(runId, caseId);
}

/** 按 case 聚合的摘要（用例列表用） */
export function getRunCaseSummaries(runId: string): any[] {
  return getDb().prepare(`
    SELECT
      r.case_id,
      c.category,
      c.emotion_type,
      COALESCE(c.situation, first_turn.user_input) as situation,
      c.turn_count as dataset_turns,
      COUNT(*) as eval_turns,
      MIN(r.ttft_ms) as min_ttft,
      CAST(AVG(r.ttft_ms) AS INTEGER) as avg_ttft,
      SUM(r.total_ms) as total_ms,
      MAX(r.human_status) as human_status,
      MAX(r.human_note) as human_note,
      MAX(r.human_tags) as human_tags,
      MAX(r.annotated_at) as annotated_at,
      MAX(r.weighted_score) as weighted_score
    FROM eval_results r
    LEFT JOIN eval_cases c ON r.case_id = c.id
    LEFT JOIN eval_results first_turn ON first_turn.run_id = r.run_id AND first_turn.case_id = r.case_id AND first_turn.turn_index = 0
    WHERE r.run_id = ?
    GROUP BY r.case_id
    ORDER BY r.case_id
  `).all(runId);
}

/** 获取用例的首轮用户 prompt（数据集列表展示用） */
export function getCaseFirstPrompt(caseId: string): string | null {
  const row = getCaseById(caseId);
  if (!row) return null;
  try {
    const dialog = JSON.parse(row.dialog_json);
    const firstUser = dialog.find((t: any) => t.role === 'user');
    return firstUser?.content?.slice(0, 120) || null;
  } catch { return null; }
}

// ========== v3: 人工标注 ==========

export function updateAnnotation(params: {
  runId: string;
  caseId: string;
  humanStatus: 'pass' | 'fail' | 'pending';
  humanTags?: string[];
  humanNote?: string;
  firstFailTurn?: number;
}) {
  const db = getDb();
  db.prepare(
    `UPDATE eval_results SET
      human_status = ?,
      human_tags = ?,
      human_note = ?,
      first_fail_turn = ?,
      annotated_at = datetime('now')
    WHERE run_id = ? AND case_id = ?`
  ).run(
    params.humanStatus,
    params.humanTags ? JSON.stringify(params.humanTags) : null,
    params.humanNote || null,
    params.firstFailTurn ?? null,
    params.runId,
    params.caseId,
  );
}

/** 删除实验及其所有结果 */
export function deleteRun(runId: string): { deletedResults: number; deletedRun: boolean } {
  const db = getDb();
  const resultInfo = db.prepare('DELETE FROM eval_results WHERE run_id = ?').run(runId);
  const runInfo = db.prepare('DELETE FROM eval_runs WHERE id = ?').run(runId);
  return {
    deletedResults: resultInfo.changes,
    deletedRun: runInfo.changes > 0,
  };
}

export function getAnnotationStats(runId: string): { total: number; annotated: number; pass: number; fail: number; pending: number } {
  const rows = getDb().prepare(`
    SELECT human_status as status, COUNT(DISTINCT case_id) as cnt
    FROM eval_results WHERE run_id = ? GROUP BY human_status
  `).all(runId) as any[];

  const stats = { total: 0, annotated: 0, pass: 0, fail: 0, pending: 0 };
  for (const row of rows) {
    stats.total += row.cnt;
    if (row.status === 'pass') { stats.pass += row.cnt; stats.annotated += row.cnt; }
    else if (row.status === 'fail') { stats.fail += row.cnt; stats.annotated += row.cnt; }
    else if (row.status === 'pending') { stats.pending += row.cnt; stats.annotated += row.cnt; }
  }
  return stats;
}
