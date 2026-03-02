/**
 * 回填脚本：为现有 UserMemory 记录生成 embedding 向量
 * 用法: bun scripts/backfill-embeddings.ts [--batch-size=50] [--dry-run]
 */

import { PrismaClient } from '@prisma/client';
import { generateEmbedding } from '../lib/memory/embedding';

const prisma = new PrismaClient();

async function main() {
    const args = process.argv.slice(2);
    const dryRun = args.includes('--dry-run');
    const batchSizeArg = args.find(a => a.startsWith('--batch-size='));
    const batchSize = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 50;

    console.log(`[Backfill] Starting embedding backfill (batchSize=${batchSize}, dryRun=${dryRun})`);

    // 查找没有 embedding 的记忆（通过 raw query 因为 Prisma 不直接支持 Unsupported 类型的查询）
    const memories = await prisma.userMemory.findMany({
        select: { id: true, content: true, topic: true },
        orderBy: { createdAt: 'asc' },
    });

    console.log(`[Backfill] Found ${memories.length} total memories`);

    let processed = 0;
    let failed = 0;

    for (let i = 0; i < memories.length; i += batchSize) {
        const batch = memories.slice(i, i + batchSize);

        for (const memory of batch) {
            try {
                const embedding = await generateEmbedding(memory.content);
                if (!embedding) {
                    failed++;
                    continue;
                }

                if (!dryRun) {
                    // 使用 raw SQL 更新 vector 字段（Prisma 不支持 Unsupported 类型的直接写入）
                    const vectorStr = `[${embedding.join(',')}]`;
                    await prisma.$executeRawUnsafe(
                        `UPDATE "UserMemory" SET embedding = $1::vector WHERE id = $2`,
                        vectorStr,
                        memory.id
                    );
                }

                processed++;
            } catch (e) {
                console.error(`[Backfill] Failed for memory ${memory.id}:`, e);
                failed++;
            }
        }

        console.log(`[Backfill] Progress: ${Math.min(i + batchSize, memories.length)}/${memories.length} (processed=${processed}, failed=${failed})`);
    }

    console.log(`[Backfill] Complete: ${processed} processed, ${failed} failed`);
}

main()
    .catch(e => {
        console.error('[Backfill] Fatal error:', e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
