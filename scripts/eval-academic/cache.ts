/**
 * Chat API 响应缓存
 * 使用 SQLite 存储，避免重复调用 API
 */
import { Database } from 'bun:sqlite';
import * as crypto from 'crypto';
import * as path from 'path';

const CACHE_DB_PATH = path.join(__dirname, 'eval-cache.db');

let _cacheDb: Database | null = null;

function getCacheDb(): Database {
  if (!_cacheDb) {
    _cacheDb = new Database(CACHE_DB_PATH);
    _cacheDb.exec('PRAGMA journal_mode=WAL');
    _cacheDb.exec(`
      CREATE TABLE IF NOT EXISTS api_cache (
        hash TEXT PRIMARY KEY,
        request_json TEXT,
        response_json TEXT,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);
  }
  return _cacheDb;
}

export function closeCacheDb() {
  if (_cacheDb) { _cacheDb.close(); _cacheDb = null; }
}

export function cacheKey(message: string, history: Array<{role: string; content: string}>): string {
  return crypto.createHash('sha256')
    .update(JSON.stringify({ message, history }))
    .digest('hex');
}

export function getCachedResponse(hash: string): any | null {
  const row = getCacheDb().query('SELECT response_json FROM api_cache WHERE hash = ?').get(hash) as any;
  return row ? JSON.parse(row.response_json) : null;
}

export function setCachedResponse(hash: string, message: string, history: any[], response: any): void {
  getCacheDb().run(
    'INSERT OR REPLACE INTO api_cache (hash, request_json, response_json) VALUES (?, ?, ?)',
    [hash, JSON.stringify({ message, history }), JSON.stringify(response)]
  );
}

export function getCacheStats(): { totalEntries: number; dbSizeBytes: number } {
  const row = getCacheDb().query('SELECT COUNT(*) as cnt FROM api_cache').get() as any;
  return { totalEntries: row.cnt, dbSizeBytes: 0 };
}
