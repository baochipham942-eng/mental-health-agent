/**
 * Prisma client mock
 * 用于需要数据库操作的测试
 */
import { vi } from 'vitest';

export function createMockPrismaClient() {
    return {
        memory: {
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockImplementation((args: any) => Promise.resolve({ id: 'mock-id', ...args.data })),
            update: vi.fn().mockImplementation((args: any) => Promise.resolve({ ...args.data })),
            delete: vi.fn().mockResolvedValue({}),
            deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        },
        conversation: {
            findMany: vi.fn().mockResolvedValue([]),
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockImplementation((args: any) => Promise.resolve({ id: 'mock-id', ...args.data })),
            update: vi.fn().mockImplementation((args: any) => Promise.resolve({ ...args.data })),
        },
        $transaction: vi.fn().mockImplementation((fn: Function) => fn()),
    };
}
