/**
 * ProfileMemory 内存缓存层
 *
 * LRU 缓存，key = userId，TTL = 5 分钟
 * 用于避免 getContext() 每次请求都查数据库
 *
 * 只缓存按 userId 稳定的记忆源快照（MemorySourceSnapshot），
 * 不缓存排序后的注入文本——排序依赖当前 message，按 userId 缓存会跨话题串味。
 */

import type { MemorySourceSnapshot } from './v2-types';
import { logInfo, logDebug } from '@/lib/observability/logger';

export interface MemoryCacheEntry {
  result: MemorySourceSnapshot;
  /** 缓存写入时间（ms） */
  timestamp: number;
}

export interface MemoryCacheConfig {
  /** 缓存过期时间（ms），默认 5 分钟 */
  ttlMs: number;
  /** 最大缓存用户数，默认 500 */
  maxSize: number;
  /** 定期清理间隔（ms），默认 60 秒 */
  purgeIntervalMs: number;
}

const DEFAULT_CONFIG: MemoryCacheConfig = {
  ttlMs: 5 * 60 * 1000,
  maxSize: 500,
  purgeIntervalMs: 60 * 1000,
};

export class MemoryCache {
  private cache = new Map<string, MemoryCacheEntry>();
  private config: MemoryCacheConfig;
  private purgeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<MemoryCacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.startPurgeTimer();
  }

  /**
   * 查询缓存，未命中或已过期返回 null
   * 命中时更新访问顺序（LRU）
   */
  get(userId: string): MemorySourceSnapshot | null {
    const entry = this.cache.get(userId);
    if (!entry) return null;

    if (Date.now() - entry.timestamp > this.config.ttlMs) {
      this.cache.delete(userId);
      logDebug('memory-cache-expired', { userId });
      return null;
    }

    // LRU：删除再插入，保持最近访问在末尾
    this.cache.delete(userId);
    this.cache.set(userId, entry);

    return entry.result;
  }

  /**
   * 写入缓存，超过 maxSize 时淘汰最久未访问的条目
   */
  set(userId: string, result: MemorySourceSnapshot): void {
    // 如果已存在，先删除（保证插入到末尾）
    this.cache.delete(userId);

    // 淘汰：超出容量时删除最久未访问的（Map 迭代顺序 = 插入顺序）
    while (this.cache.size >= this.config.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      } else {
        break;
      }
    }

    this.cache.set(userId, {
      result,
      timestamp: Date.now(),
    });
  }

  /**
   * 失效指定用户的缓存
   */
  invalidate(userId: string): void {
    const existed = this.cache.delete(userId);
    if (existed) {
      logDebug('memory-cache-invalidated', { userId });
    }
  }

  /**
   * 清空所有缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 当前缓存条目数
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * 定期清理过期条目，防止内存泄漏
   */
  private startPurgeTimer(): void {
    // 在测试环境不启动定时器
    if (typeof globalThis !== 'undefined' && (globalThis as any).__vitest_worker__) {
      return;
    }

    this.purgeTimer = setInterval(() => {
      const now = Date.now();
      let purged = 0;
      for (const [key, entry] of this.cache) {
        if (now - entry.timestamp > this.config.ttlMs) {
          this.cache.delete(key);
          purged++;
        }
      }
      if (purged > 0) {
        logInfo('memory-cache-purge', { purged, remaining: this.cache.size });
      }
    }, this.config.purgeIntervalMs);

    // 不阻止进程退出
    if (this.purgeTimer && typeof this.purgeTimer === 'object' && 'unref' in this.purgeTimer) {
      this.purgeTimer.unref();
    }
  }

  /**
   * 销毁缓存（停止定时器），用于测试清理
   */
  destroy(): void {
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
    this.cache.clear();
  }
}

/** 全局单例 */
export const memoryCache = new MemoryCache();
