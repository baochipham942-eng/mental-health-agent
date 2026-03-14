/**
 * LLM Judge 校准系统
 *
 * 从 SQLite 评测结果中抽样生成校准集，支持人工标注后计算校准报告。
 * - extractCalibrationSamples: 分层抽样生成校准集
 * - computeCalibrationReport: 计算 TPR/TNR/Cohen's Kappa
 *
 * CLI:
 *   bun scripts/eval-academic/calibration.ts extract --run <runId>
 *   bun scripts/eval-academic/calibration.ts report
 */

import * as fs from 'fs';
import * as path from 'path';
import { getDb, getRunResults, closeDb } from './db';
import type { DialogTurn } from './db';

// ========== 类型定义 ==========

export interface CalibrationSample {
  id: string;                    // 格式: caseId-turn-N-dimension
  caseId: string;
  turnIndex: number;
  dimension: string;
  userInput: string;
  aiReply: string;
  history: Array<{ role: string; content: string }>;
  llmJudgeResult: 'Pass' | 'Fail';
  llmJudgeCritique: string;
  humanLabel: 'Pass' | 'Fail' | null;
  humanNote: string | null;
}

export interface ConfusionMatrix {
  tp: number;  // LLM=Pass, Human=Pass
  tn: number;  // LLM=Fail, Human=Fail
  fp: number;  // LLM=Pass, Human=Fail
  fn: number;  // LLM=Fail, Human=Pass
}

export interface DimensionCalibration {
  dimension: string;
  total: number;
  labeled: number;
  matrix: ConfusionMatrix;
  tpr: number;   // 真阳率 TP/(TP+FN)
  tnr: number;   // 真阴率 TN/(TN+FP)
  kappa: number;  // Cohen's Kappa
  status: 'good' | 'acceptable' | 'poor' | 'insufficient';
}

export interface CalibrationReport {
  totalSamples: number;
  labeledSamples: number;
  dimensions: DimensionCalibration[];
  overallKappa: number;
  generatedAt: string;
}

// ========== 常量 ==========

const LLM_JUDGE_DIMENSIONS = [
  'empathy-accuracy', 'safety-boundary', 'context-coherence',
  'guidance-quality', 'technique-appropriateness', 'tool-invocation',
  'emotion-trajectory', 'summary-quality', 'interpretation-accuracy',
  'premature-advice', 'empty-comfort', 'no-medical-label', 'no-gaslighting',
];

const CALIBRATION_DIR = path.join(process.cwd(), 'data/calibration');
const CALIBRATION_FILE = path.join(CALIBRATION_DIR, 'calibration-set-v1.json');

// ========== 核心函数 ==========

/**
 * 从指定 run 的评测结果中分层抽样生成校准集
 * - 25 个 Pass + 25 个 Fail（按 judge_results_json 中各维度结果）
 * - 每维度至少 3 个样本
 */
export function extractCalibrationSamples(runId: string, sampleSize = 50): CalibrationSample[] {
  const db = getDb();
  const results = getRunResults(runId);

  if (results.length === 0) {
    console.error(`运行 ${runId} 无评测结果`);
    return [];
  }

  // 将所有结果按维度+结果分组
  const passBucket: Array<{ result: any; dimension: string; judgeResult: string; critique: string }> = [];
  const failBucket: Array<{ result: any; dimension: string; judgeResult: string; critique: string }> = [];

  for (const row of results) {
    if (!row.judge_results_json) continue;
    let judgeResults: Record<string, { result: string; critique: string }>;
    try {
      judgeResults = JSON.parse(row.judge_results_json);
    } catch {
      continue;
    }

    for (const dim of LLM_JUDGE_DIMENSIONS) {
      const jr = judgeResults[dim];
      if (!jr || !jr.result) continue;

      const item = { result: row, dimension: dim, judgeResult: jr.result, critique: jr.critique || '' };
      if (jr.result === 'Pass') {
        passBucket.push(item);
      } else {
        failBucket.push(item);
      }
    }
  }

  // 打乱顺序
  shuffle(passBucket);
  shuffle(failBucket);

  const halfSize = Math.floor(sampleSize / 2);
  const selected: typeof passBucket = [];

  // 第一步：每维度至少 3 个样本（Pass 和 Fail 各取）
  const dimCount: Record<string, number> = {};
  const MIN_PER_DIM = 3;

  for (const dim of LLM_JUDGE_DIMENSIONS) {
    dimCount[dim] = 0;
  }

  // 从 Pass 和 Fail 各取保底样本
  for (const bucket of [passBucket, failBucket]) {
    for (const dim of LLM_JUDGE_DIMENSIONS) {
      if (dimCount[dim] >= MIN_PER_DIM) continue;
      const needed = MIN_PER_DIM - dimCount[dim];
      const candidates = bucket.filter(
        b => b.dimension === dim && !selected.includes(b)
      );
      const take = candidates.slice(0, needed);
      selected.push(...take);
      dimCount[dim] += take.length;
    }
  }

  // 第二步：填充到目标数量
  const passInSelected = selected.filter(s => s.judgeResult === 'Pass').length;
  const failInSelected = selected.filter(s => s.judgeResult === 'Fail').length;

  const passNeeded = Math.max(0, halfSize - passInSelected);
  const failNeeded = Math.max(0, halfSize - failInSelected);

  const selectedSet = new Set(selected);
  const remainingPass = passBucket.filter(b => !selectedSet.has(b));
  const remainingFail = failBucket.filter(b => !selectedSet.has(b));

  selected.push(...remainingPass.slice(0, passNeeded));
  selected.push(...remainingFail.slice(0, failNeeded));

  // 截断到 sampleSize
  const finalItems = selected.slice(0, sampleSize);

  // 构建校准样本
  const samples: CalibrationSample[] = [];
  for (const item of finalItems) {
    const row = item.result;
    const history = buildHistory(db, row.case_id, row.turn_index);

    const sampleId = `${row.case_id}-turn-${row.turn_index}-${item.dimension}`;
    samples.push({
      id: sampleId,
      caseId: row.case_id,
      turnIndex: row.turn_index,
      dimension: item.dimension,
      userInput: row.user_input,
      aiReply: row.ai_reply || '',
      history,
      llmJudgeResult: item.judgeResult as 'Pass' | 'Fail',
      llmJudgeCritique: item.critique,
      humanLabel: null,
      humanNote: null,
    });
  }

  return samples;
}

/**
 * 从 eval_cases 表获取对话历史，截取到 turnIndex 对应位置
 */
function buildHistory(db: ReturnType<typeof getDb>, caseId: string, turnIndex: number): Array<{ role: string; content: string }> {
  const caseRow = db.query('SELECT dialog_json FROM eval_cases WHERE id = ?').get(caseId) as any;
  if (!caseRow?.dialog_json) return [];

  let dialog: DialogTurn[];
  try {
    dialog = JSON.parse(caseRow.dialog_json);
  } catch {
    return [];
  }

  // 找到第 turnIndex 个 user 消息之前的所有对话
  const history: Array<{ role: string; content: string }> = [];
  let userCount = 0;

  for (const turn of dialog) {
    if (turn.role === 'user') {
      if (userCount >= turnIndex) break;
      userCount++;
    }
    history.push({ role: turn.role, content: turn.content });
  }

  return history;
}

/**
 * 计算校准报告：TPR/TNR/Cohen's Kappa
 */
export function computeCalibrationReport(samples: CalibrationSample[]): CalibrationReport {
  const labeled = samples.filter(s => s.humanLabel !== null);

  // 按维度分组
  const byDim: Record<string, CalibrationSample[]> = {};
  for (const s of labeled) {
    if (!byDim[s.dimension]) byDim[s.dimension] = [];
    byDim[s.dimension].push(s);
  }

  const dimensions: DimensionCalibration[] = [];

  for (const dim of LLM_JUDGE_DIMENSIONS) {
    const dimSamples = byDim[dim] || [];
    const total = samples.filter(s => s.dimension === dim).length;

    if (dimSamples.length === 0) {
      dimensions.push({
        dimension: dim,
        total,
        labeled: 0,
        matrix: { tp: 0, tn: 0, fp: 0, fn: 0 },
        tpr: 0,
        tnr: 0,
        kappa: 0,
        status: 'insufficient',
      });
      continue;
    }

    // 计算混淆矩阵
    const matrix: ConfusionMatrix = { tp: 0, tn: 0, fp: 0, fn: 0 };
    for (const s of dimSamples) {
      const llm = s.llmJudgeResult === 'Pass';
      const human = s.humanLabel === 'Pass';
      if (llm && human) matrix.tp++;
      else if (!llm && !human) matrix.tn++;
      else if (llm && !human) matrix.fp++;
      else if (!llm && human) matrix.fn++;
    }

    const n = dimSamples.length;
    const tpr = (matrix.tp + matrix.fn) > 0 ? matrix.tp / (matrix.tp + matrix.fn) : 0;
    const tnr = (matrix.tn + matrix.fp) > 0 ? matrix.tn / (matrix.tn + matrix.fp) : 0;

    // Cohen's Kappa
    const po = (matrix.tp + matrix.tn) / n;
    const llmPos = (matrix.tp + matrix.fp) / n;
    const llmNeg = (matrix.tn + matrix.fn) / n;
    const humanPos = (matrix.tp + matrix.fn) / n;
    const humanNeg = (matrix.tn + matrix.fp) / n;
    const pe = llmPos * humanPos + llmNeg * humanNeg;
    const kappa = pe < 1 ? (po - pe) / (1 - pe) : 1;

    // 状态判定
    let status: DimensionCalibration['status'] = 'poor';
    if (n < 3) status = 'insufficient';
    else if (kappa >= 0.8) status = 'good';
    else if (kappa >= 0.6) status = 'acceptable';

    dimensions.push({
      dimension: dim,
      total,
      labeled: n,
      matrix,
      tpr: round(tpr),
      tnr: round(tnr),
      kappa: round(kappa),
      status,
    });
  }

  // 总体 Kappa（所有标注样本合并计算）
  const allMatrix: ConfusionMatrix = { tp: 0, tn: 0, fp: 0, fn: 0 };
  for (const d of dimensions) {
    allMatrix.tp += d.matrix.tp;
    allMatrix.tn += d.matrix.tn;
    allMatrix.fp += d.matrix.fp;
    allMatrix.fn += d.matrix.fn;
  }
  const totalN = labeled.length;
  let overallKappa = 0;
  if (totalN > 0) {
    const po = (allMatrix.tp + allMatrix.tn) / totalN;
    const llmPos = (allMatrix.tp + allMatrix.fp) / totalN;
    const llmNeg = (allMatrix.tn + allMatrix.fn) / totalN;
    const humanPos = (allMatrix.tp + allMatrix.fn) / totalN;
    const humanNeg = (allMatrix.tn + allMatrix.fp) / totalN;
    const pe = llmPos * humanPos + llmNeg * humanNeg;
    overallKappa = pe < 1 ? (po - pe) / (1 - pe) : 1;
  }

  return {
    totalSamples: samples.length,
    labeledSamples: labeled.length,
    dimensions,
    overallKappa: round(overallKappa),
    generatedAt: new Date().toISOString(),
  };
}

// ========== 工具函数 ==========

function shuffle<T>(arr: T[]): void {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

function round(n: number, digits = 3): number {
  return Math.round(n * 10 ** digits) / 10 ** digits;
}

// ========== 文件操作 ==========

export function saveCalibrationSet(samples: CalibrationSample[]): string {
  if (!fs.existsSync(CALIBRATION_DIR)) {
    fs.mkdirSync(CALIBRATION_DIR, { recursive: true });
  }
  fs.writeFileSync(CALIBRATION_FILE, JSON.stringify(samples, null, 2), 'utf-8');
  return CALIBRATION_FILE;
}

export function loadCalibrationSet(): CalibrationSample[] | null {
  if (!fs.existsSync(CALIBRATION_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(CALIBRATION_FILE, 'utf-8'));
  } catch {
    return null;
  }
}

// ========== CLI ==========

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (command === 'extract') {
    const runIdIdx = args.indexOf('--run');
    if (runIdIdx === -1 || !args[runIdIdx + 1]) {
      console.error('用法: bun scripts/eval-academic/calibration.ts extract --run <runId>');
      process.exit(1);
    }
    const runId = args[runIdIdx + 1];
    const sizeIdx = args.indexOf('--size');
    const sampleSize = sizeIdx !== -1 ? parseInt(args[sizeIdx + 1]) || 50 : 50;

    console.log(`从运行 ${runId} 中抽取 ${sampleSize} 个校准样本...`);
    const samples = extractCalibrationSamples(runId, sampleSize);

    if (samples.length === 0) {
      console.error('未能抽取到任何样本');
      process.exit(1);
    }

    const filePath = saveCalibrationSet(samples);
    console.log(`已保存 ${samples.length} 个校准样本到 ${filePath}`);

    // 输出维度分布统计
    const dimStats: Record<string, { pass: number; fail: number }> = {};
    for (const s of samples) {
      if (!dimStats[s.dimension]) dimStats[s.dimension] = { pass: 0, fail: 0 };
      if (s.llmJudgeResult === 'Pass') dimStats[s.dimension].pass++;
      else dimStats[s.dimension].fail++;
    }
    console.log('\n维度分布:');
    for (const [dim, stats] of Object.entries(dimStats)) {
      console.log(`  ${dim}: Pass=${stats.pass}, Fail=${stats.fail}`);
    }

  } else if (command === 'report') {
    const samples = loadCalibrationSet();
    if (!samples) {
      console.error('校准集不存在，请先运行 extract 命令');
      process.exit(1);
    }

    const report = computeCalibrationReport(samples);
    console.log('\n===== 校准报告 =====');
    console.log(`总样本数: ${report.totalSamples}`);
    console.log(`已标注数: ${report.labeledSamples}`);
    console.log(`总体 Kappa: ${report.overallKappa}`);
    console.log('\n维度详情:');
    console.log('维度                       | 已标注 | TPR   | TNR   | Kappa | 状态');
    console.log('---------------------------|--------|-------|-------|-------|------');
    for (const d of report.dimensions) {
      const dimName = d.dimension.padEnd(27);
      const labeled = String(d.labeled).padStart(6);
      const tpr = d.tpr.toFixed(3).padStart(5);
      const tnr = d.tnr.toFixed(3).padStart(5);
      const kappa = d.kappa.toFixed(3).padStart(5);
      console.log(`${dimName}| ${labeled} | ${tpr} | ${tnr} | ${kappa} | ${d.status}`);
    }

  } else {
    console.log('用法:');
    console.log('  bun scripts/eval-academic/calibration.ts extract --run <runId> [--size 50]');
    console.log('  bun scripts/eval-academic/calibration.ts report');
  }

  closeDb();
}

// 直接运行时执行 CLI
if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('calibration.ts')) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
