/**
 * 数据集版本 SQLite Store
 *
 * 在同一个 eval SQLite 数据库中管理数据集版本和版本用例。
 * 支持版本创建、用例快照、版本对比等功能。
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
    ensureTables(_db);
  }
  return _db;
}

function ensureTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS dataset_versions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      parent_id TEXT,
      case_count INTEGER NOT NULL DEFAULT 0,
      created_by TEXT NOT NULL DEFAULT 'admin',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (parent_id) REFERENCES dataset_versions(id)
    );

    CREATE TABLE IF NOT EXISTS dataset_version_cases (
      id TEXT PRIMARY KEY,
      version_id TEXT NOT NULL,
      case_id TEXT NOT NULL,
      scenario TEXT NOT NULL,
      user_input TEXT NOT NULL,
      expected_behavior TEXT,
      tags TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (version_id) REFERENCES dataset_versions(id),
      UNIQUE(version_id, case_id)
    );

    CREATE INDEX IF NOT EXISTS idx_dvc_version_id ON dataset_version_cases(version_id);
    CREATE INDEX IF NOT EXISTS idx_dv_created_at ON dataset_versions(created_at);
  `);
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface DatasetVersion {
  id: string;
  name: string;
  description: string | null;
  parentId: string | null;
  caseCount: number;
  createdBy: string;
  createdAt: string;
}

export interface DatasetVersionCase {
  id: string;
  versionId: string;
  caseId: string;
  scenario: string;
  userInput: string;
  expectedBehavior: string | null;
  tags: string[];
  createdAt: string;
}

export interface CreateVersionInput {
  name: string;
  description?: string;
  parentId?: string;
}

export interface AddCaseInput {
  caseId: string;
  scenario: string;
  userInput: string;
  expectedBehavior?: string;
  tags?: string[];
}

export interface CompareCasesResult {
  added: string[];
  removed: string[];
  common: string[];
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function toVersion(raw: any): DatasetVersion {
  return {
    id: raw.id,
    name: raw.name,
    description: raw.description,
    parentId: raw.parent_id,
    caseCount: raw.case_count,
    createdBy: raw.created_by,
    createdAt: raw.created_at,
  };
}

function toCase(raw: any): DatasetVersionCase {
  return {
    id: raw.id,
    versionId: raw.version_id,
    caseId: raw.case_id,
    scenario: raw.scenario,
    userInput: raw.user_input,
    expectedBehavior: raw.expected_behavior,
    tags: parseJson(raw.tags),
    createdAt: raw.created_at,
  };
}

function parseJson(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

// --------------------------------------------------------------------------
// 版本管理
// --------------------------------------------------------------------------

/** 创建版本 */
export function createVersion(input: CreateVersionInput): DatasetVersion {
  const db = getDb();
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO dataset_versions (id, name, description, parent_id, case_count, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `).run(id, input.name, input.description ?? null, input.parentId ?? null, now);

  return findVersionById(id)!;
}

/** 按 ID 查找版本 */
export function findVersionById(id: string): DatasetVersion | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM dataset_versions WHERE id = ?').get(id) as any;
  return row ? toVersion(row) : null;
}

/** 查询所有版本（按创建时间倒序） */
export function findAllVersions(): DatasetVersion[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM dataset_versions ORDER BY created_at DESC').all() as any[];
  return rows.map(toVersion);
}

/** 查找最新版本 */
export function findLatestVersion(): DatasetVersion | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM dataset_versions ORDER BY created_at DESC LIMIT 1').get() as any;
  return row ? toVersion(row) : null;
}

/** 删除版本（级联删除用例） */
export function deleteVersion(id: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM dataset_version_cases WHERE version_id = ?').run(id);
    db.prepare('DELETE FROM dataset_versions WHERE id = ?').run(id);
  });
  tx();
}

// --------------------------------------------------------------------------
// 用例管理
// --------------------------------------------------------------------------

/** 批量添加用例到版本 */
export function addCasesToVersion(versionId: string, cases: AddCaseInput[]): number {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR IGNORE INTO dataset_version_cases (id, version_id, case_id, scenario, user_input, expected_behavior, tags)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  const tx = db.transaction(() => {
    for (const c of cases) {
      const result = insert.run(
        crypto.randomUUID(),
        versionId,
        c.caseId,
        c.scenario,
        c.userInput,
        c.expectedBehavior ?? null,
        JSON.stringify(c.tags ?? []),
      );
      count += result.changes;
    }
    // 更新版本的 case_count
    db.prepare('UPDATE dataset_versions SET case_count = (SELECT COUNT(*) FROM dataset_version_cases WHERE version_id = ?) WHERE id = ?')
      .run(versionId, versionId);
  });
  tx();

  return count;
}

/** 查询版本下所有用例 */
export function findCasesByVersionId(versionId: string): DatasetVersionCase[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM dataset_version_cases WHERE version_id = ? ORDER BY created_at ASC').all(versionId) as any[];
  return rows.map(toCase);
}

/** 从版本中移除用例 */
export function removeCaseFromVersion(versionId: string, caseId: string): void {
  const db = getDb();
  const tx = db.transaction(() => {
    db.prepare('DELETE FROM dataset_version_cases WHERE version_id = ? AND case_id = ?').run(versionId, caseId);
    db.prepare('UPDATE dataset_versions SET case_count = (SELECT COUNT(*) FROM dataset_version_cases WHERE version_id = ?) WHERE id = ?')
      .run(versionId, versionId);
  });
  tx();
}

/** 统计版本用例数 */
export function countCasesByVersionId(versionId: string): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM dataset_version_cases WHERE version_id = ?').get(versionId) as any;
  return row.cnt;
}

// --------------------------------------------------------------------------
// 版本对比
// --------------------------------------------------------------------------

/** 对比两个版本的用例差异 */
export function compareCases(versionIdA: string, versionIdB: string): CompareCasesResult {
  const db = getDb();

  const casesA = db.prepare('SELECT case_id FROM dataset_version_cases WHERE version_id = ?').all(versionIdA) as any[];
  const casesB = db.prepare('SELECT case_id FROM dataset_version_cases WHERE version_id = ?').all(versionIdB) as any[];

  const setA = new Set(casesA.map((r: any) => r.case_id));
  const setB = new Set(casesB.map((r: any) => r.case_id));

  const added: string[] = [];
  const removed: string[] = [];
  const common: string[] = [];

  for (const id of setB) {
    if (setA.has(id)) common.push(id);
    else added.push(id);
  }
  for (const id of setA) {
    if (!setB.has(id)) removed.push(id);
  }

  return { added, removed, common };
}
