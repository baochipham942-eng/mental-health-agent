/**
 * 流式输出护栏 — 在文本 chunk 发给用户之前做安全过滤
 *
 * 背景：guardOutput 原本只在 onFinish（落库前）执行，原文早已流给用户。
 * 本模块把同一套检测规则前置到 UIMessageStream 的 text-delta 通道上：
 *
 * - stream 模式：滚动尾部缓冲。放行时始终扣留最后 TAIL_BUFFER_SIZE 个字符，
 *   保证跨 chunk 拼出的有害短语 / PII / 系统泄露在离开缓冲区之前被 guardOutput 兜住；
 *   流结束（text-end 或 flush）时冲净剩余缓冲。
 * - buffer 模式：整体缓冲，结束时一次性审查再放行（crisis 路由用，首字延迟换确定性安全）。
 *
 * fail-closed：护栏自身异常时输出固定安全回复，不透传原文。
 */
import { guardOutput } from './output-guard';
import { logError, logWarn } from '@/lib/observability/logger';

// 必须 ≥ 最长检测模式的长度（银行卡 19 位数字 / system leak 英文短语），
// 否则模式可能一半已放行、一半还在缓冲，永远拼不齐。
// ponytail: 超过 48 字符的超长 email 等罕见模式不在跨界兜底范围内，加长即可升级
const TAIL_BUFFER_SIZE = 48;

/** 护栏自身异常时的固定安全回复（fail-closed，不透传原文） */
export const STREAM_GUARD_FALLBACK =
    '抱歉，我这边刚才出了点问题，这条回复没能完整发出来。我们可以继续聊聊你现在的状态。';

export type StreamGuardMode = 'stream' | 'buffer';

interface StreamGuardOptions {
    mode?: StreamGuardMode;
    /** 日志上下文（sessionId/routeType 等） */
    logContext?: Record<string, unknown>;
}

/**
 * 创建输出护栏 TransformStream。只拦截 text-delta chunk，其余 chunk 原样透传。
 * 放行的文本 = guardOutput 脱敏后的文本；检出有害内容后替换为危机热线并吞掉后续原文。
 */
export function createOutputGuardStream<T extends { type: string }>(
    options: StreamGuardOptions = {},
): TransformStream<T, T> {
    const mode = options.mode ?? 'stream';
    let raw = '';          // 累计的原始文本（跨 text 块共用一个滚动缓冲）
    let sent = 0;          // 已放行的（脱敏后文本的）字符数
    let sentText = '';     // 已放行的实际文本，用于校验脱敏结果的前缀稳定性
    let blocked = false;   // 有害内容 / 护栏异常后吞掉全部后续原文
    let reported = false;
    let lastTextId = 'guarded-text';

    const emit = (controller: TransformStreamDefaultController<T>, delta: string) => {
        if (delta.length === 0) return;
        controller.enqueue({ type: 'text-delta', id: lastTextId, delta } as unknown as T);
    };

    const failClosed = (controller: TransformStreamDefaultController<T>, error: unknown) => {
        logError('output-guard-stream-error', { error: String(error), ...options.logContext });
        if (blocked) return;
        blocked = true;
        emit(controller, (sent > 0 ? '\n\n' : '') + STREAM_GUARD_FALLBACK);
    };

    const process = (controller: TransformStreamDefaultController<T>, isFinal: boolean) => {
        if (blocked) return;
        if (mode === 'buffer' && !isFinal) return;

        const result = guardOutput(raw);

        if (result.issues.includes('harmful_content')) {
            blocked = true;
            logWarn('output-guard-stream-redacted', { issues: result.issues, ...options.logContext });
            emit(controller, (sent > 0 ? '\n\n' : '') + result.redactedResponse);
            return;
        }
        if (!result.safe && !reported) {
            reported = true;
            logWarn('output-guard-stream-redacted', { issues: result.issues, ...options.logContext });
        }

        const redacted = result.redactedResponse;

        // 前缀稳定性保险：脱敏若改写了已放行区间（模式长度超出尾部缓冲的兜底场景），
        // 索引已不可信——停止透传原文，fail-closed 收尾
        if (!redacted.startsWith(sentText)) {
            blocked = true;
            logError('output-guard-stream-prefix-drift', { sent, ...options.logContext });
            emit(controller, (sent > 0 ? '\n\n' : '') + STREAM_GUARD_FALLBACK);
            return;
        }

        const flushEnd = isFinal ? redacted.length : redacted.length - TAIL_BUFFER_SIZE;
        if (flushEnd > sent) {
            emit(controller, redacted.slice(sent, flushEnd));
            sent = flushEnd;
            sentText = redacted.slice(0, flushEnd);
        }
    };

    return new TransformStream<T, T>({
        transform(chunk, controller) {
            try {
                const c = chunk as { type: string; id?: string; delta?: string };
                if (c.type === 'text-delta') {
                    if (c.id) lastTextId = c.id;
                    raw += c.delta ?? '';
                    process(controller, false);
                    return; // 原始 delta 不透传，放行内容统一由 process 决定
                }
                if (c.type === 'text-end') {
                    process(controller, true); // 先冲净缓冲再转发 text-end
                }
                controller.enqueue(chunk);
            } catch (e) {
                failClosed(controller, e);
            }
        },
        flush(controller) {
            try {
                process(controller, true); // 兜底：没有 text-end 的流在结束时冲净缓冲
            } catch (e) {
                failClosed(controller, e);
            }
        },
    });
}
