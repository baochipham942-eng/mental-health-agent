/**
 * 向量嵌入模块
 * 使用 @xenova/transformers 本地生成 embedding（零 API 成本，~50ms/次）
 * 模型: all-MiniLM-L6-v2 (384维, ~23MB)
 */

let pipeline: any = null;
let pipelinePromise: Promise<any> | null = null;

async function getEmbeddingPipeline() {
    if (pipeline) return pipeline;
    if (pipelinePromise) return pipelinePromise;

    pipelinePromise = (async () => {
        try {
            const { pipeline: createPipeline } = await import('@xenova/transformers');
            pipeline = await createPipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
                quantized: true,
            });
            return pipeline;
        } catch (e) {
            console.error('[Embedding] Failed to load model:', e);
            pipelinePromise = null;
            return null;
        }
    })();

    return pipelinePromise;
}

/**
 * 生成文本的嵌入向量
 * @returns 384维向量，或 null（模型加载失败时）
 */
export async function generateEmbedding(text: string): Promise<number[] | null> {
    const pipe = await getEmbeddingPipeline();
    if (!pipe) return null;

    try {
        const output = await pipe(text, { pooling: 'mean', normalize: true });
        return Array.from(output.data) as number[];
    } catch (e) {
        console.error('[Embedding] Generation failed:', e);
        return null;
    }
}

/**
 * 批量生成嵌入向量
 */
export async function generateEmbeddings(texts: string[]): Promise<(number[] | null)[]> {
    const results: (number[] | null)[] = [];
    for (const text of texts) {
        results.push(await generateEmbedding(text));
    }
    return results;
}

/**
 * 计算两个向量的余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i];
        normA += a[i] * a[i];
        normB += b[i] * b[i];
    }

    const denom = Math.sqrt(normA) * Math.sqrt(normB);
    return denom === 0 ? 0 : dotProduct / denom;
}

/**
 * 混合检索评分
 * 向量相似度 × 0.5 + 遗忘曲线强度 × 0.3 + 置信度 × 0.2
 */
export function hybridScore(
    vectorSimilarity: number,
    memoryStrength: number,
    confidence: number
): number {
    return vectorSimilarity * 0.5 + memoryStrength * 0.3 + confidence * 0.2;
}
