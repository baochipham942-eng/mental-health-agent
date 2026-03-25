/**
 * Prompt CI Runs SQLite Store
 *
 * 管理 Prompt 版本注册后自动触发的评测运行记录。
 * 复用 eval-store.ts 的同一 SQLite 数据库文件，独立建表。
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as crypto from 'crypto';

// --------------------------------------------------------------------------
// Database Connection（复用 eval-store.ts 的同一 SQLite 文件）
// --------------------------------------------------------------------------

const DB_PATH = process.env.EVAL_DB_PATH
  || path.join(process.cwd(), 'scripts/eval-academic/eval-academic.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    ensureTable(_db);
  }
  return _db;
}

function ensureTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS prompt_ci_runs (
      id                TEXT PRIMARY KEY,
      prompt_version_id TEXT NOT NULL,
      prompt_name       TEXT NOT NULL,
      status            TEXT NOT NULL DEFAULT 'PENDING',
      total_cases       INTEGER NOT NULL DEFAULT 0,
      passed_cases      INTEGER NOT NULL DEFAULT 0,
      failed_cases      INTEGER NOT NULL DEFAULT 0,
      avg_score         REAL,
      started_at        TEXT,
      finished_at       TEXT,
      created_at        TEXT NOT NULL DEFAULT (datetime('now')),
      error_message     TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ci_version_id ON prompt_ci_runs(prompt_version_id);
    CREATE INDEX IF NOT EXISTS idx_ci_status     ON prompt_ci_runs(status);
    CREATE INDEX IF NOT EXISTS idx_ci_created_at ON prompt_ci_runs(created_at);
  `);
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export type CIRunStatus = 'PENDING' | 'RUNNING' | 'PASSED' | 'FAILED' | 'SKIPPED';

export interface CIRunRow {
  id: string;
  promptVersionId: string;
  promptName: string;
  status: CIRunStatus;
  totalCases: number;
  passedCases: number;
  failedCases: number;
  avgScore: number | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  errorMessage: string | null;
}

export interface CreateCIRunInput {
  promptVersionId: string;
  promptName: string;
  status?: CIRunStatus;
}

export interface UpdateCIRunInput {
  status?: CIRunStatus;
  totalCases?: number;
  passedCases?: number;
  failedCases?: number;
  avgScore?: number | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  errorMessage?: string | null;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function toCIRunRow(raw: any): CIRunRow {
  return {
    id: raw.id,
    promptVersionId: raw.prompt_version_id,
    promptName: raw.prompt_name,
    status: raw.status as CIRunStatus,
    totalCases: raw.total_cases,
    passedCases: raw.passed_cases,
    failedCases: raw.failed_cases,
    avgScore: raw.avg_score,
    startedAt: raw.started_at,
    finishedAt: raw.finished_at,
    createdAt: raw.created_at,
    errorMessage: raw.error_message,
  };
}

// --------------------------------------------------------------------------
// CRUD Operations
// --------------------------------------------------------------------------

/** 创建 CI Run 记录 */
export function createCIRun(input: CreateCIRunInput): CIRunRow {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO prompt_ci_runs (id, prompt_version_id, prompt_name, status, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, input.promptVersionId, input.promptName, input.status ?? 'PENDING', now);

  return findCIRunById(id)!;
}

/** 按 ID 查找 */
export function findCIRunById(id: string): CIRunRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM prompt_ci_runs WHERE id = ?').get(id) as any;
  return row ? toCIRunRow(row) : null;
}

/** 更新 CI Run */
export function updateCIRun(id: string, data: UpdateCIRunInput): CIRunRow | null {
  const db = getDb();
  const sets: string[] = [];
  const values: any[] = [];

  if (data.status !== undefined) { sets.push('status = ?'); values.push(data.status); }
  if (data.totalCases !== undefined) { sets.push('total_cases = ?'); values.push(data.totalCases); }
  if (data.passedCases !== undefined) { sets.push('passed_cases = ?'); values.push(data.passedCases); }
  if (data.failedCases !== undefined) { sets.push('failed_cases = ?'); values.push(data.failedCases); }
  if ('avgScore' in data) { sets.push('avg_score = ?'); values.push(data.avgScore ?? null); }
  if ('startedAt' in data) { sets.push('started_at = ?'); values.push(data.startedAt ?? null); }
  if ('finishedAt' in data) { sets.push('finished_at = ?'); values.push(data.finishedAt ?? null); }
  if ('errorMessage' in data) { sets.push('error_message = ?'); values.push(data.errorMessage ?? null); }

  if (sets.length === 0) return findCIRunById(id);

  values.push(id);
  db.prepare(`UPDATE prompt_ci_runs SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return findCIRunById(id);
}

/** 按版本 ID 查找所有 CI Runs */
export function findCIRunsByVersionId(versionId: string): CIRunRow[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM prompt_ci_runs WHERE prompt_version_id = ? ORDER BY created_at DESC'
  ).all(versionId) as any[];
  return rows.map(toCIRunRow);
}

/** 查询最近 CI Runs */
export function findRecentCIRuns(limit: number = 20): CIRunRow[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM prompt_ci_runs ORDER BY created_at DESC LIMIT ?'
  ).all(limit) as any[];
  return rows.map(toCIRunRow);
}

/** 按状态统计 */
export function countCIRunsByStatus(): Record<string, number> {
  const db = getDb();
  const rows = db.prepare(
    'SELECT status, COUNT(*) as cnt FROM prompt_ci_runs GROUP BY status'
  ).all() as any[];

  const result: Record<string, number> = {};
  for (const r of rows) {
    result[r.status] = r.cnt;
  }
  return result;
}
