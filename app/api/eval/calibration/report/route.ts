/**
 * 校准报告 API
 *
 * GET - 读取校准数据集，计算 TPR/TNR/Kappa 报告
 */
import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CALIBRATION_FILE = path.join(process.cwd(), 'data/calibration/calibration-set-v1.json');

// LLM Judge 维度列表
const LLM_JUDGE_DIMENSIONS = [
  'empathy-accuracy', 'safety-boundary', 'context-coherence',
  'guidance-quality', 'technique-appropriateness', 'tool-invocation',
  'emotion-trajectory', 'summary-quality', 'interpretation-accuracy',
  'premature-advice', 'empty-comfort', 'no-medical-label', 'no-gaslighting',
];

interface CalibrationSample {
  id: string;
  dimension: string;
  llmJudgeResult: 'Pass' | 'Fail';
  humanLabel: 'Pass' | 'Fail' | null;
}

function round(n: number, digits = 3): number {
  return Math.round(n * 10 ** digits) / 10 ** digits;
}

export async function GET() {
  try {
    if (!fs.existsSync(CALIBRATION_FILE)) {
      return NextResponse.json({ error: '校准集不存在' }, { status: 404 });
    }

    const raw = fs.readFileSync(CALIBRATION_FILE, 'utf-8');
    const samples: CalibrationSample[] = JSON.parse(raw);
    const labeled = samples.filter(s => s.humanLabel !== null);

    // 按维度分组
    const byDim: Record<string, CalibrationSample[]> = {};
    for (const s of labeled) {
      if (!byDim[s.dimension]) byDim[s.dimension] = [];
      byDim[s.dimension].push(s);
    }

    const dimensions: any[] = [];
    const allMatrix = { tp: 0, tn: 0, fp: 0, fn: 0 };

    for (const dim of LLM_JUDGE_DIMENSIONS) {
      const dimSamples = byDim[dim] || [];
      const total = samples.filter(s => s.dimension === dim).length;

      if (dimSamples.length === 0) {
        dimensions.push({
          dimension: dim, total, labeled: 0,
          matrix: { tp: 0, tn: 0, fp: 0, fn: 0 },
          tpr: 0, tnr: 0, kappa: 0, status: 'insufficient',
        });
        continue;
      }

      // 混淆矩阵
      const matrix = { tp: 0, tn: 0, fp: 0, fn: 0 };
      for (const s of dimSamples) {
        const llm = s.llmJudgeResult === 'Pass';
        const human = s.humanLabel === 'Pass';
        if (llm && human) matrix.tp++;
        else if (!llm && !human) matrix.tn++;
        else if (llm && !human) matrix.fp++;
        else if (!llm && human) matrix.fn++;
      }

      allMatrix.tp += matrix.tp;
      allMatrix.tn += matrix.tn;
      allMatrix.fp += matrix.fp;
      allMatrix.fn += matrix.fn;

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

      let status: string = 'poor';
      if (n < 3) status = 'insufficient';
      else if (kappa >= 0.8) status = 'good';
      else if (kappa >= 0.6) status = 'acceptable';

      dimensions.push({
        dimension: dim, total, labeled: n, matrix,
        tpr: round(tpr), tnr: round(tnr), kappa: round(kappa), status,
      });
    }

    // 总体 Kappa
    let overallKappa = 0;
    const totalN = labeled.length;
    if (totalN > 0) {
      const po = (allMatrix.tp + allMatrix.tn) / totalN;
      const llmPos = (allMatrix.tp + allMatrix.fp) / totalN;
      const llmNeg = (allMatrix.tn + allMatrix.fn) / totalN;
      const humanPos = (allMatrix.tp + allMatrix.fn) / totalN;
      const humanNeg = (allMatrix.tn + allMatrix.fp) / totalN;
      const pe = llmPos * humanPos + llmNeg * humanNeg;
      overallKappa = pe < 1 ? (po - pe) / (1 - pe) : 1;
    }

    return NextResponse.json({
      totalSamples: samples.length,
      labeledSamples: labeled.length,
      dimensions,
      overallKappa: round(overallKappa),
      generatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
