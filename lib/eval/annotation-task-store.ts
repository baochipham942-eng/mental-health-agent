/**
 * 标注任务队列 SQLite Store
 *
 * 在 eval-store.ts 同一 SQLite 数据库中管理标注任务队列。
 * 提供任务创建、查询、更新、统计等功能。
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
    CREATE TABLE IF NOT EXISTS annotation_tasks (
      id TEXT PRIMARY KEY,
      evaluation_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      priority INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'PENDING',
      assigned_to TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      UNIQUE(evaluation_id)
    );
    CREATE INDEX IF NOT EXISTS idx_at_status ON annotation_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_at_priority ON annotation_tasks(priority);
    CREATE INDEX IF NOT EXISTS idx_at_assigned_to ON annotation_tasks(assigned_to);
  `);
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface AnnotationTask {
  id: string;
  evaluationId: string;
  conversationId: string;
  priority: number;
  status: string;
  assignedTo: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
  completedAt: Date | null;
}

export interface CreateTaskInput {
  evaluationId: string;
  conversationId: string;
  priority?: number;
}

export interface FindTasksOptions {
  status?: string;
  assignedTo?: string;
  priority?: number;
  limit?: number;
  offset?: number;
}

export interface TaskStats {
  total: number;
  pending: number;
  inProgress: number;
  completed: number;
  skipped: number;
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function generateId(): string {
  return crypto.randomUUID();
}

function toTask(raw: any): AnnotationTask {
  return {
    id: raw.id,
    evaluationId: raw.evaluation_id,
    conversationId: raw.conversation_id,
    priority: raw.priority,
    status: raw.status,
    assignedTo: raw.assigned_to ?? null,
    notes: raw.notes ?? null,
    createdAt: new Date(raw.created_at),
    updatedAt: new Date(raw.updated_at),
    completedAt: raw.completed_at ? new Date(raw.completed_at) : null,
  };
}

// --------------------------------------------------------------------------
// 创建任务
// --------------------------------------------------------------------------

/** 创建单个标注任务 */
export function createTask(input: CreateTaskInput): AnnotationTask {
  const db = getDb();
  const id = generateId();
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO annotation_tasks (id, evaluation_id, conversation_id, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, input.evaluationId, input.conversationId, input.priority ?? 0, now, now);

  return findTaskById(id)!;
}

/**
 * 从低分评估自动创建标注任务
 *
 * 查询 conversation_evaluations 中 overall_score <= threshold 且尚未有对应 annotation_task 的记录，
 * 按分数设置优先级：<=2 紧急(2)，<=3 高优(1)，其余普通(0)。
 *
 * @returns 创建的任务数量
 */
export function createTasksFromLowScores(threshold: number = 5): number {
  const db = getDb();

  const rows = db.prepare(`
    SELECT ce.id AS eval_id, ce.conversation_id, ce.overall_score
    FROM conversation_evaluations ce
    LEFT JOIN annotation_tasks at ON ce.id = at.evaluation_id
    WHERE ce.overall_score <= ?
      AND ce.overall_grade NOT IN ('EVALUATING', 'FAILED')
      AND at.id IS NULL
  `).all(threshold) as Array<{ eval_id: string; conversation_id: string; overall_score: number }>;

  if (rows.length === 0) return 0;

  const insert = db.prepare(`
    INSERT INTO annotation_tasks (id, evaluation_id, conversation_id, priority, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const batchInsert = db.transaction((items: typeof rows) => {
    for (const row of items) {
      let priority = 0;
      if (row.overall_score <= 2) priority = 2;
      else if (row.overall_score <= 3) priority = 1;

      insert.run(generateId(), row.eval_id, row.conversation_id, priority, now, now);
    }
  });

  batchInsert(rows);
  return rows.length;
}

// --------------------------------------------------------------------------
// 查询
// --------------------------------------------------------------------------

/** 按 ID 查找任务 */
export function findTaskById(id: string): AnnotationTask | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM annotation_tasks WHERE id = ?').get(id) as any;
  return row ? toTask(row) : null;
}

/** 按条件查询任务列表 */
export function findTasks(opts: FindTasksOptions = {}): AnnotationTask[] {
  const db = getDb();
  const conditions: string[] = [];
  const values: any[] = [];

  if (opts.status) {
    conditions.push('status = ?');
    values.push(opts.status);
  }
  if (opts.assignedTo) {
    conditions.push('assigned_to = ?');
    values.push(opts.assignedTo);
  }
  if (opts.priority !== undefined) {
    conditions.push('priority = ?');
    values.push(opts.priority);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const limit = opts.limit ?? 50;
  const offset = opts.offset ?? 0;

  const rows = db.prepare(`
    SELECT * FROM annotation_tasks ${where}
    ORDER BY priority DESC, created_at ASC
    LIMIT ? OFFSET ?
  `).all(...values, limit, offset) as any[];

  return rows.map(toTask);
}

/** 获取下一个待标注任务（按优先级 DESC、创建时间 ASC） */
export function getNextTask(assignedTo?: string): AnnotationTask | null {
  const db = getDb();

  // 如果指定了负责人，优先找分配给该人的 IN_PROGRESS 任务
  if (assignedTo) {
    const inProgress = db.prepare(`
      SELECT * FROM annotation_tasks
      WHERE status = 'IN_PROGRESS' AND assigned_to = ?
      ORDER BY priority DESC, created_at ASC
      LIMIT 1
    `).get(assignedTo) as any;
    if (inProgress) return toTask(inProgress);
  }

  // 然后找 PENDING 状态的任务
  const row = db.prepare(`
    SELECT * FROM annotation_tasks
    WHERE status = 'PENDING'
    ORDER BY priority DESC, created_at ASC
    LIMIT 1
  `).get() as any;

  return row ? toTask(row) : null;
}

// --------------------------------------------------------------------------
// 更新
// --------------------------------------------------------------------------

/** 更新任务字段 */
export function updateTask(
  id: string,
  data: { status?: string; assignedTo?: string; notes?: string }
): AnnotationTask | null {
  const db = getDb();
  const sets: string[] = [];
  const values: any[] = [];

  if (data.status !== undefined) {
    sets.push('status = ?');
    values.push(data.status);
  }
  if (data.assignedTo !== undefined) {
    sets.push('assigned_to = ?');
    values.push(data.assignedTo);
  }
  if (data.notes !== undefined) {
    sets.push('notes = ?');
    values.push(data.notes);
  }

  if (sets.length === 0) return findTaskById(id);

  sets.push('updated_at = ?');
  values.push(new Date().toISOString());

  values.push(id);
  db.prepare(`UPDATE annotation_tasks SET ${sets.join(', ')} WHERE id = ?`).run(...values);

  return findTaskById(id);
}

/** 完成任务 */
export function completeTask(id: string): AnnotationTask | null {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE annotation_tasks
    SET status = 'COMPLETED', completed_at = ?, updated_at = ?
    WHERE id = ?
  `).run(now, now, id);
  return findTaskById(id);
}

/** 跳过任务 */
export function skipTask(id: string): AnnotationTask | null {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE annotation_tasks
    SET status = 'SKIPPED', updated_at = ?
    WHERE id = ?
  `).run(now, id);
  return findTaskById(id);
}

// --------------------------------------------------------------------------
// 统计
// --------------------------------------------------------------------------

/** 获取任务统计 */
export function getTaskStats(): TaskStats {
  const db = getDb();
  const row = db.prepare(`
    SELECT
      COUNT(*) AS total,
      SUM(CASE WHEN status = 'PENDING' THEN 1 ELSE 0 END) AS pending,
      SUM(CASE WHEN status = 'IN_PROGRESS' THEN 1 ELSE 0 END) AS in_progress,
      SUM(CASE WHEN status = 'COMPLETED' THEN 1 ELSE 0 END) AS completed,
      SUM(CASE WHEN status = 'SKIPPED' THEN 1 ELSE 0 END) AS skipped
    FROM annotation_tasks
  `).get() as any;

  return {
    total: row.total ?? 0,
    pending: row.pending ?? 0,
    inProgress: row.in_progress ?? 0,
    completed: row.completed ?? 0,
    skipped: row.skipped ?? 0,
  };
}
