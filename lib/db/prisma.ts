import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

/**
 * Prisma Client Singleton for Serverless Environment
 * Optimized for Vercel/Neon with connection pooling
 *
 * Prisma 7 要求通过 driver adapter 注入数据库连接（datasource url
 * 从 schema.prisma 迁移到了 prisma.config.ts 与运行时 adapter）。
 */
const prismaClientSingleton = () => {
    const adapter = new PrismaPg(process.env.DATABASE_URL!);
    return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
    });
};

type PrismaClientSingleton = ReturnType<typeof prismaClientSingleton>;

const globalForPrisma = globalThis as unknown as {
    prisma: PrismaClientSingleton | undefined;
};

export const prisma = globalForPrisma.prisma ?? prismaClientSingleton();

// In development, preserve client across HMR (hot module replacement)
// In production on Vercel, each function invocation gets a fresh instance
// but the global singleton helps with connection reuse within same instance
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = prisma;
}

// Graceful shutdown handler for edge cases
if (process.env.NODE_ENV === 'production') {
    process.on('beforeExit', async () => {
        await prisma.$disconnect();
    });
}
