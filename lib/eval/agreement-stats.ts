/**
 * 人机评分一致性分析
 *
 * 计算 LLM 自动评分与人工标注之间的一致性指标：
 * - Cohen's Kappa（分类一致性）
 * - Pearson 相关系数（线性相关度）
 * - RMSE（均方根误差）
 * - 一致率（同意/总数）
 *
 * 数据来源：conversation_evaluations + eval_annotations（better-sqlite3）
 */

import Database from 'better-sqlite3';
import * as path from 'path';

// --------------------------------------------------------------------------
// Database Connection（复用 eval-store.ts 的同一 SQLite 文件）
// --------------------------------------------------------------------------

const DB_PATH = process.env.EVAL_DB_PATH
  || path.join(process.cwd(), 'scripts/eval-academic/eval-academic.db');

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (!_db) {
    _db = new Database(DB_PATH);
    _db.pragma('journal_mode = WAL');
  }
  return _db;
}

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface ScorePair {
  evaluationId: string;
  dimension: string;
  llmScore: number;
  humanScore: number;
  agree: boolean;
}

export interface DimensionStats {
  count: number;
  agreementRate: number;
  kappa: number;
  pearson: number;
  rmse: number;
  avgLlmScore: number;
  avgHumanScore: number;
  bias: number;
}

export interface AgreementAnalysis {
  totalPairs: number;
  agreementRate: number;
  cohensKappa: number;
  pearsonCorrelation: number;
  rmse: number;
  byDimension: Record<string, DimensionStats>;
  interpretation: string;
}

// --------------------------------------------------------------------------
// 维度映射
// --------------------------------------------------------------------------

const DIMENSION_TO_COLUMN: Record<string, string> = {
  legal: 'legal_score',
  ethical: 'ethical_score',
  professional: 'professional_score',
  ux: 'ux_score',
};

// --------------------------------------------------------------------------
// 数据获取
// --------------------------------------------------------------------------

/** 获取所有有人工评分的评分对 */
export function getScorePairs(): ScorePair[] {
  const db = getDb();

  // 检查 eval_annotations 表是否存在
  const tableCheck = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='eval_annotations'"
  ).get();
  if (!tableCheck) return [];

  const pairs: ScorePair[] = [];

  for (const [dimension, column] of Object.entries(DIMENSION_TO_COLUMN)) {
    const rows = db.prepare(`
      SELECT
        a.evaluation_id,
        a.dimension,
        ce.${column} as llm_score,
        a.human_score,
        a.agree
      FROM eval_annotations a
      JOIN conversation_evaluations ce ON ce.id = a.evaluation_id
      WHERE a.dimension = ? AND a.human_score IS NOT NULL
    `).all(dimension) as any[];

    for (const row of rows) {
      pairs.push({
        evaluationId: row.evaluation_id,
        dimension: row.dimension,
        llmScore: row.llm_score,
        humanScore: row.human_score,
        agree: row.agree === 1,
      });
    }
  }

  return pairs;
}

// --------------------------------------------------------------------------
// 统计计算（纯函数）
// --------------------------------------------------------------------------

type ScoreInput = { llmScore: number; humanScore: number };

/** 分数等级：LOW(0-3), MEDIUM(4-6), HIGH(7-10) */
function toCategory(score: number): 'LOW' | 'MEDIUM' | 'HIGH' {
  if (score <= 3) return 'LOW';
  if (score <= 6) return 'MEDIUM';
  return 'HIGH';
}

/**
 * Cohen's Kappa — 分类一致性
 *
 * 将 0-10 分数映射到 3 个等级后构建混淆矩阵。
 * κ = (P_o - P_e) / (1 - P_e)
 */
export function cohensKappa(pairs: ScoreInput[]): number {
  if (pairs.length === 0) return 0;

  const categories: Array<'LOW' | 'MEDIUM' | 'HIGH'> = ['LOW', 'MEDIUM', 'HIGH'];
  const n = pairs.length;

  // 构建混淆矩阵
  const matrix: Record<string, Record<string, number>> = {};
  for (const cat1 of categories) {
    matrix[cat1] = {};
    for (const cat2 of categories) {
      matrix[cat1][cat2] = 0;
    }
  }

  for (const pair of pairs) {
    const llmCat = toCategory(pair.llmScore);
    const humanCat = toCategory(pair.humanScore);
    matrix[llmCat][humanCat]++;
  }

  // 观察一致率 P_o
  let agreed = 0;
  for (const cat of categories) {
    agreed += matrix[cat][cat];
  }
  const po = agreed / n;

  // 期望一致率 P_e（假设独立）
  let pe = 0;
  for (const cat of categories) {
    let llmCount = 0;
    let humanCount = 0;
    for (const otherCat of categories) {
      llmCount += matrix[cat][otherCat];
      humanCount += matrix[otherCat][cat];
    }
    pe += (llmCount / n) * (humanCount / n);
  }

  if (pe >= 1) return 1;
  return (po - pe) / (1 - pe);
}

/**
 * Pearson 相关系数
 *
 * r = Σ[(xi - x̄)(yi - ȳ)] / √[Σ(xi - x̄)² × Σ(yi - ȳ)²]
 */
export function pearsonCorrelation(pairs: ScoreInput[]): number {
  if (pairs.length < 2) return 0;

  const n = pairs.length;
  const meanX = pairs.reduce((s, p) => s + p.llmScore, 0) / n;
  const meanY = pairs.reduce((s, p) => s + p.humanScore, 0) / n;

  let sumXY = 0;
  let sumX2 = 0;
  let sumY2 = 0;

  for (const pair of pairs) {
    const dx = pair.llmScore - meanX;
    const dy = pair.humanScore - meanY;
    sumXY += dx * dy;
    sumX2 += dx * dx;
    sumY2 += dy * dy;
  }

  const denominator = Math.sqrt(sumX2 * sumY2);
  if (denominator === 0) return 0;

  return sumXY / denominator;
}

/** 均方根误差 RMSE */
export function rmse(pairs: ScoreInput[]): number {
  if (pairs.length === 0) return 0;

  const mse = pairs.reduce((s, p) => s + (p.llmScore - p.humanScore) ** 2, 0) / pairs.length;
  return Math.sqrt(mse);
}

/** 一致率（agree=true 的比例） */
export function agreementRate(pairs: ScorePair[]): number {
  if (pairs.length === 0) return 0;
  const agreed = pairs.filter(p => p.agree).length;
  return agreed / pairs.length;
}

// --------------------------------------------------------------------------
// 解读逻辑
// --------------------------------------------------------------------------

function interpretKappa(kappa: number): string {
  if (kappa > 0.8) return '优秀一致性';
  if (kappa > 0.6) return '较好一致性';
  if (kappa > 0.4) return '中等一致性';
  if (kappa > 0.2) return '一般一致性';
  return '较差一致性，需要校准 LLM 评分标准';
}

function generateInterpretation(analysis: Pick<AgreementAnalysis, 'cohensKappa' | 'pearsonCorrelation' | 'rmse' | 'totalPairs' | 'byDimension'>): string {
  const parts: string[] = [];

  parts.push(`基于 ${analysis.totalPairs} 对标注数据，${interpretKappa(analysis.cohensKappa)}`);
  parts.push(`Kappa=${analysis.cohensKappa.toFixed(2)}，Pearson r=${analysis.pearsonCorrelation.toFixed(2)}，RMSE=${analysis.rmse.toFixed(2)}`);

  // 找出偏差最大的维度
  const dims = Object.entries(analysis.byDimension);
  if (dims.length > 0) {
    const worst = dims.reduce((a, b) => Math.abs(a[1].bias) > Math.abs(b[1].bias) ? a : b);
    if (Math.abs(worst[1].bias) > 1) {
      const direction = worst[1].bias > 0 ? '偏高' : '偏低';
      parts.push(`${worst[0]} 维度 LLM 评分${direction} ${Math.abs(worst[1].bias).toFixed(1)} 分，建议重点校准`);
    }
  }

  return parts.join('。') + '。';
}

// --------------------------------------------------------------------------
// 综合分析
// --------------------------------------------------------------------------

/** 完整一致性分析 */
export function analyzeAgreement(): AgreementAnalysis {
  const pairs = getScorePairs();

  if (pairs.length === 0) {
    return {
      totalPairs: 0,
      agreementRate: 0,
      cohensKappa: 0,
      pearsonCorrelation: 0,
      rmse: 0,
      byDimension: {},
      interpretation: '暂无标注数据，无法进行一致性分析。',
    };
  }

  // 全局指标
  const globalKappa = cohensKappa(pairs);
  const globalPearson = pearsonCorrelation(pairs);
  const globalRmse = rmse(pairs);
  const globalAgreement = agreementRate(pairs);

  // 按维度分组
  const byDimension: Record<string, DimensionStats> = {};
  const dimensionGroups = new Map<string, ScorePair[]>();

  for (const pair of pairs) {
    if (!dimensionGroups.has(pair.dimension)) {
      dimensionGroups.set(pair.dimension, []);
    }
    dimensionGroups.get(pair.dimension)!.push(pair);
  }

  for (const [dim, dimPairs] of dimensionGroups) {
    const avgLlm = dimPairs.reduce((s, p) => s + p.llmScore, 0) / dimPairs.length;
    const avgHuman = dimPairs.reduce((s, p) => s + p.humanScore, 0) / dimPairs.length;

    byDimension[dim] = {
      count: dimPairs.length,
      agreementRate: agreementRate(dimPairs),
      kappa: cohensKappa(dimPairs),
      pearson: pearsonCorrelation(dimPairs),
      rmse: rmse(dimPairs),
      avgLlmScore: Math.round(avgLlm * 100) / 100,
      avgHumanScore: Math.round(avgHuman * 100) / 100,
      bias: Math.round((avgLlm - avgHuman) * 100) / 100,
    };
  }

  const result: AgreementAnalysis = {
    totalPairs: pairs.length,
    agreementRate: globalAgreement,
    cohensKappa: globalKappa,
    pearsonCorrelation: globalPearson,
    rmse: globalRmse,
    byDimension,
    interpretation: '',
  };

  result.interpretation = generateInterpretation(result);

  return result;
}
