/**
 * 黄金样本缓存 + 关键词相似度检索
 * 
 * 启动时加载所有样本到内存，运行时使用关键词重叠度检索最相关的样本
 */

import { prisma } from '@/lib/db/prisma';

interface CachedExample {
    id: string;
    userMessage: string;
    assistantMessage: string;
    keywords: Set<string>;
}

// 模块级缓存
let cache: CachedExample[] = [];
let cacheTime = 0;
const CACHE_TTL = 10 * 60 * 1000; // 10 分钟刷新

// 中文停用词
const STOP_WORDS = new Set([
    '的', '了', '是', '我', '你', '有', '在', '和', '这', '那',
    '就', '也', '都', '要', '会', '能', '到', '很', '但', '不',
    '吗', '呢', '啊', '吧', '咧', '嘛', '呀', '哦', '噢', '诶',
    '一', '一个', '什么', '怎么', '为什么', '可以', '应该', '可能',
]);

/**
 * 提取关键词
 */
function extractKeywords(text: string): Set<string> {
    const words = text
        .toLowerCase()
        .split(/[，。！？、；：""''（）\s\n]+/)
        .filter(w => w.length >= 2 && !STOP_WORDS.has(w));
    return new Set(words);
}

/**
 * 计算关键词相似度 (Jaccard 系数变体)
 */
function keywordSimilarity(queryKeywords: Set<string>, targetKeywords: Set<string>): number {
    if (queryKeywords.size === 0 || targetKeywords.size === 0) return 0;

    let matchCount = 0;
    for (const word of queryKeywords) {
        if (targetKeywords.has(word)) {
            matchCount++;
        }
    }

    // 使用查询词的覆盖率作为主要指标
    return matchCount / queryKeywords.size;
}

/**
 * 初始化/刷新缓存
 */
async function ensureCache(): Promise<void> {
    if (cache.length > 0 && Date.now() - cacheTime < CACHE_TTL) {
        return; // 缓存有效
    }

    try {
        const examples = await prisma.goldenExample.findMany({
            where: { status: 'ACTIVE' },
            select: { id: true, userMessage: true, assistantMessage: true }
        });

        cache = examples.map(ex => ({
            ...ex,
            keywords: extractKeywords(ex.userMessage),
        }));

        cacheTime = Date.now();
        console.log(`[GoldenCache] Loaded ${cache.length} examples`);
    } catch (e) {
        console.error('[GoldenCache] Failed to load:', e);
    }
}

/**
 * 检索最相关的黄金样本
 */
export async function retrieveRelevantExamples(
    userMessage: string,
    topK = 3
): Promise<{ userMessage: string; assistantMessage: string }[]> {
    await ensureCache();

    if (cache.length === 0) return [];

    const queryKeywords = extractKeywords(userMessage);
    if (queryKeywords.size === 0) {
        // 无有效关键词，返回最新的样本
        return cache.slice(0, topK).map(({ userMessage, assistantMessage }) => ({
            userMessage,
            assistantMessage,
        }));
    }

    // 计算相似度并排序
    const scored = cache.map(ex => ({
        ...ex,
        score: keywordSimilarity(queryKeywords, ex.keywords),
    }));

    scored.sort((a, b) => b.score - a.score);

    // 只返回有一定相关性的样本 (score > 0)
    const relevant = scored.filter(ex => ex.score > 0).slice(0, topK);

    return relevant.map(({ userMessage, assistantMessage }) => ({
        userMessage,
        assistantMessage,
    }));
}

/**
 * 格式化样本为 prompt 片段
 */
export function formatExamplesForPrompt(
    examples: { userMessage: string; assistantMessage: string }[]
): string {
    if (examples.length === 0) return '';

    const formatted = examples.map((ex, i) =>
        `### 示例 ${i + 1}\n**用户**: ${ex.userMessage}\n**AI**: ${ex.assistantMessage}`
    ).join('\n\n');

    return `\n## 优秀回复参考\n以下是类似场景的高质量回复，请参考其风格：\n\n${formatted}\n`;
}
