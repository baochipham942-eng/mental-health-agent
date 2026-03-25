import { findRecentSessionSummaries } from './data-bridge';
import type { SessionSummaryV2Record } from './v2-types';

export class SessionSummaryV2Service {
  async listRecent(userId: string, limit: number = 2): Promise<SessionSummaryV2Record[]> {
    return findRecentSessionSummaries(userId, limit);
  }
}

export const sessionSummaryV2Service = new SessionSummaryV2Service();
