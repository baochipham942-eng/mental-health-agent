import { prisma } from '@/lib/db/prisma';
import type { SessionSummaryV2Record } from './v2-types';

export class SessionSummaryV2Service {
  async listRecent(userId: string, limit: number = 2): Promise<SessionSummaryV2Record[]> {
    const delegate = (prisma as any).sessionSummaryV2;
    if (!delegate) return [];

    return delegate.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

export const sessionSummaryV2Service = new SessionSummaryV2Service();
