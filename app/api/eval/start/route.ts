import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { requireEvalAuth } from '../auth-guard';

// 存储运行中的进程状态
const STATUS_DIR = path.join(process.cwd(), 'tests/eval/results/.status');

export async function POST(req: NextRequest) {
  try {
    const denied = await requireEvalAuth(req);
    if (denied) return denied;

    const body = await req.json();
    const {
      datasets = ['esconv'],
      caseIds = [] as string[],
      limit = 10,
      skipJudge = false,
      provider = '',
      model = '',
      // product 模式参数
      mode = 'benchmark',
      conversationIds = [] as string[],
      labSessionIds = [] as string[],
    } = body;

    // 确保状态目录存在
    if (!fs.existsSync(STATUS_DIR)) {
      fs.mkdirSync(STATUS_DIR, { recursive: true });
    }

    const runId = `eval-${Date.now()}`;
    const statusFile = path.join(STATUS_DIR, `${runId}.json`);

    // 写入初始状态
    fs.writeFileSync(statusFile, JSON.stringify({
      runId,
      status: 'running',
      mode,
      datasets: mode === 'product' ? ['product'] : datasets,
      limit,
      startedAt: new Date().toISOString(),
      output: '',
    }));

    if (mode === 'product') {
      // Product 模式: 评测已有对话
      if (conversationIds.length === 0 && labSessionIds.length === 0) {
        return NextResponse.json({ error: 'Product 模式需要提供 conversationIds 或 labSessionIds' }, { status: 400 });
      }

      const args = ['scripts/eval-academic/run.ts', '--mode', 'product'];
      if (conversationIds.length > 0) {
        args.push('--conversations', conversationIds.join(','));
      }
      if (labSessionIds.length > 0) {
        args.push('--lab-sessions', labSessionIds.join(','));
      }
      if (skipJudge) args.push('--skip-judge');

      const child = spawn('bun', args, {
        cwd: process.cwd(),
        env: {
          ...process.env,
          FORCE_COLOR: '0',
          ...(provider ? { EVAL_CHAT_PROVIDER: provider } : {}),
          ...(model ? { EVAL_CHAT_MODEL: model } : {}),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        try {
          const current = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
          current.output = output.slice(-5000);
          fs.writeFileSync(statusFile, JSON.stringify(current));
        } catch { /* ignore */ }
      });

      child.stderr.on('data', (data: Buffer) => {
        output += data.toString();
      });

      child.on('close', (code: number | null) => {
        try {
          const current = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
          current.status = code === 0 ? 'completed' : 'failed';
          current.finishedAt = new Date().toISOString();
          current.exitCode = code;
          current.output = output.slice(-5000);
          fs.writeFileSync(statusFile, JSON.stringify(current));
        } catch { /* ignore */ }
      });

      return NextResponse.json({ runId, status: 'running', mode: 'product' });
    }

    // Benchmark 模式
    for (const dataset of datasets) {
      const args = [
        'scripts/eval-academic/run.ts',
        '--dataset', dataset,
        '--limit', String(limit),
      ];
      // 传入用户选择的具体 case IDs
      const dsCaseIds = (caseIds as string[]).filter((id: string) => id.startsWith(dataset));
      if (dsCaseIds.length > 0) {
        args.push('--cases', dsCaseIds.join(','));
      }
      if (skipJudge) args.push('--skip-judge');

      const child = spawn('bun', args, {
        cwd: process.cwd(),
        env: { ...process.env, FORCE_COLOR: '0', ...(provider ? { EVAL_CHAT_PROVIDER: provider } : {}), ...(model ? { EVAL_CHAT_MODEL: model } : {}) },
        stdio: ['ignore', 'pipe', 'pipe'],
      });

      let output = '';

      child.stdout.on('data', (data: Buffer) => {
        output += data.toString();
        try {
          const current = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
          current.output = output.slice(-5000); // 保留最后 5000 字符
          fs.writeFileSync(statusFile, JSON.stringify(current));
        } catch { /* ignore */ }
      });

      child.stderr.on('data', (data: Buffer) => {
        output += data.toString();
      });

      child.on('close', (code: number | null) => {
        try {
          const current = JSON.parse(fs.readFileSync(statusFile, 'utf-8'));
          current.status = code === 0 ? 'completed' : 'failed';
          current.finishedAt = new Date().toISOString();
          current.exitCode = code;
          current.output = output.slice(-5000);
          fs.writeFileSync(statusFile, JSON.stringify(current));
        } catch { /* ignore */ }
      });
    }

    return NextResponse.json({ runId, status: 'running' });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
