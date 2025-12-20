/**
 * 结构化日志工具
 * 
 * 提供统一的日志格式，自动附加 Trace ID
 * 生产环境输出单行 JSON，开发环境美化输出
 */
import { getCurrentTrace } from './trace-context';

type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

interface StructuredLog {
    timestamp: string;
    level: LogLevel;
    traceId?: string;
    event: string;
    data?: Record<string, any>;
    latencyMs?: number;
}

/**
 * 输出结构化日志
 */
export function log(level: LogLevel, event: string, data?: Record<string, any>) {
    const ctx = getCurrentTrace();

    const logEntry: StructuredLog = {
        timestamp: new Date().toISOString(),
        level,
        traceId: ctx?.traceId,
        event,
        data,
        latencyMs: ctx ? Date.now() - ctx.startTime : undefined,
    };

    // 开发环境：美化输出
    if (process.env.NODE_ENV === 'development') {
        const emoji = { DEBUG: '🔍', INFO: 'ℹ️', WARN: '⚠️', ERROR: '❌' }[level];
        const traceInfo = ctx?.traceId ? ` [${ctx.traceId.slice(-8)}]` : '';
        console.log(`${emoji}${traceInfo} [${event}]`, data ? JSON.stringify(data, null, 2) : '');
    } else {
        // 生产环境：单行 JSON（便于日志采集）
        console.log(JSON.stringify(logEntry));
    }
}

// ============================================================
// 便捷方法
// ============================================================

export const logDebug = (event: string, data?: Record<string, any>) => log('DEBUG', event, data);
export const logInfo = (event: string, data?: Record<string, any>) => log('INFO', event, data);
export const logWarn = (event: string, data?: Record<string, any>) => log('WARN', event, data);
export const logError = (event: string, data?: Record<string, any>) => log('ERROR', event, data);

/**
 * 计时器：测量代码块执行时间
 * 
 * @example
 * const timer = startTimer('db-query');
 * await prisma.user.findMany();
 * timer.end({ count: users.length });
 */
export function startTimer(event: string) {
    const startTime = Date.now();

    return {
        end: (data?: Record<string, any>) => {
            const duration = Date.now() - startTime;
            logInfo(event, { ...data, durationMs: duration });
        },
        endWithError: (error: Error, data?: Record<string, any>) => {
            const duration = Date.now() - startTime;
            logError(event, { ...data, durationMs: duration, error: error.message });
        },
    };
}
