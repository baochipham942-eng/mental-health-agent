/**
 * LangFuse 可观测性集成
 * 
 * 用于追踪 LLM 调用链路、Token 消耗和延迟
 * 
 * 配置环境变量:
 * - LANGFUSE_SECRET_KEY: LangFuse Secret Key
 * - LANGFUSE_PUBLIC_KEY: LangFuse Public Key
 * - LANGFUSE_HOST: LangFuse Host URL (可选, 默认 https://cloud.langfuse.com)
 */

import { Langfuse } from 'langfuse';

// 单例模式初始化 LangFuse 客户端
let langfuseInstance: Langfuse | null = null;

/**
 * 获取 LangFuse 客户端实例
 * 如果未配置环境变量，返回 null（禁用追踪）
 */
export function getLangfuse(): Langfuse | null {
    // 如果明确禁用 Langfuse，直接返回 null
    if (process.env.LANGFUSE_ENABLED === 'false') {
        return null;
    }

    // 如果未配置密钥，禁用追踪
    if (!process.env.LANGFUSE_SECRET_KEY || !process.env.LANGFUSE_PUBLIC_KEY) {
        return null;
    }

    // 检查密钥是否为示例值（占位符）
    if (
        process.env.LANGFUSE_SECRET_KEY.startsWith('sk-lf-...') ||
        process.env.LANGFUSE_PUBLIC_KEY.startsWith('pk-lf-...')
    ) {
        console.warn('[Langfuse] 检测到示例密钥，已禁用 Langfuse 追踪');
        return null;
    }

    if (!langfuseInstance) {
        try {
            langfuseInstance = new Langfuse({
                secretKey: process.env.LANGFUSE_SECRET_KEY,
                publicKey: process.env.LANGFUSE_PUBLIC_KEY,
                baseUrl: process.env.LANGFUSE_BASE_URL || 'https://cloud.langfuse.com',
            });
        } catch (error) {
            console.error('[Langfuse] 初始化失败，已禁用追踪:', error);
            return null;
        }
    }

    return langfuseInstance;
}

/**
 * 创建追踪会话
 * @param name 追踪名称
 * @param metadata 元数据
 */
export function createTrace(name: string, metadata?: Record<string, any>, input?: any, output?: any) {
    const langfuse = getLangfuse();
    if (!langfuse) {
        return null;
    }

    return langfuse.trace({
        name,
        metadata,
        input,
        output,
    });
}

/**
 * 更新追踪信息（通常用于添加 output）
 * @param trace 追踪对象
 * @param updates 更新内容
 */
export function updateTrace(
    trace: ReturnType<typeof createTrace>,
    updates: {
        output?: any;
        input?: any;
        metadata?: Record<string, any>;
    }
) {
    if (!trace) {
        return;
    }
    trace.update(updates);
}

/**
 * 追踪 LLM 调用（用于 chatCompletion 等函数）
 * @param trace 父追踪
 * @param name 生成名称
 * @param input 输入（messages）
 * @param model 模型名称
 */
export function createGeneration(
    trace: ReturnType<typeof createTrace>,
    name: string,
    input: any,
    model: string = 'deepseek-chat'
) {
    if (!trace) {
        return null;
    }

    return trace.generation({
        name,
        input,
        model,
    });
}

/**
 * 完成生成追踪
 * @param generation 生成对象
 * @param output 输出内容
 * @param usage Token 使用情况
 */
export function endGeneration(
    generation: ReturnType<typeof createGeneration>,
    output: string,
    usage?: {
        promptTokens?: number;
        completionTokens?: number;
        totalTokens?: number;
    }
) {
    if (!generation) {
        return;
    }

    generation.end({
        output,
        usage,
    });
}

/**
 * 关闭 LangFuse 连接（在请求结束时调用）
 */
export async function flushLangfuse() {
    const langfuse = getLangfuse();
    if (langfuse) {
        await langfuse.flushAsync();
    }
}

/**
 * 装饰器风格的追踪辅助函数
 * 自动追踪异步函数的执行
 */
export async function withTrace<T>(
    name: string,
    fn: (trace: ReturnType<typeof createTrace>) => Promise<T>,
    metadata?: Record<string, any>
): Promise<T> {
    const trace = createTrace(name, metadata);

    try {
        const result = await fn(trace);
        return result;
    } catch (error) {
        if (trace) {
            trace.update({
                output: { error: String(error) },
            });
        }
        throw error;
    } finally {
        await flushLangfuse();
    }
}
