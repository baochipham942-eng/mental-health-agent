/**
 * Eval 模块数据桥接层
 *
 * eval 模块唯一的 Prisma 访问点（Conversation/PromptVersion 等业务表）。
 * ConversationEvaluation 已迁移到 SQLite，通过 eval-store 访问。
 * 所有函数返回纯数据对象，不暴露 Prisma/SQLite 类型。
 */

import { prisma } from '@/lib/db/prisma';
import * as evalStore from './eval-store';

// Re-export eval-store types for consumers
export type { EvalRow, CreateEvalInput, UpdateEvalInput, AnnotationRow, AnnotationStats, UpsertAnnotationInput } from './eval-store';

// ============================================================
// Return Types（纯数据，不依赖 Prisma 类型）
// ============================================================

export interface ConvMessage {
  role: string;
  content: string;
  createdAt: Date;
}

export interface ConvMessageWithMeta extends ConvMessage {
  meta: Record<string, unknown> | null;
}

export interface ConvWithMessages {
  id: string;
  messages: ConvMessage[];
}

export interface ConvForTrace {
  id: string;
  title: string | null;
  messages: ConvMessageWithMeta[];
}

export interface LabMessageData {
  id: string;
  role: string;
  content: string;
  mentorId: string | null;
  meta: unknown;
  createdAt: Date;
}

export interface LabWithMessages {
  id: string;
  title: string | null;
  labType: string;
  messages: LabMessageData[];
}

export interface UnevalConv {
  id: string;
  messageCount: number;
}

export interface LastAssistantMsg {
  content: string;
  meta: Record<string, any> | null;
}

export interface TrendEval {
  evaluatedAt: Date;
  overallGrade: string;
  overallScore: number;
  evalSource: string | null;
}

export interface RecentEval {
  id: string;
  conversationId: string;
  overallGrade: string;
  overallScore: number;
  evaluatedAt: Date;
  evalSource: string | null;
  conversationTitle: string | null;
}

export interface PVData {
  id: string;
  name: string;
  content: string;
  hash: string;
  parentId: string | null;
  metadata: unknown;
  createdAt: Date;
}

export interface PVWithEvalCount extends PVData {
  evalCount: number;
}

export interface PVWithScores extends PVData {
  evaluationScores: number[];
}

export interface EvalScore {
  overallScore: number;
  overallGrade: string;
}

// ============================================================
// Conversation Queries
// ============================================================

/** 获取对话及消息（用于回流采集） */
export async function getConversationWithMessages(id: string): Promise<ConvWithMessages | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id },
    include: {
      messages: {
        select: { role: true, content: true, createdAt: true },
        orderBy: { createdAt: 'asc' },
      },
    },
  });
  if (!conv) return null;
  return { id: conv.id, messages: conv.messages };
}

/** 获取对话及消息（含 meta，用于 trace 提取和轨迹评测） */
export async function getConversationWithMessageMeta(id: string): Promise<ConvForTrace | null> {
  const conv = await prisma.conversation.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      messages: {
        orderBy: { createdAt: 'asc' },
        select: { role: true, content: true, meta: true, createdAt: true },
      },
    },
  });
  if (!conv) return null;
  return {
    id: conv.id,
    title: conv.title,
    messages: conv.messages.map(m => ({
      role: m.role,
      content: m.content,
      meta: m.meta as Record<string, unknown> | null,
      createdAt: m.createdAt,
    })),
  };
}

// ============================================================
// Lab Session Queries
// ============================================================

/** 获取实验室会话及消息 */
export async function getLabSessionWithMessages(id: string): Promise<LabWithMessages | null> {
  const session = await prisma.labSession.findUnique({
    where: { id },
    include: {
      messages: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!session) return null;
  return {
    id: session.id,
    title: session.title,
    labType: session.labType,
    messages: session.messages.map(m => ({
      id: m.id,
      role: m.role,
      content: m.content,
      mentorId: m.mentorId,
      meta: m.meta,
      createdAt: m.createdAt,
    })),
  };
}

// ============================================================
// Message Queries
// ============================================================

/** 获取最后一条 assistant 消息（含 meta） */
export async function getLastAssistantMessage(conversationId: string): Promise<LastAssistantMsg | null> {
  const msg = await prisma.message.findFirst({
    where: { conversationId, role: 'assistant' },
    orderBy: { createdAt: 'desc' },
    select: { content: true, meta: true },
  });
  if (!msg) return null;
  return { content: msg.content, meta: (msg.meta as Record<string, any>) || null };
}

/** 获取最后一条 user 消息 */
export async function getLastUserMessage(conversationId: string): Promise<{ content: string } | null> {
  const msg = await prisma.message.findFirst({
    where: { conversationId, role: 'user' },
    orderBy: { createdAt: 'desc' },
    select: { content: true },
  });
  return msg;
}

// ============================================================
// OptimizationEvent Queries
// ============================================================

/** 查找待处理的 STUCK_LOOP 事件 */
export async function findPendingStuckLoop(conversationId: string): Promise<{ summary: string } | null> {
  const event = await prisma.optimizationEvent.findFirst({
    where: { conversationId, type: 'STUCK_LOOP', status: 'PENDING' },
  });
  if (!event) return null;
  return { summary: event.summary };
}

// ============================================================
// ConversationEvaluation Queries（SQLite via eval-store）
// ============================================================

/** 查找未评估的对话（跨库：PG conversations + SQLite evaluations） */
export async function findUnevaluatedConversations(cutoff: Date, limit: number): Promise<UnevalConv[]> {
  // 1. 从 SQLite 获取已有评估的 conversationId 集合
  const evaluatedIds = evalStore.getEvaluatedConversationIds();

  // 2. 从 PG 查询候选对话（有消息、更新时间在 cutoff 之后）
  const rows = await prisma.conversation.findMany({
    where: {
      updatedAt: { gte: cutoff },
      messages: { some: {} },
    },
    select: {
      id: true,
      _count: { select: { messages: true } },
    },
    take: limit * 3, // 多取一些，因为要过滤
    orderBy: { updatedAt: 'desc' },
  });

  // 3. 过滤掉已有评估的
  return rows
    .filter(r => !evaluatedIds.has(r.id))
    .slice(0, limit)
    .map(r => ({ id: r.id, messageCount: r._count.messages }));
}

/** 创建评估占位记录 */
export function createEvaluationPlaceholder(conversationId: string): void {
  evalStore.createEval({
    conversationId,
    userId: '',
    overallGrade: 'EVALUATING',
    evalSource: 'auto_cron',
  });
}

/** 更新评估来源标记 */
export function updateEvalSource(conversationId: string, source: string): void {
  evalStore.updateByConversationId(conversationId, { evalSource: source });
}

/** 标记评估为失败 */
export function markEvaluationFailed(conversationId: string): void {
  evalStore.updateByConversationId(conversationId, { overallGrade: 'FAILED' });
}

/** 查询评分趋势数据 */
export function findEvaluationsForTrend(cutoff: Date): TrendEval[] {
  return evalStore.findForTrend(cutoff.toISOString());
}

/** 查询最近评估（跨库：SQLite evals + PG conversation titles） */
export async function findRecentEvaluations(cutoff: Date, limit: number): Promise<RecentEval[]> {
  // 1. 从 SQLite 获取最近评估
  const evals = evalStore.findRecent(cutoff.toISOString(), limit);
  if (evals.length === 0) return [];

  // 2. 从 PG 批量获取对话标题
  const convIds = evals.map(e => e.conversationId);
  const convs = await prisma.conversation.findMany({
    where: { id: { in: convIds } },
    select: { id: true, title: true },
  });
  const titleMap = new Map(convs.map(c => [c.id, c.title]));

  return evals.map(e => ({
    id: e.id,
    conversationId: e.conversationId,
    overallGrade: e.overallGrade,
    overallScore: e.overallScore,
    evaluatedAt: e.evaluatedAt,
    evalSource: e.evalSource,
    conversationTitle: titleMap.get(e.conversationId) ?? null,
  }));
}

// ============================================================
// ConversationEvaluation CRUD（供 optimization 路由使用）
// ============================================================

/** 按 ID 查找评估 */
export function findEvalById(id: string) {
  return evalStore.findById(id);
}

/** 按 conversationId 查找评估 */
export function findEvalByConversationId(conversationId: string) {
  return evalStore.findByConversationId(conversationId);
}

/** 创建评估记录 */
export function createEval(input: evalStore.CreateEvalInput) {
  return evalStore.createEval(input);
}

/** 按 conversationId 更新评估 */
export function updateEvalByConversationId(conversationId: string, data: evalStore.UpdateEvalInput) {
  return evalStore.updateByConversationId(conversationId, data);
}

/** 按 ID 更新评估 */
export function updateEvalById(id: string, data: evalStore.UpdateEvalInput) {
  return evalStore.updateById(id, data);
}

/** 批量删除评估 */
export function deleteEvalsByIds(ids: string[]) {
  return evalStore.deleteManyByIds(ids);
}

/** 评估总数 */
export function countEvals() {
  return evalStore.countAll();
}

/** 按等级计数 */
export function countEvalsByGrades(grades: string[]) {
  return evalStore.countByGrades(grades);
}

/** 分页查询评估 */
export function findEvalsPaginated(skip: number, take: number) {
  return evalStore.findManyPaginated(skip, take);
}

/** 批量获取对话标题（供 optimization 路由拼接用） */
export async function getConversationTitles(ids: string[]): Promise<Map<string, string | null>> {
  if (ids.length === 0) return new Map();
  const convs = await prisma.conversation.findMany({
    where: { id: { in: ids } },
    select: { id: true, title: true },
  });
  return new Map(convs.map(c => [c.id, c.title]));
}

/** 查询有消息的对话数量 */
export async function countConversationsWithMessages(): Promise<number> {
  return prisma.conversation.count({ where: { messages: { some: {} } } });
}

/** 按 ID 列表查询对话（含 userId） */
export async function findConversationsByIds(ids: string[]): Promise<Array<{ id: string; userId: string; title: string | null }>> {
  return prisma.conversation.findMany({
    where: { id: { in: ids } },
    select: { id: true, userId: true, title: true },
  });
}

/** 查询最近有消息的对话 */
export async function findRecentConversationsWithMessages(take: number): Promise<Array<{
  id: string; userId: string; title: string | null; createdAt: Date; messageCount: number;
}>> {
  const rows = await prisma.conversation.findMany({
    where: { messages: { some: {} } },
    orderBy: { createdAt: 'desc' },
    take,
    select: {
      id: true, userId: true, title: true, createdAt: true,
      _count: { select: { messages: true } },
    },
  });
  return rows.map(r => ({
    id: r.id, userId: r.userId, title: r.title, createdAt: r.createdAt,
    messageCount: r._count.messages,
  }));
}

// ============================================================
// PromptVersion Queries
// ============================================================

function toPVData(pv: { id: string; name: string; content: string; hash: string; parentId: string | null; metadata: unknown; createdAt: Date }): PVData {
  return { id: pv.id, name: pv.name, content: pv.content, hash: pv.hash, parentId: pv.parentId, metadata: pv.metadata, createdAt: pv.createdAt };
}

/** 按 hash 查找 Prompt 版本 */
export async function findPromptVersionByHash(hash: string): Promise<PVData | null> {
  const pv = await prisma.promptVersion.findUnique({ where: { hash } });
  return pv ? toPVData(pv) : null;
}

/** 查找指定名称的最新版本 */
export async function findLatestPromptVersion(name: string): Promise<PVData | null> {
  const pv = await prisma.promptVersion.findFirst({
    where: { name },
    orderBy: { createdAt: 'desc' },
  });
  return pv ? toPVData(pv) : null;
}

/** 创建 Prompt 版本 */
export async function createPromptVersion(data: {
  name: string;
  content: string;
  hash: string;
  parentId: string | null;
  metadata?: unknown;
}): Promise<PVData> {
  const created = await prisma.promptVersion.create({
    data: {
      name: data.name,
      content: data.content,
      hash: data.hash,
      parentId: data.parentId,
      metadata: (data.metadata as any) || undefined,
    },
  });
  return toPVData(created);
}

/** 获取所有 Prompt 版本（按创建时间倒序） */
export async function findAllPromptVersions(): Promise<PVData[]> {
  const rows = await prisma.promptVersion.findMany({ orderBy: { createdAt: 'desc' } });
  return rows.map(toPVData);
}

/** 获取版本历史（跨库：PG versions + SQLite eval count） */
export async function findPromptVersionHistory(name: string): Promise<PVWithEvalCount[]> {
  const rows = await prisma.promptVersion.findMany({
    where: { name },
    orderBy: { createdAt: 'desc' },
  });
  // 从 SQLite 批量获取评估数量
  const versionIds = rows.map(pv => pv.id);
  const scoresMap = evalStore.findScoresByVersionIds(versionIds);
  return rows.map(pv => ({
    ...toPVData(pv),
    evalCount: scoresMap.get(pv.id)?.length ?? 0,
  }));
}

/** 获取版本关联的评分（SQLite） */
export function findVersionEvaluations(versionId: string): EvalScore[] {
  return evalStore.findScoresByVersionId(versionId);
}

/** 按 promptVersionId 查询完整评估记录（SQLite） */
export function findEvalsByVersionId(versionId: string) {
  return evalStore.findByVersionId(versionId);
}

/** 获取所有版本及评分（跨库：PG versions + SQLite eval scores） */
export async function findAllVersionsWithScores(): Promise<PVWithScores[]> {
  const rows = await prisma.promptVersion.findMany({
    orderBy: { createdAt: 'desc' },
  });
  // 从 SQLite 批量获取评分
  const versionIds = rows.map(pv => pv.id);
  const scoresMap = evalStore.findScoresByVersionIds(versionIds);
  return rows.map(pv => ({
    ...toPVData(pv),
    evaluationScores: scoresMap.get(pv.id) ?? [],
  }));
}

// ============================================================
// Eval Annotations（维度级人工标注）
// ============================================================

/** 创建或更新维度标注 */
export function upsertEvalAnnotation(input: evalStore.UpsertAnnotationInput) {
  return evalStore.upsertAnnotation(input);
}

/** 获取指定评估的所有标注 */
export function getEvalAnnotations(evaluationId: string) {
  return evalStore.getAnnotations(evaluationId);
}

/** 获取全局标注统计 */
export function getEvalAnnotationStats() {
  return evalStore.getAnnotationStats();
}

/** 获取最近评估的完整记录（含维度分数，用于维度统计） */
export function findRecentEvalsWithScores(cutoff: Date, limit: number) {
  return evalStore.findRecent(cutoff.toISOString(), limit);
}
