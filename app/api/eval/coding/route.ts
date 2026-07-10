/**
 * 开放编码 API
 * GET  /api/eval/coding?runId=xxx — 获取指定实验的标签
 * POST /api/eval/coding — 生成/保存标签
 *   body: { action: 'generate', runId } — AI 自动生成标签
 *   body: { action: 'save', runId, tags } — 手动保存标签
 *   body: { action: 'update-tag', runId, caseId, turnIndex, dimension, tags } — 更新单条标签
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { getRunResults } from '../db-reader';
import { requireEvalAuth } from '../auth-guard';
import { DEEPSEEK_MODEL, withThinkingDisabled } from '@/lib/ai/deepseek';

const RESULTS_DIR = path.join(process.cwd(), 'tests/eval/results');
const CODING_DIR = path.join(process.cwd(), 'data/coding');

export interface OpenCodeTag {
  caseId: string;
  turnIndex: number;
  dimension: string;       // 原始失败维度
  critique: string;        // 原始失败原因
  tags: string[];           // 涌现标签（可多个）
  userInput: string;
  aiReply: string;
}

function getCodingFile(runId: string) {
  return path.join(CODING_DIR, `open-coding-${runId.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`);
}

function loadRunData(runId: string): any {
  // 先查 JSON 文件（兼容旧数据）
  if (fs.existsSync(RESULTS_DIR)) {
    const files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json') && !f.includes('.status'));
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf-8'));
        if (data.runId === runId) return data;
      } catch { continue; }
    }
  }
  return null;
}

/** 从 SQLite eval_results 提取失败案例 */
async function extractFailCasesFromDb(runId: string): Promise<OpenCodeTag[]> {
  const items: OpenCodeTag[] = [];
  const results = await getRunResults(runId);
  for (const r of results) {
    if (r.code_checks_json) {
      try {
        const checks = JSON.parse(r.code_checks_json);
        for (const [check, result] of Object.entries(checks) as [string, string][]) {
          if (result !== 'pass') {
            items.push({ caseId: r.case_id, turnIndex: r.turn_index, dimension: check, critique: `${check} 未通过`, tags: [], userInput: r.user_input || '', aiReply: r.ai_reply || '' });
          }
        }
      } catch { /* ignore */ }
    }
    if (r.judge_results_json) {
      try {
        const judges = JSON.parse(r.judge_results_json);
        for (const [dim, val] of Object.entries(judges) as [string, any][]) {
          if (val.result !== 'Pass') {
            items.push({ caseId: r.case_id, turnIndex: r.turn_index, dimension: dim, critique: val.critique || '', tags: [], userInput: r.user_input || '', aiReply: r.ai_reply || '' });
          }
        }
      } catch { /* ignore */ }
    }
  }
  return items;
}

function extractFailCases(runData: any): OpenCodeTag[] {
  const items: OpenCodeTag[] = [];
  for (const result of runData.results || []) {
    for (const turn of result.turnResults || []) {
      for (const cf of (turn.codeChecks || []).filter((c: any) => c.result !== 'pass')) {
        items.push({
          caseId: result.caseId,
          turnIndex: turn.turnIndex,
          dimension: cf.check,
          critique: cf.detail || '未通过',
          tags: [],
          userInput: turn.userInput || '',
          aiReply: turn.aiReply || '',
        });
      }
      for (const jf of (turn.judgeResults || []).filter((j: any) => j.result !== 'Pass')) {
        items.push({
          caseId: result.caseId,
          turnIndex: turn.turnIndex,
          dimension: jf.dimension,
          critique: jf.critique || '',
          tags: [],
          userInput: turn.userInput || '',
          aiReply: turn.aiReply || '',
        });
      }
    }
  }
  return items;
}

export async function GET(req: NextRequest) {
  const denied = await requireEvalAuth(req);
  if (denied) return denied;

  try {
    const runId = new URL(req.url).searchParams.get('runId');
    if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 });

    const file = getCodingFile(runId);
    if (fs.existsSync(file)) {
      return NextResponse.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
    }

    // 如果没有编码数据，返回空的失败案例列表
    const runData = loadRunData(runId);
    const items = await (runData ? Promise.resolve(extractFailCases(runData)) : extractFailCasesFromDb(runId));
    if (items.length === 0 && !runData) {
      // 完全找不到数据
      return NextResponse.json({ runId, items: [], generatedAt: null });
    }
    return NextResponse.json({ runId, items, generatedAt: null });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const denied = await requireEvalAuth(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const { action, runId } = body;

    if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 });
    if (!fs.existsSync(CODING_DIR)) fs.mkdirSync(CODING_DIR, { recursive: true });

    if (action === 'generate') {
      // AI 两阶段标签生成：先提取原始问题 → 再统一归类到精简标签集
      const runData = loadRunData(runId);
      const items = await (runData ? Promise.resolve(extractFailCases(runData)) : extractFailCasesFromDb(runId));
      if (items.length === 0) {
        return NextResponse.json({ runId, items: [], summary: '无失败案例' });
      }

      const apiKey = process.env.DEEPSEEK_API_KEY;
      const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1';
      if (!apiKey) return NextResponse.json({ error: 'DEEPSEEK_API_KEY not set' }, { status: 500 });

      async function callLLM(prompt: string, temp = 0.3, maxTokens = 3000): Promise<string> {
        const res = await fetch(`${apiUrl}/chat/completions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify(withThinkingDisabled({ model: DEEPSEEK_MODEL, messages: [{ role: 'user', content: prompt }], temperature: temp, max_tokens: maxTokens })),
        });
        const d = await res.json() as any;
        return d.choices?.[0]?.message?.content?.trim() || '';
      }

      // ===== 阶段 1：提取每条案例的原始问题描述（一句话） =====
      const caseSummaries = items.map((item, i) =>
        `[${i}] 维度:${item.dimension} | 失败原因:${item.critique} | 用户:"${item.userInput.slice(0, 100)}" | AI:"${item.aiReply.slice(0, 150)}"`
      ).join('\n');

      const step1Prompt = `你是 AI 对话质量分析专家。以下是心理陪伴 AI 的评测失败案例。
请为每条案例用一句话描述核心问题（10-20字），不要修饰，只说本质问题。

失败案例：
${caseSummaries}

输出 JSON 数组：[{"index": 0, "issue": "一句话问题描述"}, ...]
只输出 JSON。`;

      const step1Text = await callLLM(step1Prompt, 0.2);
      const step1Match = step1Text.match(/\[[\s\S]*\]/);
      const rawIssues: Array<{ index: number; issue: string }> = [];
      if (step1Match) {
        try {
          rawIssues.push(...JSON.parse(step1Match[0]));
        } catch { /* ignore */ }
      }

      // ===== 阶段 2：统一归类 — 从所有原始问题中提炼精简标签集并分配 =====
      const issueList = rawIssues.length > 0
        ? rawIssues.map(r => `[${r.index}] ${r.issue}`).join('\n')
        : items.map((item, i) => `[${i}] ${item.dimension}: ${item.critique.slice(0, 60)}`).join('\n');

      const step2Prompt = `你是质量分析专家。以下是 ${items.length} 条 AI 心理陪伴失败案例的问题描述。

请完成两件事：
1. 从中提炼出 **8-15 个**互不重叠的失败模式标签（简洁，4-8字）
2. 将每条案例分配到 1-2 个标签

标签示例：首轮即给建议、忽略明确拒绝、泛化安慰、情绪映射错误、回复过短、遗忘关键细节、过度解读意图、使用医疗术语

**严格要求**：
- 标签总数不超过 15 个
- 同一个意思只能有一个标签
- 标签要短（4-8个字），不要写成句子

案例列表：
${issueList}

输出 JSON：
{
  "tags": ["标签1", "标签2", ...],
  "assignments": [{"index": 0, "tags": ["标签1"]}, ...]
}
只输出 JSON。`;

      const step2Text = await callLLM(step2Prompt, 0.1);
      const step2Match = step2Text.match(/\{[\s\S]*\}/);

      if (step2Match) {
        try {
          const result2 = JSON.parse(step2Match[0]) as {
            tags: string[];
            assignments: Array<{ index: number; tags: string[] }>;
          };
          for (const a of result2.assignments) {
            if (a.index >= 0 && a.index < items.length) {
              items[a.index].tags = a.tags || [];
            }
          }
        } catch { /* 解析失败保留空标签 */ }
      }

      const result = { runId, items, generatedAt: new Date().toISOString() };
      fs.writeFileSync(getCodingFile(runId), JSON.stringify(result, null, 2));
      return NextResponse.json(result);
    }

    if (action === 'save') {
      // 保存编辑后的标签
      const result = { runId, items: body.items, generatedAt: body.generatedAt || new Date().toISOString() };
      fs.writeFileSync(getCodingFile(runId), JSON.stringify(result, null, 2));
      return NextResponse.json({ success: true });
    }

    if (action === 'update-tag') {
      // 更新单条标签
      const file = getCodingFile(runId);
      if (!fs.existsSync(file)) return NextResponse.json({ error: 'No coding data' }, { status: 404 });

      const existing = JSON.parse(fs.readFileSync(file, 'utf-8'));
      const idx = existing.items.findIndex((item: OpenCodeTag) =>
        item.caseId === body.caseId && item.turnIndex === body.turnIndex && item.dimension === body.dimension
      );
      if (idx >= 0) {
        existing.items[idx].tags = body.tags;
        fs.writeFileSync(file, JSON.stringify(existing, null, 2));
      }
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
