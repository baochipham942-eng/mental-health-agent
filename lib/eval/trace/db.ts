/**
 * 轨迹评测 SQLite 存储
 *
 * 与 lib/eval/db-writer.ts 使用同一个 SQLite 文件（better-sqlite3，WAL 模式）。
 * 新增 trace_evaluations 表，存储 pipeline 各步骤的评测结果。
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import type { TraceEvalResult } from './types';

// 与 db-writer.ts 共用同一个数据库路径
const DB_PATH = process.env.EVAL_DB_PATH
    || path.join(process.cwd(), 'scripts/eval-academic/eval-academic.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
    _db.pragma('foreign_keys = ON');
    ensureTraceTable(_db);
  }
  return _db;
}

/** 建表 + 索引（幂等） */
function ensureTraceTable(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS trace_evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      conversation_id TEXT NOT NULL,
      eval_run_id TEXT,
      trace_json TEXT NOT NULL,
      user_message TEXT NOT NULL,
      history_json TEXT,
      ai_reply TEXT,
      triage_result TEXT,
      triage_critique TEXT,
      safety_result TEXT,
      safety_critique TEXT,
      persona_result TEXT,
      persona_critique TEXT,
      emotion_result TEXT,
      emotion_critique TEXT,
      tool_result TEXT,
      tool_critique TEXT,
      guard_result TEXT,
      guard_critique TEXT,
      trace_score REAL,
      trace_grade TEXT,
      evaluated_by TEXT DEFAULT 'deepseek',
      eval_source TEXT DEFAULT 'auto',
      evaluated_at TEXT DEFAULT (datetime('now')),
      conv_eval_id TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_trace_conv ON trace_evaluations(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_trace_grade ON trace_evaluations(trace_grade);
    CREATE INDEX IF NOT EXISTS idx_trace_eval_at ON trace_evaluations(evaluated_at);
  `);
}

/** 查找某步骤的评测结果 */
function findStepResult(result: TraceEvalResult, stepName: string): { verdict: string; critique: string } | undefined {
  return result.steps.find(s => s.step === stepName);
}

/**
 * 写入一条轨迹评测记录
 */
export function writeTraceEval(
  result: TraceEvalResult,
  extra?: {
    evalRunId?: string;
    traceJson?: string;
    userMessage?: string;
    historyJson?: string;
    aiReply?: string;
    evalSource?: string;
    convEvalId?: string;
  },
): number {
  const db = getDb();

  const triage = findStepResult(result, 'triage');
  const safety = findStepResult(result, 'safety');
  const persona = findStepResult(result, 'persona');
  const emotion = findStepResult(result, 'emotion');
  const tool = findStepResult(result, 'tool');
  const guard = findStepResult(result, 'guard');

  const stmt = db.prepare(`
    INSERT INTO trace_evaluations (
      conversation_id, eval_run_id, trace_json, user_message, history_json, ai_reply,
      triage_result, triage_critique,
      safety_result, safety_critique,
      persona_result, persona_critique,
      emotion_result, emotion_critique,
      tool_result, tool_critique,
      guard_result, guard_critique,
      trace_score, trace_grade, evaluated_by, eval_source, conv_eval_id
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?,
      ?, ?, ?, ?, ?
    )
  `);

  const info = stmt.run(
    result.conversationId,
    extra?.evalRunId ?? null,
    extra?.traceJson ?? JSON.stringify(result.steps),
    extra?.userMessage ?? '',
    extra?.historyJson ?? null,
    extra?.aiReply ?? null,
    triage?.verdict ?? null, triage?.critique ?? null,
    safety?.verdict ?? null, safety?.critique ?? null,
    persona?.verdict ?? null, persona?.critique ?? null,
    emotion?.verdict ?? null, emotion?.critique ?? null,
    tool?.verdict ?? null, tool?.critique ?? null,
    guard?.verdict ?? null, guard?.critique ?? null,
    result.traceScore,
    result.traceGrade,
    result.evaluatedBy,
    extra?.evalSource ?? 'auto',
    extra?.convEvalId ?? null,
  );

  console.log(`[TraceDB] 已写入轨迹评测 conversation=${result.conversationId} grade=${result.traceGrade}`);
  return info.lastInsertRowid as number;
}

/** trace_evaluations 行类型 */
export interface TraceEvalRow {
  id: number;
  conversation_id: string;
  eval_run_id: string | null;
  trace_json: string;
  user_message: string;
  history_json: string | null;
  ai_reply: string | null;
  triage_result: string | null;
  triage_critique: string | null;
  safety_result: string | null;
  safety_critique: string | null;
  persona_result: string | null;
  persona_critique: string | null;
  emotion_result: string | null;
  emotion_critique: string | null;
  tool_result: string | null;
  tool_critique: string | null;
  guard_result: string | null;
  guard_critique: string | null;
  trace_score: number | null;
  trace_grade: string | null;
  evaluated_by: string | null;
  eval_source: string | null;
  evaluated_at: string | null;
  conv_eval_id: string | null;
}

/**
 * 查询轨迹评测记录（支持按 conversationId / grade / 分页）
 */
export function getTraceEvals(opts?: {
  conversationId?: string;
  grade?: string;
  limit?: number;
  offset?: number;
}): TraceEvalRow[] {
  const db = getDb();

  const conditions: string[] = [];
  const params: any[] = [];

  if (opts?.conversationId) {
    conditions.push('conversation_id = ?');
    params.push(opts.conversationId);
  }
  if (opts?.grade) {
    conditions.push('trace_grade = ?');
    params.push(opts.grade);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts?.limit ?? 50;
  const offset = opts?.offset ?? 0;

  const rows = db.prepare(
    `SELECT * FROM trace_evaluations ${where} ORDER BY evaluated_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as TraceEvalRow[];

  return rows;
}

/** 轨迹评测统计结果 */
export interface TraceStats {
  total: number;
  gradeDistribution: Record<string, number>;
  avgScore: number;
  stepPassRates: Record<string, { pass: number; wrong: number; drift: number; skip: number; total: number }>;
}

/**
 * 获取轨迹评测统计数据
 */
export function getTraceStats(): TraceStats {
  const db = getDb();

  // 总数
  const totalRow = db.prepare('SELECT COUNT(*) as cnt FROM trace_evaluations').get() as any;
  const total: number = totalRow.cnt;

  if (total === 0) {
    return {
      total: 0,
      gradeDistribution: {},
      avgScore: 0,
      stepPassRates: {},
    };
  }

  // 等级分布
  const gradeRows = db.prepare(
    'SELECT trace_grade, COUNT(*) as cnt FROM trace_evaluations GROUP BY trace_grade'
  ).all() as Array<{ trace_grade: string; cnt: number }>;
  const gradeDistribution: Record<string, number> = {};
  for (const row of gradeRows) {
    gradeDistribution[row.trace_grade] = row.cnt;
  }

  // 平均分
  const avgRow = db.prepare(
    'SELECT AVG(trace_score) as avg_score FROM trace_evaluations'
  ).get() as any;
  const avgScore: number = avgRow.avg_score ?? 0;

  // 各步骤通过率统计
  const stepNames = ['triage', 'safety', 'persona', 'emotion', 'tool', 'guard'] as const;
  const stepPassRates: Record<string, { pass: number; wrong: number; drift: number; skip: number; total: number }> = {};

  for (const step of stepNames) {
    const col = `${step}_result`;
    const rows = db.prepare(
      `SELECT ${col} as result, COUNT(*) as cnt FROM trace_evaluations GROUP BY ${col}`
    ).all() as Array<{ result: string | null; cnt: number }>;

    const stats = { pass: 0, wrong: 0, drift: 0, skip: 0, total };
    for (const row of rows) {
      if (row.result === 'Pass') stats.pass = row.cnt;
      else if (row.result === 'Wrong') stats.wrong = row.cnt;
      else if (row.result === 'Drift') stats.drift = row.cnt;
      else stats.skip += row.cnt; // null 或 'Skip'
    }
    stepPassRates[step] = stats;
  }

  return { total, gradeDistribution, avgScore, stepPassRates };
}
