/**
 * Sprint 2: SQLite 写入器
 * 将自动回流的 bad case 写入 eval-academic SQLite 数据库
 *
 * 注意：此模块使用 better-sqlite3（Node.js 兼容），
 * 而 scripts/eval-academic/db.ts 使用 bun:sqlite（仅 Bun 运行时）。
 * 两者操作同一 SQLite 文件。
 */

import Database from 'better-sqlite3';
import * as path from 'path';

// 部署时 SQLite 可能在不同位置
const DB_PATH = process.env.EVAL_DB_PATH
    || path.join(process.cwd(), 'scripts/eval-academic/eval-academic.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
    if (!_db) {
        _db = new Database(DB_PATH);
        _db.pragma('journal_mode = WAL');
        _db.pragma('foreign_keys = ON');
        ensureAutoBackflowDataset(_db);
    }
    return _db;
}

const AUTO_DATASET_ID = 'auto_backflow';
const AUTO_DATASET_NAME = '线上自动回流';

function ensureAutoBackflowDataset(db: Database.Database) {
    const existing = db.prepare('SELECT id FROM datasets WHERE id = ?').get(AUTO_DATASET_ID);
    if (!existing) {
        db.prepare(
            `INSERT INTO datasets (id, name, language, source_url, imported_at)
             VALUES (?, ?, 'zh', 'auto_backflow', datetime('now'))`
        ).run(AUTO_DATASET_ID, AUTO_DATASET_NAME);
    }
}

export interface AutoCaseInput {
    conversationId: string;
    dialog: { role: 'user' | 'assistant'; content: string }[];
    overallScore: number;
    overallGrade: string;
    issues: string[];
}

/**
 * 写入自动回流用例到 eval_cases
 */
export function writeAutoCase(input: AutoCaseInput): string {
    const db = getDb();

    // 用 conversationId 的 hash 前缀作为 case id，避免重复
    const caseId = `${AUTO_DATASET_ID}:${input.conversationId}`;

    // 检查是否已存在
    const existing = db.prepare('SELECT id FROM eval_cases WHERE id = ?').get(caseId);
    if (existing) {
        console.log(`[DbWriter] 用例已存在: ${caseId}`);
        return caseId;
    }

    const turnCount = input.dialog.filter(t => t.role === 'user').length;

    db.prepare(
        `INSERT INTO eval_cases (id, dataset_id, category, emotion_type, situation, psychotherapy, dialog_json, metadata_json, turn_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
        caseId,
        AUTO_DATASET_ID,
        'auto_backflow', // category
        null,
        `线上低分对话（评分 ${input.overallScore}，等级 ${input.overallGrade}）`,
        null,
        JSON.stringify(input.dialog),
        JSON.stringify({
            source: 'auto_backflow',
            conversationId: input.conversationId,
            overallScore: input.overallScore,
            overallGrade: input.overallGrade,
            issues: input.issues,
            ingestedAt: new Date().toISOString(),
        }),
        turnCount,
    );

    // 更新数据集计数
    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM eval_cases WHERE dataset_id = ?').get(AUTO_DATASET_ID) as any;
    db.prepare('UPDATE datasets SET total_cases = ? WHERE id = ?').run(countRow.cnt, AUTO_DATASET_ID);

    console.log(`[DbWriter] 已写入用例 ${caseId}（${turnCount} 轮）`);
    return caseId;
}

/**
 * 查询自动回流用例数量
 */
export function getAutoBackflowCount(): number {
    const db = getDb();
    const row = db.prepare('SELECT COUNT(*) as cnt FROM eval_cases WHERE dataset_id = ?').get(AUTO_DATASET_ID) as any;
    return row.cnt;
}
