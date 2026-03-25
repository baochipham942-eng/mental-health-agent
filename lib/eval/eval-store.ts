/**
 * Phase 2d: ConversationEvaluation SQLite Store
 *
 * 将 ConversationEvaluation 从 PostgreSQL/Prisma 迁移到 SQLite。
 * 使用 better-sqlite3（与 db-writer.ts 共享同一运行时）。
 *
 * 表结构 1:1 映射 Prisma schema，字段名 snake_case。
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as crypto from 'crypto';

// --------------------------------------------------------------------------
// Database Connection（复用 db-writer.ts 的同一 SQLite 文件）
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
    CREATE TABLE IF NOT EXISTS conversation_evaluations (
      id                  TEXT PRIMARY KEY,
      conversation_id     TEXT NOT NULL UNIQUE,
      user_id             TEXT NOT NULL DEFAULT '',

      -- 评估分数（0-10）
      legal_score         INTEGER NOT NULL DEFAULT 0,
      ethical_score       INTEGER NOT NULL DEFAULT 0,
      professional_score  INTEGER NOT NULL DEFAULT 0,
      ux_score            INTEGER NOT NULL DEFAULT 0,

      -- 发现的问题（JSON 数组字符串）
      legal_issues        TEXT NOT NULL DEFAULT '[]',
      ethical_issues      TEXT NOT NULL DEFAULT '[]',
      professional_issues TEXT NOT NULL DEFAULT '[]',
      ux_issues           TEXT NOT NULL DEFAULT '[]',

      -- 整体评级
      overall_grade       TEXT NOT NULL DEFAULT 'EVALUATING',
      overall_score       REAL NOT NULL DEFAULT 0,

      -- 改进建议（JSON 数组字符串）
      improvements        TEXT NOT NULL DEFAULT '[]',

      -- 元数据
      evaluated_by        TEXT NOT NULL DEFAULT 'deepseek',
      evaluated_at        TEXT NOT NULL DEFAULT (datetime('now')),
      eval_source         TEXT NOT NULL DEFAULT 'manual',

      -- 审核状态
      review_status       TEXT NOT NULL DEFAULT 'PENDING',
      reviewed_at         TEXT,
      reviewed_by         TEXT,
      review_note         TEXT,

      -- Prompt 版本关联
      prompt_version_id   TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_ce_conversation_id ON conversation_evaluations(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_ce_overall_grade   ON conversation_evaluations(overall_grade);
    CREATE INDEX IF NOT EXISTS idx_ce_evaluated_at    ON conversation_evaluations(evaluated_at);
    CREATE INDEX IF NOT EXISTS idx_ce_overall_score   ON conversation_evaluations(overall_score);
    CREATE INDEX IF NOT EXISTS idx_ce_eval_source     ON conversation_evaluations(eval_source);
    CREATE INDEX IF NOT EXISTS idx_ce_user_id         ON conversation_evaluations(user_id);
    CREATE INDEX IF NOT EXISTS idx_ce_prompt_version  ON conversation_evaluations(prompt_version_id);

    CREATE TABLE IF NOT EXISTS eval_annotations (
      id            TEXT PRIMARY KEY,
      evaluation_id TEXT NOT NULL,
      dimension     TEXT NOT NULL,
      agree         INTEGER NOT NULL DEFAULT 1,
      human_score   INTEGER,
      note          TEXT,
      annotated_by  TEXT NOT NULL,
      annotated_at  TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(evaluation_id, dimension)
    );

    CREATE INDEX IF NOT EXISTS idx_ea_evaluation_id ON eval_annotations(evaluation_id);
  `);
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface EvalRow {
  id: string;
  conversationId: string;
  userId: string;
  legalScore: number;
  ethicalScore: number;
  professionalScore: number;
  uxScore: number;
  legalIssues: string[];
  ethicalIssues: string[];
  professionalIssues: string[];
  uxIssues: string[];
  overallGrade: string;
  overallScore: number;
  improvements: string[];
  evaluatedBy: string;
  evaluatedAt: Date;
  evalSource: string;
  reviewStatus: string;
  reviewedAt: Date | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  promptVersionId: string | null;
}

export interface CreateEvalInput {
  conversationId: string;
  userId: string;
  legalScore?: number;
  ethicalScore?: number;
  professionalScore?: number;
  uxScore?: number;
  legalIssues?: string[];
  ethicalIssues?: string[];
  professionalIssues?: string[];
  uxIssues?: string[];
  overallGrade?: string;
  overallScore?: number;
  improvements?: string[];
  evaluatedBy?: string;
  evalSource?: string;
  promptVersionId?: string | null;
}

export interface UpdateEvalInput {
  legalScore?: number;
  ethicalScore?: number;
  professionalScore?: number;
  uxScore?: number;
  legalIssues?: string[];
  ethicalIssues?: string[];
  professionalIssues?: string[];
  uxIssues?: string[];
  overallGrade?: string;
  overallScore?: number;
  improvements?: string[];
  evaluatedBy?: string;
  evaluatedAt?: Date;
  evalSource?: string;
  reviewStatus?: string;
  reviewedAt?: Date | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
  promptVersionId?: string | null;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID();
}

function parseJson(raw: string | null): string[] {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch { return []; }
}

function toEvalRow(raw: any): EvalRow {
  return {
    id: raw.id,
    conversationId: raw.conversation_id,
    userId: raw.user_id,
    legalScore: raw.legal_score,
    ethicalScore: raw.ethical_score,
    professionalScore: raw.professional_score,
    uxScore: raw.ux_score,
    legalIssues: parseJson(raw.legal_issues),
    ethicalIssues: parseJson(raw.ethical_issues),
    professionalIssues: parseJson(raw.professional_issues),
    uxIssues: parseJson(raw.ux_issues),
    overallGrade: raw.overall_grade,
    overallScore: raw.overall_score,
    improvements: parseJson(raw.improvements),
    evaluatedBy: raw.evaluated_by,
    evaluatedAt: new Date(raw.evaluated_at),
    evalSource: raw.eval_source,
    reviewStatus: raw.review_status,
    reviewedAt: raw.reviewed_at ? new Date(raw.reviewed_at) : null,
    reviewedBy: raw.reviewed_by,
    reviewNote: raw.review_note,
    promptVersionId: raw.prompt_version_id,
  };
}

// --------------------------------------------------------------------------
// CRUD Operations
// --------------------------------------------------------------------------

/** 创建评估记录 */
export function createEval(input: CreateEvalInput): EvalRow {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO conversation_evaluations (
      id, conversation_id, user_id,
      legal_score, ethical_score, professional_score, ux_score,
      legal_issues, ethical_issues, professional_issues, ux_issues,
      overall_grade, overall_score, improvements,
      evaluated_by, evaluated_at, eval_source,
      prompt_version_id
    ) VALUES (
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?,
      ?
    )
  `).run(
    id, input.conversationId, input.userId,
    input.legalScore ?? 0, input.ethicalScore ?? 0, input.professionalScore ?? 0, input.uxScore ?? 0,
    JSON.stringify(input.legalIssues ?? []), JSON.stringify(input.ethicalIssues ?? []),
    JSON.stringify(input.professionalIssues ?? []), JSON.stringify(input.uxIssues ?? []),
    input.overallGrade ?? 'EVALUATING', input.overallScore ?? 0,
    JSON.stringify(input.improvements ?? []),
    input.evaluatedBy ?? 'deepseek', now, input.evalSource ?? 'manual',
    input.promptVersionId ?? null,
  );

  return findById(id)!;
}

/** 按 ID 查找 */
export function findById(id: string): EvalRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM conversation_evaluations WHERE id = ?').get(id) as any;
  return row ? toEvalRow(row) : null;
}

/** 按 conversationId 查找（唯一） */
export function findByConversationId(conversationId: string): EvalRow | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM conversation_evaluations WHERE conversation_id = ?').get(conversationId) as any;
  return row ? toEvalRow(row) : null;
}

/** 按 conversationId 更新 */
export function updateByConversationId(conversationId: string, data: UpdateEvalInput): EvalRow | null {
  const db = getDb();
  const sets: string[] = [];
  const values: any[] = [];

  if (data.legalScore !== undefined) { sets.push('legal_score = ?'); values.push(data.legalScore); }
  if (data.ethicalScore !== undefined) { sets.push('ethical_score = ?'); values.push(data.ethicalScore); }
  if (data.professionalScore !== undefined) { sets.push('professional_score = ?'); values.push(data.professionalScore); }
  if (data.uxScore !== undefined) { sets.push('ux_score = ?'); values.push(data.uxScore); }
  if (data.legalIssues !== undefined) { sets.push('legal_issues = ?'); values.push(JSON.stringify(data.legalIssues)); }
  if (data.ethicalIssues !== undefined) { sets.push('ethical_issues = ?'); values.push(JSON.stringify(data.ethicalIssues)); }
  if (data.professionalIssues !== undefined) { sets.push('professional_issues = ?'); values.push(JSON.stringify(data.professionalIssues)); }
  if (data.uxIssues !== undefined) { sets.push('ux_issues = ?'); values.push(JSON.stringify(data.uxIssues)); }
  if (data.overallGrade !== undefined) { sets.push('overall_grade = ?'); values.push(data.overallGrade); }
  if (data.overallScore !== undefined) { sets.push('overall_score = ?'); values.push(data.overallScore); }
  if (data.improvements !== undefined) { sets.push('improvements = ?'); values.push(JSON.stringify(data.improvements)); }
  if (data.evaluatedBy !== undefined) { sets.push('evaluated_by = ?'); values.push(data.evaluatedBy); }
  if (data.evaluatedAt !== undefined) { sets.push('evaluated_at = ?'); values.push(data.evaluatedAt.toISOString()); }
  if (data.evalSource !== undefined) { sets.push('eval_source = ?'); values.push(data.evalSource); }
  if (data.reviewStatus !== undefined) { sets.push('review_status = ?'); values.push(data.reviewStatus); }
  if ('reviewedAt' in data) { sets.push('reviewed_at = ?'); values.push(data.reviewedAt?.toISOString() ?? null); }
  if ('reviewedBy' in data) { sets.push('reviewed_by = ?'); values.push(data.reviewedBy ?? null); }
  if ('reviewNote' in data) { sets.push('review_note = ?'); values.push(data.reviewNote ?? null); }
  if ('promptVersionId' in data) { sets.push('prompt_version_id = ?'); values.push(data.promptVersionId ?? null); }

  if (sets.length === 0) return findByConversationId(conversationId);

  values.push(conversationId);
  db.prepare(`UPDATE conversation_evaluations SET ${sets.join(', ')} WHERE conversation_id = ?`).run(...values);

  return findByConversationId(conversationId);
}

/** 按 ID 更新 */
export function updateById(id: string, data: UpdateEvalInput): EvalRow | null {
  const db = getDb();
  const sets: string[] = [];
  const values: any[] = [];

  if (data.legalScore !== undefined) { sets.push('legal_score = ?'); values.push(data.legalScore); }
  if (data.ethicalScore !== undefined) { sets.push('ethical_score = ?'); values.push(data.ethicalScore); }
  if (data.professionalScore !== undefined) { sets.push('professional_score = ?'); values.push(data.professionalScore); }
  if (data.uxScore !== undefined) { sets.push('ux_score = ?'); values.push(data.uxScore); }
  if (data.legalIssues !== undefined) { sets.push('legal_issues = ?'); values.push(JSON.stringify(data.legalIssues)); }
  if (data.ethicalIssues !== undefined) { sets.push('ethical_issues = ?'); values.push(JSON.stringify(data.ethicalIssues)); }
  if (data.professionalIssues !== undefined) { sets.push('professional_issues = ?'); values.push(JSON.stringify(data.professionalIssues)); }
  if (data.uxIssues !== undefined) { sets.push('ux_issues = ?'); values.push(JSON.stringify(data.uxIssues)); }
  if (data.overallGrade !== undefined) { sets.push('overall_grade = ?'); values.push(data.overallGrade); }
  if (data.overallScore !== undefined) { sets.push('overall_score = ?'); values.push(data.overallScore); }
  if (data.improvements !== undefined) { sets.push('improvements = ?'); values.push(JSON.stringify(data.improvements)); }
  if (data.evaluatedBy !== undefined) { sets.push('evaluated_by = ?'); values.push(data.evaluatedBy); }
  if (data.evaluatedAt !== undefined) { sets.push('evaluated_at = ?'); values.push(data.evaluatedAt.toISOString()); }
  if (data.evalSource !== undefined) { sets.push('eval_source = ?'); values.push(data.evalSource); }
  if (data.reviewStatus !== undefined) { sets.push('review_status = ?'); values.push(data.reviewStatus); }
  if ('reviewedAt' in data) { sets.push('reviewed_at = ?'); values.push(data.reviewedAt?.toISOString() ?? null); }
  if ('reviewedBy' in data) { sets.push('reviewed_by = ?'); values.push(data.reviewedBy ?? null); }
  if ('reviewNote' in data) { sets.push('review_note = ?'); values.push(data.reviewNote ?? null); }
  if ('promptVersionId' in data) { sets.push('prompt_version_id = ?'); values.push(data.promptVersionId ?? null); }

  if (sets.length === 0) return findById(id);

  values.push(id);
  db.prepare(`UPDATE conversation_evaluations SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return findById(id);
}

/** 批量删除（按 ID 列表） */
export function deleteManyByIds(ids: string[]): number {
  if (ids.length === 0) return 0;
  const db = getDb();
  const placeholders = ids.map(() => '?').join(',');
  const result = db.prepare(`DELETE FROM conversation_evaluations WHERE id IN (${placeholders})`).run(...ids);
  return result.changes;
}

/** 总数 */
export function countAll(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM conversation_evaluations').get() as any;
  return row.cnt;
}

/** 按条件计数 */
export function countByGrades(grades: string[]): number {
  if (grades.length === 0) return 0;
  const db = getDb();
  const placeholders = grades.map(() => '?').join(',');
  const row = db.prepare(`SELECT COUNT(*) as cnt FROM conversation_evaluations WHERE overall_grade IN (${placeholders})`).get(...grades) as any;
  return row.cnt;
}

/** 分页查询（按 evaluated_at 倒序） */
export function findManyPaginated(skip: number, take: number): EvalRow[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM conversation_evaluations ORDER BY evaluated_at DESC LIMIT ? OFFSET ?'
  ).all(take, skip) as any[];
  return rows.map(toEvalRow);
}

/** 查询已评估的 conversationId 集合（用于跨库过滤） */
export function getEvaluatedConversationIds(): Set<string> {
  const db = getDb();
  const rows = db.prepare('SELECT conversation_id FROM conversation_evaluations').all() as any[];
  return new Set(rows.map(r => r.conversation_id));
}

/** 按时间范围查询趋势数据 */
export function findForTrend(cutoffIso: string): Array<{
  evaluatedAt: Date;
  overallGrade: string;
  overallScore: number;
  evalSource: string;
}> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT evaluated_at, overall_grade, overall_score, eval_source
    FROM conversation_evaluations
    WHERE evaluated_at >= ? AND overall_grade NOT IN ('EVALUATING', 'FAILED')
    ORDER BY evaluated_at ASC
  `).all(cutoffIso) as any[];
  return rows.map(r => ({
    evaluatedAt: new Date(r.evaluated_at),
    overallGrade: r.overall_grade,
    overallScore: r.overall_score,
    evalSource: r.eval_source,
  }));
}

/** 按时间范围查询最近评估（倒序，限制条数） */
export function findRecent(cutoffIso: string, limit: number): EvalRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM conversation_evaluations
    WHERE evaluated_at >= ? AND overall_grade NOT IN ('EVALUATING', 'FAILED')
    ORDER BY evaluated_at DESC
    LIMIT ?
  `).all(cutoffIso, limit) as any[];
  return rows.map(toEvalRow);
}

/** 按 promptVersionId 查询完整评估记录 */
export function findByVersionId(versionId: string): EvalRow[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM conversation_evaluations
    WHERE prompt_version_id = ? AND overall_grade NOT IN ('EVALUATING', 'FAILED')
    ORDER BY evaluated_at DESC
  `).all(versionId) as any[];
  return rows.map(toEvalRow);
}

/** 按 promptVersionId 查询评分 */
export function findScoresByVersionId(versionId: string): Array<{ overallScore: number; overallGrade: string }> {
  const db = getDb();
  const rows = db.prepare(`
    SELECT overall_score, overall_grade
    FROM conversation_evaluations
    WHERE prompt_version_id = ? AND overall_grade NOT IN ('EVALUATING', 'FAILED')
  `).all(versionId) as any[];
  return rows.map(r => ({ overallScore: r.overall_score, overallGrade: r.overall_grade }));
}

/** 批量获取各 promptVersionId 的评分（用于 findAllVersionsWithScores） */
export function findScoresByVersionIds(versionIds: string[]): Map<string, number[]> {
  if (versionIds.length === 0) return new Map();
  const db = getDb();
  const placeholders = versionIds.map(() => '?').join(',');
  const rows = db.prepare(`
    SELECT prompt_version_id, overall_score
    FROM conversation_evaluations
    WHERE prompt_version_id IN (${placeholders})
      AND overall_grade NOT IN ('EVALUATING', 'FAILED')
  `).all(...versionIds) as any[];

  const result = new Map<string, number[]>();
  for (const r of rows) {
    const vid = r.prompt_version_id;
    if (!result.has(vid)) result.set(vid, []);
    result.get(vid)!.push(r.overall_score);
  }
  return result;
}

// --------------------------------------------------------------------------
// Annotation Types & CRUD（维度级人工标注）
// --------------------------------------------------------------------------

export type AnnotationDimension = 'legal' | 'ethical' | 'professional' | 'ux' | 'overall';

export interface AnnotationRow {
  id: string;
  evaluationId: string;
  dimension: AnnotationDimension;
  agree: boolean;
  humanScore: number | null;
  note: string | null;
  annotatedBy: string;
  annotatedAt: Date;
}

export interface UpsertAnnotationInput {
  evaluationId: string;
  dimension: string;
  agree: boolean;
  humanScore?: number;
  note?: string;
  annotatedBy: string;
}

export interface AnnotationStats {
  total: number;
  agreed: number;
  disagreed: number;
}

function toAnnotationRow(raw: any): AnnotationRow {
  return {
    id: raw.id,
    evaluationId: raw.evaluation_id,
    dimension: raw.dimension as AnnotationDimension,
    agree: raw.agree === 1,
    humanScore: raw.human_score,
    note: raw.note,
    annotatedBy: raw.annotated_by,
    annotatedAt: new Date(raw.annotated_at),
  };
}

/** 创建或更新维度标注（UPSERT） */
export function upsertAnnotation(input: UpsertAnnotationInput): void {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO eval_annotations (id, evaluation_id, dimension, agree, human_score, note, annotated_by, annotated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(evaluation_id, dimension) DO UPDATE SET
      agree = excluded.agree,
      human_score = excluded.human_score,
      note = excluded.note,
      annotated_by = excluded.annotated_by,
      annotated_at = excluded.annotated_at
  `).run(
    id,
    input.evaluationId,
    input.dimension,
    input.agree ? 1 : 0,
    input.humanScore ?? null,
    input.note ?? null,
    input.annotatedBy,
    now,
  );
}

/** 获取指定评估的所有标注 */
export function getAnnotations(evaluationId: string): AnnotationRow[] {
  const db = getDb();
  const rows = db.prepare(
    'SELECT * FROM eval_annotations WHERE evaluation_id = ? ORDER BY annotated_at ASC'
  ).all(evaluationId) as any[];
  return rows.map(toAnnotationRow);
}

/** 获取全局标注统计 */
export function getAnnotationStats(): AnnotationStats {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN agree = 1 THEN 1 ELSE 0 END) as agreed,
      SUM(CASE WHEN agree = 0 THEN 1 ELSE 0 END) as disagreed
    FROM eval_annotations
  `).get() as any;
  return {
    total: row.total || 0,
    agreed: row.agreed || 0,
    disagreed: row.disagreed || 0,
  };
}
