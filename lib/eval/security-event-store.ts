/**
 * 安全事件 SQLite Store
 *
 * 在 eval-store.ts 同一个 SQLite 数据库中管理安全事件。
 * 支持危机检测、护栏触发、低分预警等事件的 CRUD 和统计。
 */

import Database from 'better-sqlite3';
import * as path from 'path';
import * as crypto from 'crypto';

// --------------------------------------------------------------------------
// Database Connection（复用 eval-store 的同一 SQLite 文件）
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
    CREATE TABLE IF NOT EXISTS security_events (
      id TEXT PRIMARY KEY,
      conversation_id TEXT,
      event_type TEXT NOT NULL,
      severity TEXT NOT NULL DEFAULT 'MEDIUM',
      description TEXT NOT NULL,
      metadata TEXT NOT NULL DEFAULT '{}',
      resolved INTEGER NOT NULL DEFAULT 0,
      resolved_by TEXT,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_se_event_type ON security_events(event_type);
    CREATE INDEX IF NOT EXISTS idx_se_severity ON security_events(severity);
    CREATE INDEX IF NOT EXISTS idx_se_created_at ON security_events(created_at);
    CREATE INDEX IF NOT EXISTS idx_se_resolved ON security_events(resolved);
  `);
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface SecurityEvent {
  id: string;
  conversationId: string | null;
  eventType: string;
  severity: string;
  description: string;
  metadata: Record<string, unknown>;
  resolved: boolean;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
}

export interface RecordEventInput {
  conversationId?: string | null;
  eventType: string;
  severity: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface FindEventsOptions {
  type?: string;
  severity?: string;
  resolved?: boolean;
  limit?: number;
  offset?: number;
}

export interface SecurityMetrics {
  total: number;
  bySeverity: Record<string, number>;
  byType: Record<string, number>;
  unresolvedCount: number;
  resolvedCount: number;
}

export interface LowScoreAlert {
  conversationId: string;
  dimension: 'legal' | 'ethical';
  score: number;
  evaluatedAt: Date;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID();
}

function parseMetadata(raw: string | null): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { return {}; }
}

function toSecurityEvent(raw: any): SecurityEvent {
  return {
    id: raw.id,
    conversationId: raw.conversation_id ?? null,
    eventType: raw.event_type,
    severity: raw.severity,
    description: raw.description,
    metadata: parseMetadata(raw.metadata),
    resolved: raw.resolved === 1,
    resolvedBy: raw.resolved_by ?? null,
    resolvedAt: raw.resolved_at ? new Date(raw.resolved_at) : null,
    createdAt: new Date(raw.created_at),
  };
}

// --------------------------------------------------------------------------
// CRUD
// --------------------------------------------------------------------------

/** 记录安全事件 */
export function recordEvent(input: RecordEventInput): SecurityEvent {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO security_events (id, conversation_id, event_type, severity, description, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.conversationId ?? null,
    input.eventType,
    input.severity,
    input.description,
    JSON.stringify(input.metadata ?? {}),
    now,
  );

  return findEventById(id)!;
}

/** 按 ID 查找事件 */
export function findEventById(id: string): SecurityEvent | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM security_events WHERE id = ?').get(id) as any;
  return row ? toSecurityEvent(row) : null;
}

/** 按条件查询事件列表 */
export function findEvents(opts: FindEventsOptions = {}): SecurityEvent[] {
  const db = getDb();
  const conditions: string[] = [];
  const params: any[] = [];

  if (opts.type) {
    conditions.push('event_type = ?');
    params.push(opts.type);
  }
  if (opts.severity) {
    conditions.push('severity = ?');
    params.push(opts.severity);
  }
  if (opts.resolved !== undefined) {
    conditions.push('resolved = ?');
    params.push(opts.resolved ? 1 : 0);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 100;
  const offset = opts.offset ?? 0;

  const rows = db.prepare(
    `SELECT * FROM security_events ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
  ).all(...params, limit, offset) as any[];

  return rows.map(toSecurityEvent);
}

/** 标记事件为已解决 */
export function resolveEvent(id: string, resolvedBy: string): SecurityEvent | null {
  const db = getDb();
  const now = new Date().toISOString();

  const result = db.prepare(
    'UPDATE security_events SET resolved = 1, resolved_by = ?, resolved_at = ? WHERE id = ?'
  ).run(resolvedBy, now, id);

  if (result.changes === 0) return null;
  return findEventById(id);
}

/** 事件总数 */
export function countEvents(): number {
  const db = getDb();
  const row = db.prepare('SELECT COUNT(*) as cnt FROM security_events').get() as any;
  return row.cnt;
}

// --------------------------------------------------------------------------
// 统计
// --------------------------------------------------------------------------

/** 获取指定时间段内的安全指标 */
export function getMetrics(since: Date): SecurityMetrics {
  const db = getDb();
  const sinceIso = since.toISOString();

  // 按严重度统计
  const severityRows = db.prepare(`
    SELECT severity, COUNT(*) as cnt
    FROM security_events
    WHERE created_at >= ?
    GROUP BY severity
  `).all(sinceIso) as any[];

  const bySeverity: Record<string, number> = {};
  let total = 0;
  for (const r of severityRows) {
    bySeverity[r.severity] = r.cnt;
    total += r.cnt;
  }

  // 按类型统计
  const typeRows = db.prepare(`
    SELECT event_type, COUNT(*) as cnt
    FROM security_events
    WHERE created_at >= ?
    GROUP BY event_type
  `).all(sinceIso) as any[];

  const byType: Record<string, number> = {};
  for (const r of typeRows) {
    byType[r.event_type] = r.cnt;
  }

  // 已解决 / 未解决
  const resolvedRow = db.prepare(`
    SELECT
      SUM(CASE WHEN resolved = 1 THEN 1 ELSE 0 END) as resolved_count,
      SUM(CASE WHEN resolved = 0 THEN 1 ELSE 0 END) as unresolved_count
    FROM security_events
    WHERE created_at >= ?
  `).get(sinceIso) as any;

  return {
    total,
    bySeverity,
    byType,
    resolvedCount: resolvedRow?.resolved_count ?? 0,
    unresolvedCount: resolvedRow?.unresolved_count ?? 0,
  };
}

// --------------------------------------------------------------------------
// 红线检查：从 conversation_evaluations 读取低分评估
// --------------------------------------------------------------------------

/** 获取 legal_score 或 ethical_score <= 3 的低分预警 */
export function getLowScoreAlerts(since: Date): LowScoreAlert[] {
  const db = getDb();
  const sinceIso = since.toISOString();

  const rows = db.prepare(`
    SELECT conversation_id, legal_score, ethical_score, evaluated_at
    FROM conversation_evaluations
    WHERE evaluated_at >= ?
      AND (legal_score <= 3 OR ethical_score <= 3)
      AND overall_grade NOT IN ('EVALUATING', 'FAILED')
    ORDER BY evaluated_at DESC
  `).all(sinceIso) as any[];

  const alerts: LowScoreAlert[] = [];
  for (const r of rows) {
    if (r.legal_score <= 3) {
      alerts.push({
        conversationId: r.conversation_id,
        dimension: 'legal',
        score: r.legal_score,
        evaluatedAt: new Date(r.evaluated_at),
      });
    }
    if (r.ethical_score <= 3) {
      alerts.push({
        conversationId: r.conversation_id,
        dimension: 'ethical',
        score: r.ethical_score,
        evaluatedAt: new Date(r.evaluated_at),
      });
    }
  }

  return alerts;
}
