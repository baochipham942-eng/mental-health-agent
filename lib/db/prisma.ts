import { PrismaClient } from '@prisma/client';

/**
 * Prisma Client Singleton for Serverless Environment
 * Optimized for Vercel/Neon with connection pooling
 */
const prismaClientSingleton = () => {
    return new PrismaClient({
        // Log only errors in production
        log: process.env.NODE_ENV === 'production' ? ['error'] : ['query', 'error', 'warn'],
        // Optimize for serverless: shorter connection timeout
        datasources: {
            db: {
                url: process.env.DATABASE_URL,
            },
        },
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
