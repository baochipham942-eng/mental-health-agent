/**
 * Memory 模块数据桥接层
 *
 * memory 模块唯一的 Prisma 访问点。
 * 所有函数返回纯数据对象，不暴露 Prisma 类型。
 */
import { prisma } from '@/lib/db/prisma';

// ============================================================
// Return Types（纯数据，不依赖 Prisma 类型）
// ============================================================

export interface ProfileMemoryRow {
  id: string;
  userId: string;
  kind: string;
  fingerprint?: string | null;
  content: string;
  priority: number;
  confidence: number;
  sourceConversationId?: string | null;
  supersedes?: string | null;
  lastConfirmedAt?: Date | null;
  deletedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionSummaryV2Row {
  id: string;
  userId: string;
  conversationId: string;
  summary: string;
  emotionLabel?: string | null;
  emotionScore?: number | null;
  keyTopics?: unknown;
  actionItems?: unknown;
  createdAt: Date;
}

export interface ConversationWithMessages {
  userId: string | null;
  messages: Array<{ role: string; content: string; createdAt: Date }>;
}

export interface ConversationUserId {
  userId: string | null;
}

export interface UserSessionFields {
  sessionCount: number;
  lastSessionAt: Date | null;
  avgSessionHour: number | null;
  activeStreak: number;
  lastActiveDateStr: string | null;
}

export interface UserSessionUpdated {
  sessionCount: number;
  lastSessionAt: Date | null;
  avgSessionHour: number | null;
  activeStreak: number;
}

export interface SessionSummaryV2Emotion {
  emotionLabel: string | null;
  emotionScore: number | null;
  moodChange: number | null;
}

export interface MemoryExtractionLogRow {
  id: string;
  conversationId: string;
  retryCount: number;
  status: string;
  error: string | null;
}

export interface LabSessionCreated {
  id: string;
}

// ============================================================
// ProfileMemory Queries
// ============================================================

/** 创建 ProfileMemory 记录 */
export async function createProfileMemory(data: {
  userId: string;
  kind: string;
  content: string;
  priority: number;
  confidence: number;
  sourceConversationId?: string;
  fingerprint?: string;
  lastConfirmedAt?: Date;
}): Promise<void> {
  await prisma.profileMemory.create({ data });
}

/** 按用户+kind 查询 ProfileMemory（未删除，按 updatedAt 倒序） */
export async function findProfileMemoriesByKind(
  userId: string,
  kind: string,
  take: number,
): Promise<ProfileMemoryRow[]> {
  const delegate = (prisma as any).profileMemory;
  if (!delegate) return [];
  return delegate.findMany({
    where: { userId, kind, deletedAt: null },
    orderBy: { updatedAt: 'desc' },
    take,
  });
}

/** 按用户查询 ProfileMemory（未删除，按 priority+updatedAt 排序） */
export async function findProfileMemoriesTop(
  userId: string,
  take: number,
): Promise<ProfileMemoryRow[]> {
  const delegate = (prisma as any).profileMemory;
  if (!delegate) return [];
  return delegate.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    take,
  });
}

/** 更新 ProfileMemory */
export async function updateProfileMemory(
  id: string,
  data: {
    content?: string;
    confidence?: number;
    sourceConversationId?: string;
    lastConfirmedAt?: Date;
    fingerprint?: string;
    updatedAt?: Date;
  },
): Promise<void> {
  const delegate = (prisma as any).profileMemory;
  if (!delegate) return;
  await delegate.update({ where: { id }, data });
}

/** 查询所有用户 ProfileMemory（未删除，按 kind+updatedAt 排序，API 路由用） */
export async function findAllProfileMemories(userId: string): Promise<ProfileMemoryRow[]> {
  return prisma.profileMemory.findMany({
    where: { userId, deletedAt: null },
    orderBy: [{ kind: 'asc' }, { updatedAt: 'desc' }],
  });
}

/** 按 ID 查找 ProfileMemory（仅返回 userId，用于所有权验证） */
export async function findProfileMemoryOwner(id: string): Promise<{ userId: string } | null> {
  return prisma.profileMemory.findUnique({
    where: { id },
    select: { userId: true },
  });
}

/** 更新 ProfileMemory 内容（API 路由用） */
export async function updateProfileMemoryContent(
  id: string,
  content: string,
): Promise<ProfileMemoryRow> {
  return prisma.profileMemory.update({
    where: { id },
    data: { content, updatedAt: new Date() },
  }) as unknown as ProfileMemoryRow;
}

/** 软删除 ProfileMemory */
export async function softDeleteProfileMemory(id: string): Promise<void> {
  await prisma.profileMemory.update({
    where: { id },
    data: { deletedAt: new Date() },
  });
}

/** 批量删除过期低置信度 ProfileMemory（cron 用） */
export async function deleteExpiredProfileMemories(cutoffDate: Date, confidenceThreshold: number): Promise<number> {
  const result = await prisma.profileMemory.deleteMany({
    where: {
      deletedAt: null,
      updatedAt: { lt: cutoffDate },
      confidence: { lt: confidenceThreshold },
    },
  });
  return result.count;
}

// ============================================================
// SessionSummaryV2 Queries
// ============================================================

/** 查询最近会话摘要 */
export async function findRecentSessionSummaries(
  userId: string,
  limit: number,
): Promise<SessionSummaryV2Row[]> {
  const delegate = (prisma as any).sessionSummaryV2;
  if (!delegate) return [];
  return delegate.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });
}

/** 按 conversationId 查找 SessionSummaryV2（仅情绪字段） */
export async function findSessionSummaryV2Emotion(
  conversationId: string,
): Promise<SessionSummaryV2Emotion | null> {
  const delegate = (prisma as any).sessionSummaryV2;
  if (!delegate) return null;
  return delegate.findUnique({
    where: { conversationId },
    select: { emotionLabel: true, emotionScore: true, moodChange: true },
  });
}

/** Upsert SessionSummaryV2 */
export async function upsertSessionSummaryV2(params: {
  userId: string;
  conversationId: string;
  summary: string;
  emotionLabel?: string;
  emotionScore?: number;
  keyTopics?: string[];
  actionItems?: string[];
}): Promise<void> {
  const delegate = (prisma as any).sessionSummaryV2;
  if (!delegate || !params.summary) return;

  await delegate.upsert({
    where: { conversationId: params.conversationId },
    update: {
      summary: params.summary,
      ...(params.emotionLabel !== undefined && { emotionLabel: params.emotionLabel || null }),
      ...(params.emotionScore !== undefined && { emotionScore: params.emotionScore ?? null }),
      ...(params.keyTopics !== undefined && { keyTopics: params.keyTopics || [] }),
      ...(params.actionItems !== undefined && { actionItems: params.actionItems || [] }),
    },
    create: {
      userId: params.userId,
      conversationId: params.conversationId,
      summary: params.summary,
      emotionLabel: params.emotionLabel || null,
      emotionScore: params.emotionScore ?? null,
      keyTopics: params.keyTopics || [],
      actionItems: params.actionItems || [],
    },
  });
}

// ============================================================
// MemoryCandidate Queries
// ============================================================

/** 批量创建 MemoryCandidate */
export async function createManyCandidates(
  data: Array<{
    userId: string;
    conversationId: string;
    kind: string;
    content: string;
    confidence: number;
    evidence: unknown;
  }>,
): Promise<void> {
  const delegate = (prisma as any).memoryCandidate;
  if (!delegate || data.length === 0) return;
  await delegate.createMany({ data });
}

/** 批量更新 MemoryCandidate 状态 */
export async function updateManyCandidateStatus(
  userId: string,
  conversationId: string,
  content: string,
  status: string,
): Promise<void> {
  const delegate = (prisma as any).memoryCandidate;
  if (!delegate) return;
  await delegate.updateMany({
    where: { userId, conversationId, content },
    data: { status },
  });
}

// ============================================================
// User/Session Metadata Queries
// ============================================================

/** 查询用户 Session 元数据 */
export async function getUserSessionFields(userId: string): Promise<UserSessionFields | null> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      sessionCount: true,
      lastSessionAt: true,
      avgSessionHour: true,
      activeStreak: true,
      lastActiveDateStr: true,
    },
  });
  return user;
}

/** 更新用户 Session 元数据 */
export async function updateUserSession(
  userId: string,
  data: {
    sessionCount: { increment: number };
    lastSessionAt: Date;
    avgSessionHour: number;
    activeStreak: number;
    lastActiveDateStr: string;
  },
): Promise<UserSessionUpdated> {
  return prisma.user.update({
    where: { id: userId },
    data: {
      sessionCount: data.sessionCount,
      lastSessionAt: data.lastSessionAt,
      avgSessionHour: data.avgSessionHour,
      activeStreak: data.activeStreak,
      lastActiveDateStr: data.lastActiveDateStr,
    },
    select: {
      sessionCount: true,
      lastSessionAt: true,
      avgSessionHour: true,
      activeStreak: true,
    },
  });
}

// ============================================================
// Conversation Queries（供 memory 模块使用）
// ============================================================

/** 查询对话及消息（含 role/content，用于记忆提取）。传 messagesAfter 只取该时刻之后的新消息（增量提取） */
export async function getConversationWithMessages(
  conversationId: string,
  messagesAfter?: Date,
): Promise<ConversationWithMessages | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: {
        ...(messagesAfter ? { where: { createdAt: { gt: messagesAfter } } } : {}),
        orderBy: { createdAt: 'asc' },
        take: 50,
      },
    },
  });
  if (!conv) return null;
  return {
    userId: conv.userId,
    messages: conv.messages.map(m => ({
      role: m.role,
      content: m.content,
      createdAt: m.createdAt,
    })),
  };
}

/** 查询对话的 userId */
export async function getConversationUserId(
  conversationId: string,
): Promise<string | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id: conversationId },
    select: { userId: true },
  });
  return conv?.userId ?? null;
}

// ============================================================
// MemoryExtractionLog Queries（cron retry 用）
// ============================================================

/**
 * 创建记忆提取日志（success 同时充当增量提取水位线；pending_retry 供 retry cron 重试）。
 * createdAt 传"最后一条已处理消息的时间"作为精确水位线，避免提取期间新写入的消息被跳过。
 */
export async function createExtractionLog(data: {
  conversationId: string;
  extractedCount: number;
  status: string;
  error?: string | null;
  createdAt?: Date;
}): Promise<void> {
  await prisma.memoryExtractionLog.create({ data });
}

/** 最近一次成功提取时间（增量提取水位线），无记录返回 null */
export async function findLastExtractionSuccessAt(
  conversationId: string,
): Promise<Date | null> {
  const log = await prisma.memoryExtractionLog.findFirst({
    where: { conversationId, status: 'success' },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  });
  return log?.createdAt ?? null;
}

/** 查询待重试的记忆提取日志 */
export async function findPendingExtractionLogs(
  maxRetries: number,
  batchSize: number,
): Promise<MemoryExtractionLogRow[]> {
  return prisma.memoryExtractionLog.findMany({
    where: {
      status: { in: ['failed', 'pending_retry'] },
      retryCount: { lt: maxRetries },
    },
    orderBy: { createdAt: 'asc' },
    take: batchSize,
  });
}

/** 更新记忆提取日志状态 */
export async function updateExtractionLog(
  id: string,
  data: {
    status: string;
    retryCount: number;
    error: string | null;
  },
): Promise<void> {
  await prisma.memoryExtractionLog.update({
    where: { id },
    data,
  });
}

// ============================================================
// LabSession/LabMessage Queries（lab-extract API 路由用）
// ============================================================

/** 创建 LabSession */
export async function createLabSession(data: {
  userId: string;
  labType: string;
  mentorId?: string | null;
  mbtiType?: string | null;
  customName?: string | null;
  groupConfig?: unknown;
  title?: string | null;
  messageCount: number;
}): Promise<LabSessionCreated> {
  return prisma.labSession.create({
    data: {
      userId: data.userId,
      labType: data.labType,
      mentorId: data.mentorId ?? null,
      mbtiType: data.mbtiType ?? null,
      customName: data.customName ?? null,
      groupConfig: (data.groupConfig ?? undefined) as any,
      title: data.title ?? null,
      messageCount: data.messageCount,
    },
    select: { id: true },
  });
}

/** 批量创建 LabMessage */
export async function createManyLabMessages(
  data: Array<{
    sessionId: string;
    role: string;
    content: string;
    mentorId: string | null;
    round: number | null;
  }>,
): Promise<void> {
  await prisma.labMessage.createMany({ data });
}
