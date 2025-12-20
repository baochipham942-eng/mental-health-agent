/**
 * Trace 上下文管理器
 * 
 * 使用 AsyncLocalStorage 在请求生命周期内传递 Trace 上下文
 * 避免在每个函数中显式传递 trace 参数
 */
import { AsyncLocalStorage } from 'async_hooks';
import { createTrace as rawCreateTrace, flushLangfuse } from './langfuse';

/**
 * Trace 上下文结构
 */
export interface TraceContext {
    traceId: string;
    trace: ReturnType<typeof rawCreateTrace>;
    userId?: string;
    sessionId?: string;
    startTime: number;
}

// AsyncLocalStorage 实例
export const traceStorage = new AsyncLocalStorage<TraceContext>();

/**
 * 获取当前 Trace 上下文
 */
export function getCurrentTrace(): TraceContext | undefined {
    return traceStorage.getStore();
}

/**
 * 获取当前 Trace ID（便捷方法）
 */
export function getCurrentTraceId(): string | undefined {
    return traceStorage.getStore()?.traceId;
}

/**
 * 在 Trace 上下文中执行函数
 * 
 * @param name Trace 名称
 * @param metadata 元数据
 * @param fn 要执行的异步函数
 */
export async function runWithTrace<T>(
    name: string,
    metadata: Record<string, any>,
    fn: () => Promise<T>
): Promise<T> {
    const traceId = `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const trace = rawCreateTrace(name, { traceId, ...metadata });

    const context: TraceContext = {
        traceId,
        trace,
        userId: metadata.userId,
        sessionId: metadata.sessionId,
        startTime: Date.now(),
    };

    try {
        return await traceStorage.run(context, fn);
    } finally {
        // 确保 Trace 数据被发送
        await flushLangfuse();
    }
}

/**
 * 创建 Span（子追踪）
 * 
 * @param name Span 名称
 * @param input 输入数据（可选）
 * @param metadata 元数据（可选）
 */
export function createSpan(
    name: string,
    input?: any,
    metadata?: Record<string, any>
) {
    const ctx = getCurrentTrace();
    if (!ctx?.trace) return null;

    return ctx.trace.span({
        name,
        input,
        metadata,
    });
}

/**
 * 结束 Span
 * 
 * @param span Span 对象
 * @param output 输出数据
 * @param level 日志级别
 */
export function endSpan(
    span: ReturnType<typeof createSpan>,
    output: any,
    level: 'DEFAULT' | 'WARNING' | 'ERROR' = 'DEFAULT'
) {
    if (!span) return;
    span.end({ output, level });
}

/**
 * 记录事件到当前 Trace
 */
export function logEvent(
    name: string,
    metadata?: Record<string, any>
) {
    const ctx = getCurrentTrace();
    if (!ctx?.trace) return;

    ctx.trace.event({
        name,
        metadata,
    });
}
