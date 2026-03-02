/**
 * Agent 基类
 * 统一接口、标准化返回、超时机制
 */

export interface AgentResult<T = any> {
    success: boolean;
    data: T;
    latency: number;  // ms
    error?: string;
    agentName: string;
    model: string;
}

export interface AgentConfig {
    name: string;
    model: string;
    systemPrompt: string;
    timeout: number;        // ms
    fallbackData?: any;     // 超时/失败时的降级数据
}

export abstract class BaseAgent<TInput, TOutput> {
    protected config: AgentConfig;

    constructor(config: AgentConfig) {
        this.config = config;
    }

    get name() { return this.config.name; }
    get model() { return this.config.model; }

    /**
     * 子类实现具体的 Agent 逻辑
     */
    protected abstract execute(input: TInput): Promise<TOutput>;

    /**
     * 带超时和错误处理的统一执行入口
     */
    async run(input: TInput): Promise<AgentResult<TOutput>> {
        const start = Date.now();

        try {
            const result = await Promise.race([
                this.execute(input),
                this.timeout(),
            ]);

            return {
                success: true,
                data: result as TOutput,
                latency: Date.now() - start,
                agentName: this.config.name,
                model: this.config.model,
            };
        } catch (error: any) {
            const latency = Date.now() - start;
            const isTimeout = error.message === 'AGENT_TIMEOUT';

            console.error(`[${this.config.name}] ${isTimeout ? 'Timeout' : 'Error'} after ${latency}ms:`, error.message);

            return {
                success: false,
                data: this.config.fallbackData as TOutput,
                latency,
                error: isTimeout
                    ? `Agent timed out after ${this.config.timeout}ms`
                    : error.message,
                agentName: this.config.name,
                model: this.config.model,
            };
        }
    }

    private timeout(): Promise<never> {
        return new Promise((_, reject) => {
            setTimeout(() => reject(new Error('AGENT_TIMEOUT')), this.config.timeout);
        });
    }
}

/**
 * 并行执行多个 Agent，收集结果
 */
export async function runAgentsParallel<T extends Record<string, BaseAgent<any, any>>>(
    agents: T,
    inputs: { [K in keyof T]: Parameters<T[K]['run']>[0] }
): Promise<{ [K in keyof T]: AgentResult }> {
    const keys = Object.keys(agents) as (keyof T)[];
    const promises = keys.map(key => agents[key].run(inputs[key]));
    const results = await Promise.all(promises);

    const output = {} as { [K in keyof T]: AgentResult };
    keys.forEach((key, i) => {
        output[key] = results[i];
    });

    return output;
}

/**
 * 条件执行 Agent：仅在条件满足时执行，否则返回降级数据
 */
export async function runAgentConditional<TInput, TOutput>(
    agent: BaseAgent<TInput, TOutput>,
    input: TInput,
    condition: boolean
): Promise<AgentResult<TOutput>> {
    if (!condition) {
        return {
            success: true,
            data: agent['config'].fallbackData as TOutput,
            latency: 0,
            agentName: agent.name,
            model: agent.model,
        };
    }
    return agent.run(input);
}
