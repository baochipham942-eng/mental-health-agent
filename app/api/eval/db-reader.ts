/**
 * Node.js 端读取/写入 eval-academic SQLite 数据库
 * v3: 支持读写（人工标注需要写入）
 *
 * 使用 sql.js（纯 WASM SQLite）替代 better-sqlite3，避免原生模块跨平台问题。
 *
 * 路径策略:
 * - 开发环境: scripts/eval-academic/eval-academic.db（可读写）
 * - 生产环境: data/eval/eval-academic.db（deploy:build 复制）
 *   写操作自动 copy 到 /tmp 后读写
 */
import initSqlJs, { type Database as SqlJsDatabase } from 'sql.js';
import path from 'path';
import fs from 'fs';

const IS_PROD = process.env.NODE_ENV === 'production';
const DEV_DB_PATH = path.join(/* turbopackIgnore: true */ process.cwd(), 'scripts', 'eval-academic', 'eval-academic.db');
const PROD_BUNDLE_PATH = path.join(/* turbopackIgnore: true */ process.cwd(), 'data', 'eval', 'eval-academic.db');
const PROD_TMP_PATH = '/tmp/eval-academic.db';

function resolveDbPath(): string | null {
  const sourcePath = fs.existsSync(PROD_BUNDLE_PATH)
    ? PROD_BUNDLE_PATH
    : fs.existsSync(DEV_DB_PATH)
      ? DEV_DB_PATH
      : null;

  if (!IS_PROD) return sourcePath;

  if (sourcePath) {
    const shouldRefreshTmp =
      !fs.existsSync(PROD_TMP_PATH) ||
      fs.statSync(sourcePath).mtimeMs > fs.statSync(PROD_TMP_PATH).mtimeMs;

    if (shouldRefreshTmp) {
      fs.copyFileSync(sourcePath, PROD_TMP_PATH);
    }
    return PROD_TMP_PATH;
  }
  if (fs.existsSync(PROD_TMP_PATH)) return PROD_TMP_PATH;
  return null;
}

/** 定位 sql-wasm.wasm 文件，兼容不同包管理器布局 */
function resolveWasmPath(): Buffer | undefined {
  const candidates = [
    path.join(/* turbopackIgnore: true */ process.cwd(), 'node_modules', 'sql.js', 'dist', 'sql-wasm.wasm'),
    // pnpm 嵌套路径（Vercel）
    ...(() => {
      try {
        const sqlJsMain = require.resolve(/* turbopackIgnore: true */ 'sql.js');
        return [path.join(path.dirname(sqlJsMain), 'sql-wasm.wasm')];
      } catch { return []; }
    })(),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return fs.readFileSync(p);
  }
  return undefined;
}

let _db: SqlJsDatabase | null = null;
let _dbPath: string | null = null;
let _initFailed = false;

/** 持久化：将内存中的 db 写回磁盘 */
function persistDb() {
  if (_db && _dbPath) {
    const data = _db.export();
    fs.writeFileSync(_dbPath, Buffer.from(data));
  }
}

async function initDb(): Promise<SqlJsDatabase | null> {
  if (_db) return _db;
  if (_initFailed) return null;

  _dbPath = resolveDbPath();
  if (!_dbPath) {
    _initFailed = true;
    return null;
  }

  const wasmBinary = resolveWasmPath();
  const SQL = await initSqlJs(wasmBinary ? { wasmBinary } : undefined);
  const buffer = fs.readFileSync(_dbPath);
  _db = new SQL.Database(buffer);
  _db.run('PRAGMA foreign_keys = ON');
  migrateV3(_db);
  return _db;
}

/** 确保 db 已初始化，数据库不可用时抛出友好错误 */
async function ensureDb(): Promise<SqlJsDatabase> {
  if (_db) return _db;
  const db = await initDb();
  if (!db) throw new Error('评测数据库不可用（当前环境未部署 eval db）');
  return db;
}

function migrateV3(db: SqlJsDatabase) {
  const cols = db.exec('PRAGMA table_info(eval_results)');
  const colNames = new Set(
    (cols[0]?.values || []).map((row: any) => row[1])
  );
  const newCols = [
    { name: 'weighted_score', sql: 'ALTER TABLE eval_results ADD COLUMN weighted_score REAL' },
    { name: 'human_status', sql: 'ALTER TABLE eval_results ADD COLUMN human_status TEXT' },
    { name: 'human_tags', sql: 'ALTER TABLE eval_results ADD COLUMN human_tags TEXT' },
    { name: 'human_note', sql: 'ALTER TABLE eval_results ADD COLUMN human_note TEXT' },
    { name: 'first_fail_turn', sql: 'ALTER TABLE eval_results ADD COLUMN first_fail_turn INTEGER' },
    { name: 'annotated_at', sql: 'ALTER TABLE eval_results ADD COLUMN annotated_at TEXT' },
    { name: 'agent_trace_json', sql: 'ALTER TABLE eval_results ADD COLUMN agent_trace_json TEXT' },
  ];
  for (const col of newCols) {
    if (!colNames.has(col.name)) {
      try { db.run(col.sql); } catch { /* column might already exist */ }
    }
  }
  const runCols = db.exec('PRAGMA table_info(eval_runs)');
  const runColNames = new Set(
    (runCols[0]?.values || []).map((row: any) => row[1])
  );
  if (!runColNames.has('model')) try { db.run('ALTER TABLE eval_runs ADD COLUMN model TEXT'); } catch {}
  if (!runColNames.has('mode')) try { db.run("ALTER TABLE eval_runs ADD COLUMN mode TEXT DEFAULT 'benchmark'"); } catch {}
  if (!runColNames.has('version')) try { db.run('ALTER TABLE eval_runs ADD COLUMN version TEXT'); } catch {}
}

/** sql.js 查询结果转为对象数组 */
function queryAll(db: SqlJsDatabase, sql: string, params?: any[]): any[] {
  const stmt = db.prepare(sql);
  if (params) stmt.bind(params);
  const rows: any[] = [];
  while (stmt.step()) {
    rows.push(stmt.getAsObject());
  }
  stmt.free();
  return rows;
}

function queryOne(db: SqlJsDatabase, sql: string, params?: any[]): any | undefined {
  const rows = queryAll(db, sql, params);
  return rows[0];
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

export async function getDatasets(): Promise<DatasetInfo[]> {
  const db = await ensureDb();
  return queryAll(db, 'SELECT * FROM datasets ORDER BY id') as DatasetInfo[];
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

export async function getCases(datasetId?: string, limit?: number, offset?: number): Promise<CaseRow[]> {
  const db = await ensureDb();
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
  return queryAll(db, sql, params) as CaseRow[];
}

export async function getCaseById(caseId: string): Promise<CaseRow | undefined> {
  const db = await ensureDb();
  return queryOne(db, 'SELECT * FROM eval_cases WHERE id = ?', [caseId]) as CaseRow | undefined;
}

export async function getCaseCount(datasetId?: string): Promise<number> {
  const db = await ensureDb();
  if (datasetId) {
    const row = queryOne(db, 'SELECT COUNT(*) as cnt FROM eval_cases WHERE dataset_id = ?', [datasetId]);
    return row?.cnt ?? 0;
  }
  const row = queryOne(db, 'SELECT COUNT(*) as cnt FROM eval_cases');
  return row?.cnt ?? 0;
}

export async function searchCases(query: string, datasetId?: string): Promise<CaseRow[]> {
  const db = await ensureDb();
  let sql = 'SELECT * FROM eval_cases WHERE (category LIKE ? OR situation LIKE ? OR id LIKE ?)';
  const params: any[] = [`%${query}%`, `%${query}%`, `%${query}%`];
  if (datasetId) {
    sql += ' AND dataset_id = ?';
    params.push(datasetId);
  }
  sql += ' ORDER BY id LIMIT 50';
  return queryAll(db, sql, params) as CaseRow[];
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

export async function getRuns(limit = 50): Promise<RunRow[]> {
  const db = await ensureDb();
  return queryAll(db, 'SELECT * FROM eval_runs ORDER BY started_at DESC LIMIT ?', [limit]) as RunRow[];
}

export async function getRunById(runId: string): Promise<RunRow | undefined> {
  const db = await ensureDb();
  return queryOne(db, 'SELECT * FROM eval_runs WHERE id = ?', [runId]) as RunRow | undefined;
}

// ========== v3: Results ==========

export async function getRunResults(runId: string): Promise<any[]> {
  const db = await ensureDb();
  return queryAll(db,
    'SELECT * FROM eval_results WHERE run_id = ? ORDER BY case_id, turn_index',
    [runId]
  );
}

export async function getRunCaseIds(runId: string): Promise<string[]> {
  const db = await ensureDb();
  const rows = queryAll(db,
    'SELECT DISTINCT case_id FROM eval_results WHERE run_id = ? ORDER BY case_id',
    [runId]
  );
  return rows.map(r => r.case_id);
}

export async function getCaseResults(runId: string, caseId: string): Promise<any[]> {
  const db = await ensureDb();
  return queryAll(db,
    'SELECT * FROM eval_results WHERE run_id = ? AND case_id = ? ORDER BY turn_index',
    [runId, caseId]
  );
}

/** 按 case 聚合的摘要（用例列表用） */
export async function getRunCaseSummaries(runId: string): Promise<any[]> {
  const db = await ensureDb();
  return queryAll(db, `
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
  `, [runId]);
}

/** 获取用例的首轮用户 prompt（数据集列表展示用） */
export async function getCaseFirstPrompt(caseId: string): Promise<string | null> {
  const row = await getCaseById(caseId);
  if (!row) return null;
  try {
    const dialog = JSON.parse(row.dialog_json);
    const firstUser = dialog.find((t: any) => t.role === 'user');
    return firstUser?.content?.slice(0, 120) || null;
  } catch { return null; }
}

// ========== v3: 人工标注 ==========

export async function updateAnnotation(params: {
  runId: string;
  caseId: string;
  humanStatus: 'pass' | 'fail' | 'pending';
  humanTags?: string[];
  humanNote?: string;
  firstFailTurn?: number;
}): Promise<void> {
  const db = await ensureDb();
  db.run(
    `UPDATE eval_results SET
      human_status = ?,
      human_tags = ?,
      human_note = ?,
      first_fail_turn = ?,
      annotated_at = datetime('now')
    WHERE run_id = ? AND case_id = ?`,
    [
      params.humanStatus,
      params.humanTags ? JSON.stringify(params.humanTags) : null,
      params.humanNote || null,
      params.firstFailTurn ?? null,
      params.runId,
      params.caseId,
    ]
  );
  persistDb();
}

/** 删除实验及其所有结果 */
export async function deleteRun(runId: string): Promise<{ deletedResults: number; deletedRun: boolean }> {
  const db = await ensureDb();
  db.run('DELETE FROM eval_results WHERE run_id = ?', [runId]);
  const deletedResults = db.getRowsModified();
  db.run('DELETE FROM eval_runs WHERE id = ?', [runId]);
  const deletedRun = db.getRowsModified() > 0;
  persistDb();
  return { deletedResults, deletedRun };
}

export async function getAnnotationStats(runId: string): Promise<{ total: number; annotated: number; pass: number; fail: number; pending: number }> {
  const db = await ensureDb();
  const rows = queryAll(db, `
    SELECT human_status as status, COUNT(DISTINCT case_id) as cnt
    FROM eval_results WHERE run_id = ? GROUP BY human_status
  `, [runId]);

  const stats = { total: 0, annotated: 0, pass: 0, fail: 0, pending: 0 };
  for (const row of rows) {
    stats.total += row.cnt;
    if (row.status === 'pass') { stats.pass += row.cnt; stats.annotated += row.cnt; }
    else if (row.status === 'fail') { stats.fail += row.cnt; stats.annotated += row.cnt; }
    else if (row.status === 'pending') { stats.pending += row.cnt; stats.annotated += row.cnt; }
  }
  return stats;
}
