/**
 * Eval 配置 API
 *
 * 返回评测维度、权重预设、轨迹权重等配置信息。
 * 供外部工具和未来独立 Dashboard 消费。
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireEvalAuth } from '../auth-guard';
import {
  GRADER_REGISTRY,
  WEIGHT_PRESETS,
  DIM_LABELS,
  TRACE_STEP_WEIGHTS,
} from '@/lib/eval/config';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const denied = await requireEvalAuth(request);
  if (denied) return denied;

  return NextResponse.json({
    dimensions: GRADER_REGISTRY.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      weight: d.weight,
      description: d.description,
    })),
    dimLabels: DIM_LABELS,
    weightPresets: WEIGHT_PRESETS,
    traceStepWeights: TRACE_STEP_WEIGHTS,
  });
}
