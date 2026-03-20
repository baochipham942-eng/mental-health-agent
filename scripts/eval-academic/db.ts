/**
 * 学术评测数据集 SQLite 存储
 * 使用 bun:sqlite 零依赖
 */
import { Database } from 'bun:sqlite';
import * as path from 'path';

const DB_PATH = path.join(__dirname, 'eval-academic.db');

let _db: Database | null = null;

export function getDb(): Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.exec('PRAGMA journal_mode=WAL');
    _db.exec('PRAGMA foreign_keys=ON');
    initSchema(_db);
  }
  return _db;
}

function initSchema(db: Database) {
  db.exec(`
    -- 数据集元信息
    CREATE TABLE IF NOT EXISTS datasets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      language TEXT NOT NULL,       -- 'zh' | 'en'
      source_url TEXT,
      total_cases INTEGER DEFAULT 0,
      imported_at TEXT
    );

    -- 评测用例（统一格式）
    CREATE TABLE IF NOT EXISTS eval_cases (
      id TEXT PRIMARY KEY,                -- dataset:case_id
      dataset_id TEXT NOT NULL,
      category TEXT,                      -- 话题分类
      emotion_type TEXT,                  -- 情绪类型
      situation TEXT,                     -- 场景描述
      psychotherapy TEXT,                 -- 治疗流派
      dialog_json TEXT NOT NULL,          -- [{role, content, strategy?, emotion?}]
      metadata_json TEXT,                 -- 原始元数据
      turn_count INTEGER,
      FOREIGN KEY (dataset_id) REFERENCES datasets(id)
    );

    -- 评测运行记录
    CREATE TABLE IF NOT EXISTS eval_runs (
      id TEXT PRIMARY KEY,
      dataset_id TEXT,                    -- null = 全部
      started_at TEXT NOT NULL,
      finished_at TEXT,
      config_json TEXT,                   -- 运行配置
      summary_json TEXT,                  -- 汇总结果
      git_commit TEXT,
      status TEXT DEFAULT 'running'       -- running | completed | failed
    );

    -- 逐条评测结果
    CREATE TABLE IF NOT EXISTS eval_results (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      turn_index INTEGER NOT NULL,        -- 在第几轮切入
      user_input TEXT NOT NULL,
      ai_reply TEXT,
      reference_reply TEXT,               -- 原数据集的参考回复
      reference_strategy TEXT,            -- 原数据集标注的策略
      route_type TEXT,                    -- 我们的路由结果
      safety_label TEXT,
      ttft_ms INTEGER,
      total_ms INTEGER,
      -- Judge 结果（每个维度 Pass/Fail）
      judge_results_json TEXT,            -- {dimension: {result, critique, reasoning?}}
      -- 代码检查结果
      code_checks_json TEXT,              -- {check: pass/fail}
      -- v3: 加权综合分
      weighted_score REAL,               -- 0-1 归一化加权分
      -- v3: 人工标注
      human_status TEXT,                 -- 'pass' | 'fail' | 'pending' | null
      human_tags TEXT,                   -- JSON 数组 ["共情不足", "过早建议"]
      human_note TEXT,                   -- 人工备注
      first_fail_turn INTEGER,           -- 首次失败轮次
      annotated_at TEXT,                 -- 标注时间 ISO
      FOREIGN KEY (run_id) REFERENCES eval_runs(id),
      FOREIGN KEY (case_id) REFERENCES eval_cases(id)
    );

    -- 索引
    CREATE INDEX IF NOT EXISTS idx_cases_dataset ON eval_cases(dataset_id);
    CREATE INDEX IF NOT EXISTS idx_results_run ON eval_results(run_id);
    CREATE INDEX IF NOT EXISTS idx_results_case ON eval_results(case_id);
  `);

  // v3 迁移（幂等）
  migrateV3(db);
}

/** 迁移: 为已有数据库添加 v3 新字段（幂等） */
function migrateV3(db: Database) {
  const cols = db.query("PRAGMA table_info(eval_results)").all() as any[];
  const colNames = new Set(cols.map((c: any) => c.name));
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
      db.exec(col.sql);
    }
  }

  // eval_results: embedding_similarity
  if (!colNames.has('embedding_similarity')) {
    db.exec('ALTER TABLE eval_results ADD COLUMN embedding_similarity REAL');
  }

  // eval_runs 新字段
  const runCols = db.query("PRAGMA table_info(eval_runs)").all() as any[];
  const runColNames = new Set(runCols.map((c: any) => c.name));
  if (!runColNames.has('model')) db.exec('ALTER TABLE eval_runs ADD COLUMN model TEXT');
  if (!runColNames.has('mode')) db.exec("ALTER TABLE eval_runs ADD COLUMN mode TEXT DEFAULT 'benchmark'");
  if (!runColNames.has('version')) db.exec('ALTER TABLE eval_runs ADD COLUMN version TEXT');
  if (!runColNames.has('prompt_snapshot')) db.exec('ALTER TABLE eval_runs ADD COLUMN prompt_snapshot TEXT');
  if (!runColNames.has('prompt_hash')) db.exec('ALTER TABLE eval_runs ADD COLUMN prompt_hash TEXT');
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ========== 数据集操作 ==========

export function upsertDataset(id: string, name: string, language: string, sourceUrl: string) {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO datasets (id, name, language, source_url, imported_at)
     VALUES (?, ?, ?, ?, datetime('now'))`,
    [id, name, language, sourceUrl]
  );
}

export function updateDatasetCount(id: string) {
  const db = getDb();
  const row = db.query('SELECT COUNT(*) as cnt FROM eval_cases WHERE dataset_id = ?').get(id) as any;
  db.run('UPDATE datasets SET total_cases = ? WHERE id = ?', [row.cnt, id]);
}

export function getDatasets(): any[] {
  return getDb().query('SELECT * FROM datasets ORDER BY id').all();
}

// ========== 用例操作 ==========

export interface EvalCaseRow {
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

export interface DialogTurn {
  role: 'user' | 'assistant';
  content: string;
  strategy?: string;
  emotion?: string;
}

export function insertCase(c: {
  id: string;
  datasetId: string;
  category?: string;
  emotionType?: string;
  situation?: string;
  psychotherapy?: string;
  dialog: DialogTurn[];
  metadata?: any;
}) {
  const db = getDb();
  db.run(
    `INSERT OR REPLACE INTO eval_cases (id, dataset_id, category, emotion_type, situation, psychotherapy, dialog_json, metadata_json, turn_count)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      c.id,
      c.datasetId,
      c.category || null,
      c.emotionType || null,
      c.situation || null,
      c.psychotherapy || null,
      JSON.stringify(c.dialog),
      c.metadata ? JSON.stringify(c.metadata) : null,
      c.dialog.filter(t => t.role === 'user').length,
    ]
  );
}

export function getCases(datasetId?: string, limit?: number): EvalCaseRow[] {
  const db = getDb();
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
  }
  return db.query(sql).all(...params) as EvalCaseRow[];
}

export function getCaseCount(datasetId?: string): number {
  const db = getDb();
  if (datasetId) {
    const row = db.query('SELECT COUNT(*) as cnt FROM eval_cases WHERE dataset_id = ?').get(datasetId) as any;
    return row.cnt;
  }
  const row = db.query('SELECT COUNT(*) as cnt FROM eval_cases').get() as any;
  return row.cnt;
}

// ========== 运行记录操作 ==========

export function createRun(id: string, datasetId: string | null, config: any, gitCommit?: string, promptSnapshot?: string, promptHash?: string): string {
  const db = getDb();
  db.run(
    `INSERT INTO eval_runs (id, dataset_id, started_at, config_json, git_commit, status, prompt_snapshot, prompt_hash)
     VALUES (?, ?, datetime('now'), ?, ?, 'running', ?, ?)`,
    [id, datasetId, JSON.stringify(config), gitCommit || null, promptSnapshot || null, promptHash || null]
  );
  return id;
}

export function finishRun(id: string, summary: any, status = 'completed') {
  const db = getDb();
  db.run(
    `UPDATE eval_runs SET finished_at = datetime('now'), summary_json = ?, status = ? WHERE id = ?`,
    [JSON.stringify(summary), status, id]
  );
}

export function getRecentRuns(limit = 10): any[] {
  return getDb().query('SELECT * FROM eval_runs ORDER BY started_at DESC LIMIT ?').all(limit);
}

// ========== 结果操作 ==========

export function insertResult(r: {
  runId: string;
  caseId: string;
  turnIndex: number;
  userInput: string;
  aiReply?: string;
  referenceReply?: string;
  referenceStrategy?: string;
  routeType?: string;
  safetyLabel?: string;
  ttftMs?: number;
  totalMs?: number;
  judgeResults?: Record<string, { result: string; critique: string }>;
  codeChecks?: Record<string, string>;
  agentTrace?: string; // JSON 字符串
  embeddingSimilarity?: number;
}) {
  const db = getDb();
  db.run(
    `INSERT INTO eval_results (run_id, case_id, turn_index, user_input, ai_reply, reference_reply, reference_strategy, route_type, safety_label, ttft_ms, total_ms, judge_results_json, code_checks_json, agent_trace_json, embedding_similarity)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      r.runId, r.caseId, r.turnIndex, r.userInput,
      r.aiReply || null, r.referenceReply || null, r.referenceStrategy || null,
      r.routeType || null, r.safetyLabel || null,
      r.ttftMs || null, r.totalMs || null,
      r.judgeResults ? JSON.stringify(r.judgeResults) : null,
      r.codeChecks ? JSON.stringify(r.codeChecks) : null,
      r.agentTrace || null,
      r.embeddingSimilarity ?? null,
    ]
  );
}

export function getRunResults(runId: string): any[] {
  return getDb().query('SELECT * FROM eval_results WHERE run_id = ? ORDER BY case_id, turn_index').all(runId);
}

/** 更新单条结果的评分（用于 rescore） */
export function updateResultScores(
  runId: string, caseId: string, turnIndex: number,
  codeChecks: Record<string, string>,
  judgeResults: Record<string, { result: string; critique: string }>,
  weightedScore: number
) {
  const db = getDb();
  db.run(
    `UPDATE eval_results SET
      code_checks_json = ?,
      judge_results_json = ?,
      weighted_score = ?
    WHERE run_id = ? AND case_id = ? AND turn_index = ?`,
    [JSON.stringify(codeChecks), JSON.stringify(judgeResults), weightedScore, runId, caseId, turnIndex]
  );
}

/** 获取某个 run 下按 case 聚合的结果（用例级别） */
export function getRunCaseSummaries(runId: string): any[] {
  return getDb().query(`
    SELECT
      case_id,
      COUNT(*) as turn_count,
      MIN(ttft_ms) as min_ttft,
      AVG(ttft_ms) as avg_ttft,
      SUM(total_ms) as total_ms,
      GROUP_CONCAT(DISTINCT human_status) as human_statuses,
      MAX(weighted_score) as weighted_score,
      MAX(human_note) as human_note,
      MAX(annotated_at) as annotated_at
    FROM eval_results
    WHERE run_id = ?
    GROUP BY case_id
    ORDER BY case_id
  `).all(runId);
}

/** 获取单个用例在某 run 下的所有轮次结果 */
export function getCaseResults(runId: string, caseId: string): any[] {
  return getDb().query(
    'SELECT * FROM eval_results WHERE run_id = ? AND case_id = ? ORDER BY turn_index'
  ).all(runId, caseId);
}

// ========== v3: 人工标注操作 ==========

export function updateAnnotation(params: {
  runId: string;
  caseId: string;
  humanStatus: 'pass' | 'fail' | 'pending';
  humanTags?: string[];
  humanNote?: string;
  firstFailTurn?: number;
}) {
  const db = getDb();
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
}

/** 获取标注统计 */
export function getAnnotationStats(runId: string): { total: number; annotated: number; pass: number; fail: number; pending: number } {
  const db = getDb();
  const rows = db.query(`
    SELECT human_status, COUNT(DISTINCT case_id) as cnt
    FROM eval_results
    WHERE run_id = ?
    GROUP BY human_status
  `).all(runId) as any[];

  const stats = { total: 0, annotated: 0, pass: 0, fail: 0, pending: 0 };
  for (const row of rows) {
    stats.total += row.cnt;
    if (row.human_status === 'pass') { stats.pass += row.cnt; stats.annotated += row.cnt; }
    else if (row.human_status === 'fail') { stats.fail += row.cnt; stats.annotated += row.cnt; }
    else if (row.human_status === 'pending') { stats.pending += row.cnt; stats.annotated += row.cnt; }
  }
  return stats;
}

/** 获取某 run 下所有 case 的 ID 列表（用于导航） */
export function getRunCaseIds(runId: string): string[] {
  const rows = getDb().query(
    'SELECT DISTINCT case_id FROM eval_results WHERE run_id = ? ORDER BY case_id'
  ).all(runId) as any[];
  return rows.map(r => r.case_id);
}
