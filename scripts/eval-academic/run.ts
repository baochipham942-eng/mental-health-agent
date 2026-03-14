/**
 * 评测运行器（支持 benchmark + product 双模式）
 *
 * Benchmark 模式（默认）— 用学术数据集调用 Chat API:
 *   bun scripts/eval-academic/run.ts                              # 全部数据集，每个采样 20 条
 *   bun scripts/eval-academic/run.ts --dataset esconv              # 只跑 ESConv
 *   bun scripts/eval-academic/run.ts --dataset psy-insight         # 只跑 Psy-Insight
 *   bun scripts/eval-academic/run.ts --dataset cpsycoun            # 只跑 CPsyCounE
 *   bun scripts/eval-academic/run.ts --limit 50                    # 每个数据集最多 50 条
 *   bun scripts/eval-academic/run.ts --skip-judge                  # 跳过 LLM Judge（只跑代码检查）
 *   bun scripts/eval-academic/run.ts --dataset esconv --limit 5    # 快速测试
 *
 * Product 模式 — 评测已有的真实对话:
 *   bun scripts/eval-academic/run.ts --mode product --conversations id1,id2
 *   bun scripts/eval-academic/run.ts --mode product --lab-sessions id1,id2
 *   bun scripts/eval-academic/run.ts --mode product --conversations id1 --lab-sessions id2 --skip-judge
 */

import dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import * as childProcess from 'child_process';
import {
  getCases, createRun, finishRun, insertResult,
  getDatasets, closeDb, type EvalCaseRow, type DialogTurn,
} from './db';
import { runCodeChecks, runLLMJudges, computeConfidenceInterval, type CodeCheckResult, type JudgeResult, type WeightPreset } from './judges';

dotenv.config({ path: path.join(__dirname, '../../.env.local') });
dotenv.config({ path: path.join(__dirname, '../../.env') });

const API_URL = process.env.EVAL_API_URL || 'http://localhost:3002/api/chat';
const JUDGE_API_KEY = process.env.JUDGE_API_KEY || process.env.DEEPSEEK_API_KEY || '';
const JUDGE_API_URL = process.env.JUDGE_API_URL || (process.env.DEEPSEEK_API_URL?.replace(/\/chat\/completions$/, '') || 'https://api.deepseek.com/v1');
const JUDGE_MODEL = process.env.JUDGE_MODEL || process.env.DEEPSEEK_CHAT_MODEL || 'deepseek-chat';
const EVAL_CHAT_MODEL = process.env.EVAL_CHAT_MODEL || '';  // 评测用的对话模型（空=默认 deepseek）
const EVAL_CHAT_PROVIDER = process.env.EVAL_CHAT_PROVIDER || '';  // 评测用的 provider（空=自动推断）
const DEFAULT_LIMIT = 20;

// ========== 调用心灵树洞 API ==========

interface ChatResponse {
  reply: string;
  routeType: string;
  safetyLabel: string;
  ttftMs: number;
  totalMs: number;
  // v3: 新增评测数据源
  toolCalls: Array<{ name: string; arguments?: any }>;
  emotionTrajectory: number[];
  dialogueIntent: string | null;
}

async function callChatAPI(
  message: string,
  history: Array<{ role: string; content: string }>,
  sessionId: string,
): Promise<ChatResponse> {
  const startedAt = Date.now();
  let ttftMs = 0;
  let reply = '';
  let routeType = 'unknown';
  let safetyLabel = 'unknown';
  let toolCalls: Array<{ name: string; arguments?: any }> = [];
  let emotionTrajectory: number[] = [];
  let dialogueIntent: string | null = null;

  const response = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, history, sessionId, ...(EVAL_CHAT_PROVIDER ? { provider: EVAL_CHAT_PROVIDER } : {}), ...(EVAL_CHAT_MODEL ? { model: EVAL_CHAT_MODEL } : {}) }),
  });

  if (!response.ok) {
    throw new Error(`API ${response.status}: ${await response.text()}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error('No response body');
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });

    if (ttftMs === 0 && chunk.includes('0:')) {
      ttftMs = Date.now() - startedAt;
    }

    for (const line of chunk.split('\n')) {
      if (!line.trim()) continue;
      if (line.startsWith('0:')) {
        try { reply += JSON.parse(line.slice(2)); } catch {}
      }
      if (line.startsWith('2:') || line.startsWith('d:')) {
        try {
          const data = JSON.parse(line.slice(2));
          const meta = Array.isArray(data) ? data[0] : data;
          if (meta?.routeType) routeType = meta.routeType;
          if (meta?.safety?.label) safetyLabel = meta.safety.label;
          // v3: 提取新增评测数据
          if (Array.isArray(meta?.toolCalls)) toolCalls = meta.toolCalls;
          if (Array.isArray(meta?.emotionTrajectory)) emotionTrajectory = meta.emotionTrajectory;
          if (meta?.dialogueIntent) dialogueIntent = meta.dialogueIntent;
        } catch {}
      }
    }
  }

  return { reply: reply.trim(), routeType, safetyLabel, ttftMs, totalMs: Date.now() - startedAt, toolCalls, emotionTrajectory, dialogueIntent };
}

// ========== 评测单条用例 ==========

interface CaseEvalResult {
  caseId: string;
  dataset: string;
  turnResults: Array<{
    turnIndex: number;
    userInput: string;
    aiReply: string;
    referenceReply: string;
    referenceStrategy?: string;
    routeType: string;
    safetyLabel: string;
    ttftMs: number;
    totalMs: number;
    codeChecks: CodeCheckResult[];
    judgeResults: JudgeResult[];
  }>;
}

async function evalCase(
  caseRow: EvalCaseRow,
  runId: string,
  skipJudge: boolean,
): Promise<CaseEvalResult> {
  const dialog: DialogTurn[] = JSON.parse(caseRow.dialog_json);
  const sessionId = `eval-academic-${runId}-${caseRow.id}`;
  const history: Array<{ role: string; content: string }> = [];
  const result: CaseEvalResult = {
    caseId: caseRow.id,
    dataset: caseRow.dataset_id,
    turnResults: [],
  };

  // 找到所有用户轮次及其下一个 assistant 回复（作为 reference）
  const userTurns: Array<{
    index: number;
    userMsg: string;
    refReply?: string;
    refStrategy?: string;
    historyBefore: Array<{ role: string; content: string }>;
  }> = [];

  for (let i = 0; i < dialog.length; i++) {
    if (dialog[i].role === 'user') {
      const nextAssistant = dialog[i + 1]?.role === 'assistant' ? dialog[i + 1] : undefined;
      userTurns.push({
        index: i,
        userMsg: dialog[i].content,
        refReply: nextAssistant?.content,
        refStrategy: nextAssistant?.strategy || dialog[i].strategy,
        historyBefore: [...history],
      });
    }
    history.push({ role: dialog[i].role, content: dialog[i].content });
  }

  // 对每个用户轮次，用我们的模型生成回复并评判
  // 为避免 API 成本过高，只在 3 个关键位置切入: 第 1 轮、中间轮、最后轮
  const cutPoints = selectCutPoints(userTurns.length);
  for (const cutIdx of cutPoints) {
    if (cutIdx >= userTurns.length) continue;
    const turn = userTurns[cutIdx];

    // 用原始对话历史（而非我们的回复），确保上下文一致
    const historyForApi = turn.historyBefore;

    try {
      // 调用心灵树洞 API
      const chatResp = await callChatAPI(turn.userMsg, historyForApi, sessionId);

      // 代码检查
      const codeChecks = runCodeChecks(chatResp.reply);

      // LLM Judge（传入 v3 新增数据源）
      const isLastTurn = cutIdx === userTurns.length - 1;
      const toolCallsStr = chatResp.toolCalls.length > 0
        ? chatResp.toolCalls.map(tc => `${tc.name}(${JSON.stringify(tc.arguments || {})})`).join('\n')
        : undefined;
      const emotionStr = chatResp.emotionTrajectory.length > 0
        ? chatResp.emotionTrajectory.join(' → ')
        : undefined;

      let judgeResults: JudgeResult[] = [];
      if (!skipJudge && JUDGE_API_KEY) {
        // 构建完整对话文本（仅最后一轮传入，用于 summary-quality judge）
        const fullConv = isLastTurn
          ? [...historyForApi, { role: 'user', content: turn.userMsg }, { role: 'assistant', content: chatResp.reply }]
              .map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n')
          : undefined;

        judgeResults = await runLLMJudges({
          userInput: turn.userMsg,
          aiReply: chatResp.reply,
          history: historyForApi,
          turnIndex: cutIdx,
          totalTurns: userTurns.length,
          toolCalls: toolCallsStr,
          emotionScores: emotionStr,
          fullConversation: fullConv,
          isLastTurn,
          apiKey: JUDGE_API_KEY,
          apiUrl: JUDGE_API_URL,
          model: JUDGE_MODEL,
        });
      }

      const turnResult = {
        turnIndex: cutIdx,
        userInput: turn.userMsg,
        aiReply: chatResp.reply,
        referenceReply: turn.refReply || '',
        referenceStrategy: turn.refStrategy,
        routeType: chatResp.routeType,
        safetyLabel: chatResp.safetyLabel,
        ttftMs: chatResp.ttftMs,
        totalMs: chatResp.totalMs,
        codeChecks,
        judgeResults,
      };

      result.turnResults.push(turnResult);

      // 存储到数据库
      const judgeMap: Record<string, { result: string; critique: string }> = {};
      for (const j of judgeResults) {
        judgeMap[j.dimension] = { result: j.result, critique: j.critique };
      }
      const codeMap: Record<string, string> = {};
      for (const c of codeChecks) {
        codeMap[c.check] = c.result;
      }

      insertResult({
        runId,
        caseId: caseRow.id,
        turnIndex: cutIdx,
        userInput: turn.userMsg,
        aiReply: chatResp.reply,
        referenceReply: turn.refReply,
        referenceStrategy: turn.refStrategy,
        routeType: chatResp.routeType,
        safetyLabel: chatResp.safetyLabel,
        ttftMs: chatResp.ttftMs,
        totalMs: chatResp.totalMs,
        judgeResults: judgeMap,
        codeChecks: codeMap,
      });

      // 打印进度
      const passCount = [...codeChecks.filter(c => c.result === 'pass'), ...judgeResults.filter(j => j.result === 'Pass')].length;
      const totalChecks = codeChecks.length + judgeResults.length;
      const replyPreview = chatResp.reply.slice(0, 60) + (chatResp.reply.length > 60 ? '...' : '');
      console.log(`    Turn ${cutIdx + 1}: ${passCount}/${totalChecks} pass | ${chatResp.ttftMs}ms | ${replyPreview}`);

    } catch (err: any) {
      console.error(`    Turn ${cutIdx + 1}: ❌ ${err.message}`);
    }

    // 避免 rate limit
    await sleep(300);
  }

  return result;
}

function selectCutPoints(totalUserTurns: number): number[] {
  if (totalUserTurns <= 3) {
    return Array.from({ length: totalUserTurns }, (_, i) => i);
  }
  // 第 1 轮、中间轮、最后轮
  const mid = Math.floor(totalUserTurns / 2);
  return [0, mid, totalUserTurns - 1];
}

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ========== Product 模式: 评测已有对话 ==========

/** 根据 trace 类型推断权重预设 */
function inferWeightPreset(trace: { type: string; labType?: string }): WeightPreset {
  if (trace.type === 'lab') {
    if (trace.labType === 'group') return 'group';
    return 'mentor'; // wisdom, custom, mbti 都用 mentor 预设
  }
  return 'default';
}

interface ProductCaseResult {
  traceId: string;
  traceType: 'conversation' | 'lab';
  labType?: string;
  turnResults: Array<{
    turnIndex: number;
    userInput: string;
    aiReply: string;
    routeType: string;
    safetyLabel: string;
    codeChecks: CodeCheckResult[];
    judgeResults: JudgeResult[];
  }>;
}

async function evalProductTrace(
  trace: any, // ConversationTrace from trace-extractor
  runId: string,
  skipJudge: boolean,
): Promise<ProductCaseResult> {
  const result: ProductCaseResult = {
    traceId: trace.id,
    traceType: trace.type,
    labType: trace.labType,
    turnResults: [],
  };

  // 构建 user/assistant 对
  const pairs: Array<{
    turnIndex: number;
    userMsg: string;
    aiReply: string;
    historyBefore: Array<{ role: string; content: string }>;
    isLastTurn: boolean;
  }> = [];

  const history: Array<{ role: string; content: string }> = [];
  let pairIndex = 0;

  for (let i = 0; i < trace.messages.length; i++) {
    const msg = trace.messages[i];
    if (msg.role === 'user') {
      // 找到下一个 assistant 回复
      const nextAssistant = trace.messages.slice(i + 1).find((m: any) => m.role === 'assistant');
      if (nextAssistant) {
        pairs.push({
          turnIndex: pairIndex,
          userMsg: msg.content,
          aiReply: nextAssistant.content,
          historyBefore: [...history],
          isLastTurn: false,
        });
        pairIndex++;
      }
    }
    history.push({ role: msg.role, content: msg.content });
  }

  // 标记最后一轮
  if (pairs.length > 0) {
    pairs[pairs.length - 1].isLastTurn = true;
  }

  // 选择切入点（同 benchmark 模式的策略）
  const cutPoints = selectCutPoints(pairs.length);

  // 构建完整对话文本（用于 summary/emotion judge）
  const fullConversation = trace.messages
    .map((m: any) => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`)
    .join('\n');

  // 构建工具调用和情绪数据
  const toolCallsStr = trace.toolCalls?.length > 0
    ? trace.toolCalls.map((tc: any) => `${tc.name}(${JSON.stringify(tc.arguments || {})})`).join('\n')
    : '';
  const emotionStr = trace.emotionTrajectory?.length > 0
    ? trace.emotionTrajectory.join(' → ')
    : '';

  // 提取路由类型和安全标签
  const routeType = trace.routeTypes?.length > 0 ? trace.routeTypes[trace.routeTypes.length - 1] : 'unknown';
  const safetyLabel = trace.safetyLabels?.length > 0 ? trace.safetyLabels[trace.safetyLabels.length - 1] : 'unknown';

  // Case ID: 使用 trace type + id 前 8 位
  const caseId = `${trace.type}:${trace.id.slice(0, 8)}`;

  for (const cutIdx of cutPoints) {
    if (cutIdx >= pairs.length) continue;
    const pair = pairs[cutIdx];

    try {
      // 代码检查
      const codeChecks = runCodeChecks(pair.aiReply);

      // LLM Judge（传入 product 模式的丰富数据）
      let judgeResults: JudgeResult[] = [];
      if (!skipJudge && JUDGE_API_KEY) {
        judgeResults = await runLLMJudges({
          userInput: pair.userMsg,
          aiReply: pair.aiReply,
          history: pair.historyBefore,
          turnIndex: cutIdx,
          totalTurns: pairs.length,
          toolCalls: toolCallsStr || undefined,
          emotionScores: emotionStr || undefined,
          fullConversation: pair.isLastTurn ? fullConversation : undefined,
          isLastTurn: pair.isLastTurn,
          apiKey: JUDGE_API_KEY,
          apiUrl: JUDGE_API_URL,
          model: JUDGE_MODEL,
        });
      }

      const turnResult = {
        turnIndex: cutIdx,
        userInput: pair.userMsg,
        aiReply: pair.aiReply,
        routeType,
        safetyLabel,
        codeChecks,
        judgeResults,
      };

      result.turnResults.push(turnResult);

      // 存储到 SQLite
      const judgeMap: Record<string, { result: string; critique: string }> = {};
      for (const j of judgeResults) {
        judgeMap[j.dimension] = { result: j.result, critique: j.critique };
      }
      const codeMap: Record<string, string> = {};
      for (const c of codeChecks) {
        codeMap[c.check] = c.result;
      }

      insertResult({
        runId,
        caseId,
        turnIndex: cutIdx,
        userInput: pair.userMsg,
        aiReply: pair.aiReply,
        routeType,
        safetyLabel,
        ttftMs: 0,   // product 模式无延迟数据
        totalMs: 0,
        judgeResults: judgeMap,
        codeChecks: codeMap,
      });

      const passCount = [...codeChecks.filter(c => c.result === 'pass'), ...judgeResults.filter(j => j.result === 'Pass')].length;
      const totalChecks = codeChecks.length + judgeResults.length;
      const replyPreview = pair.aiReply.slice(0, 60) + (pair.aiReply.length > 60 ? '...' : '');
      console.log(`    Turn ${cutIdx + 1}: ${passCount}/${totalChecks} pass | ${replyPreview}`);

    } catch (err: any) {
      console.error(`    Turn ${cutIdx + 1}: ❌ ${err.message}`);
    }

    await sleep(300);
  }

  return result;
}

/**
 * Product 模式主流程
 */
async function runProductMode(args: {
  conversationIds: string[];
  labSessionIds: string[];
  skipJudge: boolean;
  gitCommit: string;
}) {
  // 动态导入 trace-extractor（它依赖 Prisma/PostgreSQL）
  const { extractTraces } = await import('../../lib/eval/trace-extractor');

  console.log('\n📦 从 PostgreSQL 提取对话 trace...');
  const traces = await extractTraces(args.conversationIds, args.labSessionIds);

  if (traces.length === 0) {
    console.error('❌ 未找到任何对话。请确认 ID 有效且数据库可达。');
    process.exit(1);
  }

  console.log(`  找到 ${traces.length} 条对话（${traces.filter(t => t.type === 'conversation').length} 普通 + ${traces.filter(t => t.type === 'lab').length} 实验室）`);

  const runId = `product-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

  console.log(`\n🔬 Product 模式评测`);
  console.log(`  运行 ID: ${runId}`);
  console.log(`  对话数: ${traces.length}`);
  console.log(`  LLM Judge: ${args.skipJudge ? '跳过' : JUDGE_API_KEY ? '启用' : '⚠️ 无 API Key，跳过'}`);
  console.log(`  Git: ${args.gitCommit || '未知'}`);

  createRun(runId, 'product', { mode: 'product', conversationIds: args.conversationIds, labSessionIds: args.labSessionIds, skipJudge: args.skipJudge, gitCommit: args.gitCommit });

  // 逐条评测（复用 CaseEvalResult 兼容的格式，用于汇总）
  const allResults: CaseEvalResult[] = [];

  for (let i = 0; i < traces.length; i++) {
    const trace = traces[i];
    const label = trace.type === 'lab' ? `lab:${trace.labType}` : 'conversation';
    const title = trace.title?.slice(0, 30) || trace.id.slice(0, 8);
    const preset = inferWeightPreset(trace);
    console.log(`\n[${i + 1}/${traces.length}] ${label} "${title}" (${trace.messages.length} msgs, 权重: ${preset})`);

    const productResult = await evalProductTrace(trace, runId, args.skipJudge || !JUDGE_API_KEY);

    // 转换为 CaseEvalResult 兼容格式，复用 computeSummary
    allResults.push({
      caseId: `${trace.type}:${trace.id.slice(0, 8)}`,
      dataset: `product-${trace.type}`,
      turnResults: productResult.turnResults.map(t => ({
        ...t,
        referenceReply: '',
        ttftMs: 0,
        totalMs: 0,
      })),
    });

    if ((i + 1) % 5 === 0 || i === traces.length - 1) {
      const midSummary = computeSummary(allResults);
      const totalChecks = Object.values(midSummary.codeCheckStats).reduce((s, v) => s + v.total, 0)
        + Object.values(midSummary.judgeStats).reduce((s, v) => s + v.total, 0);
      const totalPass = Object.values(midSummary.codeCheckStats).reduce((s, v) => s + v.pass, 0)
        + Object.values(midSummary.judgeStats).reduce((s, v) => s + v.pass, 0);
      console.log(`  --- 进度 ${i + 1}/${traces.length} | 总通过率: ${totalChecks > 0 ? ((totalPass / totalChecks) * 100).toFixed(1) : '0'}%`);
    }
  }

  // 汇总 + 报告
  const summary = computeSummary(allResults);
  finishRun(runId, summary);
  printSummary(summary, runId);

  const reportDir = path.join(__dirname, '../../tests/eval/results');
  fs.mkdirSync(reportDir, { recursive: true });

  const htmlPath = path.join(reportDir, `product-${runId}.html`);
  fs.writeFileSync(htmlPath, generateHTMLReport(summary, allResults, runId));
  console.log(`\n  📁 HTML 报告: ${htmlPath}`);

  const jsonPath = path.join(reportDir, `product-${runId}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({ runId, mode: 'product', summary, results: allResults }, null, 2));
  console.log(`  📁 JSON 数据: ${jsonPath}`);

  closeDb();

  // 断开 Prisma 连接
  try {
    const { prisma } = await import('../../lib/db/prisma');
    await prisma.$disconnect();
  } catch {}

  console.log('\n✅ Product 评测完成');
}

// ========== 汇总报告 ==========

function computeSummary(allResults: CaseEvalResult[]) {
  let totalTurns = 0;
  let totalTtft = 0;
  let totalTime = 0;
  const codeCheckStats: Record<string, { pass: number; total: number }> = {};
  const judgeStats: Record<string, { pass: number; total: number }> = {};
  const failCases: Array<{ caseId: string; turn: number; dimension: string; critique: string }> = [];

  for (const c of allResults) {
    for (const t of c.turnResults) {
      totalTurns++;
      totalTtft += t.ttftMs;
      totalTime += t.totalMs;

      for (const cc of t.codeChecks) {
        if (!codeCheckStats[cc.check]) codeCheckStats[cc.check] = { pass: 0, total: 0 };
        codeCheckStats[cc.check].total++;
        if (cc.result === 'pass') codeCheckStats[cc.check].pass++;
        else failCases.push({ caseId: c.caseId, turn: t.turnIndex, dimension: cc.check, critique: cc.detail || '' });
      }

      for (const j of t.judgeResults) {
        if (!judgeStats[j.dimension]) judgeStats[j.dimension] = { pass: 0, total: 0 };
        judgeStats[j.dimension].total++;
        if (j.result === 'Pass') judgeStats[j.dimension].pass++;
        else failCases.push({ caseId: c.caseId, turn: t.turnIndex, dimension: j.dimension, critique: j.critique });
      }
    }
  }

  return {
    totalCases: allResults.length,
    totalTurns,
    avgTtftMs: totalTurns > 0 ? Math.round(totalTtft / totalTurns) : 0,
    avgTotalMs: totalTurns > 0 ? Math.round(totalTime / totalTurns) : 0,
    codeCheckStats,
    judgeStats,
    failCases: failCases.slice(0, 50),  // 只保留前 50 个失败案例
  };
}

function printSummary(summary: ReturnType<typeof computeSummary>, runId: string) {
  console.log('\n' + '='.repeat(70));
  console.log('📊 学术评测汇总报告');
  console.log('='.repeat(70));
  console.log(`  运行 ID: ${runId}`);
  console.log(`  评测用例: ${summary.totalCases} 条 | 评测轮次: ${summary.totalTurns}`);
  console.log(`  平均 TTFT: ${summary.avgTtftMs}ms | 平均响应: ${summary.avgTotalMs}ms`);

  console.log('\n  📋 代码检查通过率:');
  for (const [check, stats] of Object.entries(summary.codeCheckStats)) {
    const ci = computeConfidenceInterval(stats.pass, stats.total);
    const rate = (ci.rate * 100).toFixed(1);
    const bar = '█'.repeat(Math.round(ci.rate * 20)).padEnd(20, '░');
    const ciStr = stats.total >= 10 ? ` [${(ci.ci95Lower * 100).toFixed(0)}-${(ci.ci95Upper * 100).toFixed(0)}%]` : '';
    console.log(`    ${check.padEnd(20)} ${bar} ${rate}% (${stats.pass}/${stats.total})${ciStr}`);
  }

  if (Object.keys(summary.judgeStats).length > 0) {
    console.log('\n  🧑‍⚖️ LLM Judge 通过率 (CoT):');
    for (const [dim, stats] of Object.entries(summary.judgeStats)) {
      const ci = computeConfidenceInterval(stats.pass, stats.total);
      const rate = (ci.rate * 100).toFixed(1);
      const bar = '█'.repeat(Math.round(ci.rate * 20)).padEnd(20, '░');
      const ciStr = stats.total >= 10 ? ` [${(ci.ci95Lower * 100).toFixed(0)}-${(ci.ci95Upper * 100).toFixed(0)}%]` : '';
      console.log(`    ${dim.padEnd(25)} ${bar} ${rate}% (${stats.pass}/${stats.total})${ciStr}`);
    }
  }

  if (summary.failCases.length > 0) {
    console.log(`\n  ⚠️ 失败案例 (前 ${Math.min(summary.failCases.length, 10)} 个):`);
    for (const fc of summary.failCases.slice(0, 10)) {
      console.log(`    ${fc.caseId} Turn${fc.turn + 1} [${fc.dimension}]: ${fc.critique.slice(0, 80)}`);
    }
  }
}

// ========== HTML 报告 ==========

function generateHTMLReport(summary: ReturnType<typeof computeSummary>, allResults: CaseEvalResult[], runId: string): string {
  const codeRows = Object.entries(summary.codeCheckStats)
    .map(([k, v]) => {
      const rate = v.total > 0 ? ((v.pass / v.total) * 100).toFixed(1) : '0';
      return `<tr><td>${k}</td><td>${v.pass}/${v.total}</td><td><div class="bar"><div class="fill" style="width:${rate}%"></div></div></td><td>${rate}%</td></tr>`;
    }).join('');

  const judgeRows = Object.entries(summary.judgeStats)
    .map(([k, v]) => {
      const rate = v.total > 0 ? ((v.pass / v.total) * 100).toFixed(1) : '0';
      return `<tr><td>${k}</td><td>${v.pass}/${v.total}</td><td><div class="bar"><div class="fill" style="width:${rate}%"></div></div></td><td>${rate}%</td></tr>`;
    }).join('');

  const failRows = summary.failCases.slice(0, 30)
    .map(fc => `<tr><td>${fc.caseId}</td><td>Turn ${fc.turn + 1}</td><td><span class="tag fail">${fc.dimension}</span></td><td>${fc.critique}</td></tr>`)
    .join('');

  // 按数据集分组统计
  const datasetGroups: Record<string, { total: number; passRate: number }> = {};
  for (const r of allResults) {
    if (!datasetGroups[r.dataset]) datasetGroups[r.dataset] = { total: 0, passRate: 0 };
    datasetGroups[r.dataset].total++;
    const allChecks = r.turnResults.flatMap(t => [
      ...t.codeChecks.map(c => c.result === 'pass'),
      ...t.judgeResults.map(j => j.result === 'Pass'),
    ]);
    const passRate = allChecks.length > 0 ? allChecks.filter(Boolean).length / allChecks.length : 0;
    datasetGroups[r.dataset].passRate += passRate;
  }

  const datasetRows = Object.entries(datasetGroups)
    .map(([k, v]) => {
      const avgRate = v.total > 0 ? ((v.passRate / v.total) * 100).toFixed(1) : '0';
      return `<tr><td>${k}</td><td>${v.total}</td><td>${avgRate}%</td></tr>`;
    }).join('');

  return `<!DOCTYPE html>
<html lang="zh"><head><meta charset="UTF-8"><title>学术评测报告 - ${runId}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, sans-serif; background: #f5f5f5; color: #333; padding: 24px; }
  .container { max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 24px; margin-bottom: 8px; }
  .meta { color: #666; margin-bottom: 24px; font-size: 14px; }
  .cards { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px; }
  .card { background: white; padding: 16px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .card .num { font-size: 28px; font-weight: 700; color: #1a1a1a; }
  .card .label { font-size: 12px; color: #888; margin-top: 4px; }
  .section { background: white; border-radius: 8px; padding: 20px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
  .section h2 { font-size: 16px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #eee; }
  th { background: #fafafa; font-weight: 600; }
  .bar { width: 120px; height: 8px; background: #eee; border-radius: 4px; display: inline-block; }
  .fill { height: 100%; background: #4CAF50; border-radius: 4px; transition: width 0.3s; }
  .tag { padding: 2px 8px; border-radius: 4px; font-size: 11px; }
  .tag.fail { background: #FFEBEE; color: #C62828; }
  .tag.pass { background: #E8F5E9; color: #2E7D32; }
</style></head><body>
<div class="container">
  <h1>学术评测报告</h1>
  <div class="meta">运行 ID: ${runId} | ${new Date().toLocaleString('zh-CN')}</div>

  <div class="cards">
    <div class="card"><div class="num">${summary.totalCases}</div><div class="label">评测用例</div></div>
    <div class="card"><div class="num">${summary.totalTurns}</div><div class="label">评测轮次</div></div>
    <div class="card"><div class="num">${summary.avgTtftMs}ms</div><div class="label">平均 TTFT</div></div>
    <div class="card"><div class="num">${summary.failCases.length}</div><div class="label">失败项</div></div>
  </div>

  <div class="section">
    <h2>按数据集</h2>
    <table><tr><th>数据集</th><th>用例数</th><th>平均通过率</th></tr>${datasetRows}</table>
  </div>

  <div class="section">
    <h2>代码检查通过率</h2>
    <table><tr><th>检查项</th><th>通过/总数</th><th>进度</th><th>通过率</th></tr>${codeRows}</table>
  </div>

  ${judgeRows ? `<div class="section">
    <h2>LLM Judge 通过率</h2>
    <table><tr><th>维度</th><th>通过/总数</th><th>进度</th><th>通过率</th></tr>${judgeRows}</table>
  </div>` : ''}

  ${failRows ? `<div class="section">
    <h2>失败案例</h2>
    <table><tr><th>用例</th><th>轮次</th><th>维度</th><th>原因</th></tr>${failRows}</table>
  </div>` : ''}
</div></body></html>`;
}

// ========== 主流程 ==========

function parseArg(args: string[], name: string): string | null {
  const eqForm = args.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
  if (eqForm) return eqForm;
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return null;
}

async function main() {
  const args = process.argv.slice(2);
  const mode = parseArg(args, 'mode') || 'benchmark';
  const skipJudge = args.includes('--skip-judge');

  // 获取 git commit
  let gitCommit = '';
  try {
    gitCommit = childProcess.execSync('git rev-parse --short HEAD', { cwd: path.join(__dirname, '../..') }).toString().trim();
  } catch {}

  // ===== Product 模式 =====
  if (mode === 'product') {
    const convArg = parseArg(args, 'conversations');
    const labArg = parseArg(args, 'lab-sessions');

    if (!convArg && !labArg) {
      console.error('❌ Product 模式需要指定 --conversations 和/或 --lab-sessions');
      console.error('   示例: bun scripts/eval-academic/run.ts --mode product --conversations id1,id2');
      process.exit(1);
    }

    const conversationIds = convArg ? convArg.split(',').filter(Boolean) : [];
    const labSessionIds = labArg ? labArg.split(',').filter(Boolean) : [];

    await runProductMode({ conversationIds, labSessionIds, skipJudge, gitCommit });
    return;
  }

  // ===== Benchmark 模式（原有逻辑）=====
  const datasetFilter = parseArg(args, 'dataset');
  const limit = parseInt(parseArg(args, 'limit') || String(DEFAULT_LIMIT));

  // 检查数据是否已导入
  const datasets = getDatasets();
  if (datasets.length === 0) {
    console.error('❌ 数据库为空，请先运行: bun scripts/eval-academic/prepare.ts');
    process.exit(1);
  }

  const runId = `academic-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}`;

  console.log('🎓 学术数据集评测');
  console.log(`  运行 ID: ${runId}`);
  console.log(`  数据集: ${datasetFilter || '全部'} | 每集上限: ${limit} 条`);
  console.log(`  对话模型: ${EVAL_CHAT_MODEL || 'deepseek (默认)'}`);
  console.log(`  LLM Judge: ${skipJudge ? '跳过' : JUDGE_API_KEY ? '启用' : '⚠️ 无 API Key，跳过'}`);
  console.log(`  Chat API: ${API_URL}`);
  console.log(`  Git: ${gitCommit || '未知'}`);

  // 获取评测用例
  const casesArg = parseArg(args, 'cases');
  const specificCaseIds = casesArg ? casesArg.split(',').filter(Boolean) : [];

  const targetDatasets = datasetFilter ? [datasetFilter] : datasets.map(d => d.id);
  let allCases: EvalCaseRow[] = [];
  for (const ds of targetDatasets) {
    let cases = getCases(ds, specificCaseIds.length > 0 ? 9999 : limit);
    // 如果指定了具体 case IDs，按 ID 过滤
    if (specificCaseIds.length > 0) {
      cases = cases.filter(c => specificCaseIds.includes(c.id));
    }
    console.log(`  ${ds}: ${cases.length} 条`);
    allCases = allCases.concat(cases);
  }

  if (allCases.length === 0) {
    console.error('❌ 无评测用例');
    process.exit(1);
  }

  // 创建运行记录
  createRun(runId, datasetFilter, { limit, skipJudge, gitCommit });

  // 逐条评测
  const allResults: CaseEvalResult[] = [];
  for (let i = 0; i < allCases.length; i++) {
    const c = allCases[i];
    console.log(`\n[${i + 1}/${allCases.length}] ${c.id} (${c.category || '未分类'})`);
    const result = await evalCase(c, runId, skipJudge || !JUDGE_API_KEY);
    allResults.push(result);

    // 每 10 条或最后一条打印中间汇总
    if ((i + 1) % 10 === 0 || i === allCases.length - 1) {
      const midSummary = computeSummary(allResults);
      const totalChecks = Object.values(midSummary.codeCheckStats).reduce((s, v) => s + v.total, 0)
        + Object.values(midSummary.judgeStats).reduce((s, v) => s + v.total, 0);
      const totalPass = Object.values(midSummary.codeCheckStats).reduce((s, v) => s + v.pass, 0)
        + Object.values(midSummary.judgeStats).reduce((s, v) => s + v.pass, 0);
      console.log(`  --- 进度 ${i + 1}/${allCases.length} | 总通过率: ${totalChecks > 0 ? ((totalPass / totalChecks) * 100).toFixed(1) : '0'}%`);
    }
  }

  // 最终汇总
  const summary = computeSummary(allResults);
  finishRun(runId, summary);
  printSummary(summary, runId);

  // 生成 HTML 报告
  const reportDir = path.join(__dirname, '../../tests/eval/results');
  fs.mkdirSync(reportDir, { recursive: true });
  const htmlPath = path.join(reportDir, `academic-${runId}.html`);
  fs.writeFileSync(htmlPath, generateHTMLReport(summary, allResults, runId));
  console.log(`\n  📁 HTML 报告: ${htmlPath}`);

  // 同时保存 JSON
  const jsonPath = path.join(reportDir, `academic-${runId}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify({
    runId,
    model: EVAL_CHAT_MODEL || 'deepseek',
    summary,
    results: allResults,
  }, null, 2));
  console.log(`  📁 JSON 数据: ${jsonPath}`);

  closeDb();
  console.log('\n✅ 评测完成');
}

main().catch(err => {
  console.error('Fatal:', err);
  closeDb();
  process.exit(1);
});
