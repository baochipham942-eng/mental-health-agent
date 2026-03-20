/**
 * Embedding Similarity — 第三路低成本验证
 * 使用 OpenAI text-embedding-3-small 计算 cosine similarity
 */

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

async function getEmbedding(text: string, apiKey: string, proxy?: string): Promise<number[]> {
  const url = 'https://api.openai.com/v1/embeddings';
  const fetchOptions: any = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text.slice(0, 2000),
    }),
  };

  // bun fetch 支持 proxy 环境变量，但也可以显式设置
  if (proxy) {
    fetchOptions.proxy = proxy;
  }

  const resp = await fetch(url, fetchOptions);
  if (!resp.ok) {
    throw new Error(`Embedding API error: ${resp.status} ${resp.statusText}`);
  }
  const data = await resp.json() as any;
  return data.data[0].embedding;
}

export async function computeEmbeddingSimilarity(
  reference: string,
  actual: string
): Promise<{ similarity: number; level: 'high' | 'medium' | 'low' }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return { similarity: -1, level: 'low' };
  }

  try {
    const proxy = process.env.HTTPS_PROXY || process.env.https_proxy || 'http://127.0.0.1:7897';
    const [refEmb, actEmb] = await Promise.all([
      getEmbedding(reference, apiKey, proxy),
      getEmbedding(actual, apiKey, proxy),
    ]);
    const similarity = Math.round(cosineSimilarity(refEmb, actEmb) * 1000) / 1000;
    const level = similarity >= 0.8 ? 'high' : similarity >= 0.6 ? 'medium' : 'low';
    return { similarity, level };
  } catch (e: any) {
    console.warn(`[embedding] similarity 计算失败: ${e.message}`);
    return { similarity: -1, level: 'low' };
  }
}
