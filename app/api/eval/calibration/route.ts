/**
 * 校准数据集 API
 *
 * GET  - 返回校准数据集
 * POST - 保存人工标注结果
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const CALIBRATION_FILE = path.join(process.cwd(), 'data/calibration/calibration-set-v1.json');

export async function GET() {
  try {
    if (!fs.existsSync(CALIBRATION_FILE)) {
      return NextResponse.json({
        samples: [],
        message: '校准集不存在，请先运行 extract 命令生成',
      });
    }

    const raw = fs.readFileSync(CALIBRATION_FILE, 'utf-8');
    const samples = JSON.parse(raw);

    return NextResponse.json({ samples });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!fs.existsSync(CALIBRATION_FILE)) {
      return NextResponse.json({ error: '校准集不存在' }, { status: 404 });
    }

    const body = await req.json();
    const { id, humanLabel, humanNote } = body;

    if (!id || !['Pass', 'Wrong', 'Drift', 'Fail', null].includes(humanLabel)) {
      return NextResponse.json({ error: '参数无效: 需要 id 和 humanLabel (Pass/Wrong/Drift/null)' }, { status: 400 });
    }

    const raw = fs.readFileSync(CALIBRATION_FILE, 'utf-8');
    const samples = JSON.parse(raw);

    const idx = samples.findIndex((s: any) => s.id === id);
    if (idx === -1) {
      return NextResponse.json({ error: `样本 ${id} 不存在` }, { status: 404 });
    }

    samples[idx].humanLabel = humanLabel;
    samples[idx].humanNote = humanNote || null;

    fs.writeFileSync(CALIBRATION_FILE, JSON.stringify(samples, null, 2), 'utf-8');

    return NextResponse.json({ success: true, data: samples[idx] });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
