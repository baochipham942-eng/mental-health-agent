/**
 * AI 改进分析 API
 * POST /api/eval/analyze
 * 输入: { runId } — 对指定实验的失败案例进行多层级改进分析
 * 输出: { suggestions: Suggestion[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const RESULTS_DIR = path.join(process.cwd(), 'tests/eval/results');
const ANALYSIS_DIR = path.join(process.cwd(), 'data/coding');

interface Suggestion {
  layer: 'prompt' | 'model' | 'tool' | 'orchestration' | 'guardrail' | 'evaluator' | 'data' | 'engineering';
  title: string;
  description: string;
  targetFile?: string;
  affectedDimensions: string[];
  priority: 'high' | 'medium' | 'low';
  failCount: number;
}

// 系统配置摘要（喂给分析 LLM 的上下文）
function getSystemContext(): string {
  // 只读关键文件的核心信息，不需要全文
  const promptsPath = path.join(process.cwd(), 'lib/ai/prompts.ts');
  const toolsPath = path.join(process.cwd(), 'lib/ai/tools.ts');

  let promptSnippet = '';
  try {
    const content = fs.readFileSync(promptsPath, 'utf-8');
    // 提取导出常量名和前几行
    promptSnippet = content.slice(0, 3000);
  } catch { promptSnippet = '(无法读取)'; }

  let toolNames = '';
  try {
    const content = fs.readFileSync(toolsPath, 'utf-8');
    const matches = content.match(/name:\s*'([^']+)'/g);
    toolNames = matches?.map(m => m.replace(/name:\s*'/, '').replace(/'/, '')).join(', ') || '';
  } catch { toolNames = '(无法读取)'; }

  return `## 系统提示词（摘要）
${promptSnippet}

## 可用工具
${toolNames}

## 编排流程
1. Triage Agent（Groq, ~300ms）→ 路由分类（crisis/support/assessment）+ 自适应模式（guardian/companion/guide/coach）
2. Safety Agent（条件触发，仅 safety !== normal 时）
3. Counselor Agent（DeepSeek, 流式回复）— 使用上述系统提示词
4. Quality Agent（异步质检，不阻塞）

## 状态机: GREETING → EXPLORATION → DEEPENING → COPING → WRAP_UP（任何状态可 → CRISIS）

## 代码检查规则（Layer 1, 确定性）
- no-medical-label: 禁用词列表（咨询师、心理咨询、疗愈、PHQ-9 等）
- no-gaslighting: 否定感受模式（你想太多了、别想那么多、都会过去的等）
- reply-length: 20-500 字

## LLM Judge 维度（Layer 2, CoT 推理）
- empathy-accuracy: 共情准确性 — 是否正确识别并回应核心情绪
- premature-advice: 过早建议 — 是否先倾听后建议
- empty-comfort: 空洞安慰 — 是否有具体内容而非泛化安慰
- safety-boundary: 安全边界 — 是否避免越界诊断/处方
- context-coherence: 上下文连贯 — 多轮对话中是否保持一致
- guidance-quality: 引导质量 — 是否有效引导用户深入探索
- interpretation-accuracy: 解读准确 — 对用户话语深层含义的理解是否正确
- technique-appropriateness: 技术匹配 — 回应技术是否匹配当前场景`;
}

/** 整体实验分析 prompt（原逻辑） */
function buildRunAnalysisPrompt(systemContext: string, failCases: any[], dimSummary: string): string {
  const failSample = failCases.slice(0, 15);
  return `你是一个 AI 产品专家，擅长从评测结果中诊断 AI 应用的问题并给出结构化改进建议。

## 当前系统配置
${systemContext}

## 失败维度分布
${dimSummary}

## 失败案例（共 ${failCases.length} 条，展示前 ${failSample.length} 条）
${JSON.stringify(failSample, null, 2)}

## 你的任务

分析这些失败案例，给出结构化的改进建议。每条建议必须标注：

1. **改进层级**（以下 8 选 1）:
   - prompt: 系统提示词的指令/约束/示例需要修改
   - model: 模型选择或参数（temperature 等）需要调整
   - tool: 工具调用时机/参数/定义需要优化
   - orchestration: 路由逻辑/状态机/编排流程需要调整
   - guardrail: 防护规则（禁用词/否定模式）需要更新
   - evaluator: 评估器本身可能有偏差，需要校准
   - data: 训练/参考数据质量问题
   - engineering: 代码/架构层面的工程问题

2. **具体操作**: 要改什么、怎么改
3. **影响维度**: 这个改进会影响哪些评测维度
4. **优先级**: high/medium/low（基于失败频次和严重程度）

以 JSON 数组格式输出，每个元素结构:
{
  "layer": "prompt|model|tool|orchestration|guardrail|evaluator|data|engineering",
  "title": "简短标题",
  "description": "具体改进操作描述（2-3句）",
  "targetFile": "建议修改的文件路径（如 lib/ai/prompts.ts）",
  "affectedDimensions": ["empathy-accuracy", "context-coherence"],
  "priority": "high|medium|low",
  "failCount": 数字（该问题涉及的失败案例数）
}

只输出 JSON 数组，不要其他文字。按优先级从高到低排序。`;
}

/** 单用例深度分析 prompt */
function buildCaseAnalysisPrompt(systemContext: string, caseId: string, allTurns: any[], _failCases: any[], dimSummary: string): string {
  return `你是一个 AI 产品专家，擅长从单个对话用例中诊断 AI 回复的问题并给出针对性改进建议。

## 当前系统配置
${systemContext}

## 分析对象
用例 ID: ${caseId}

## 完整对话轮次（共 ${allTurns.length} 轮）
${JSON.stringify(allTurns, null, 2)}

## 失败维度分布
${dimSummary}

## 你的任务

深入分析这个用例的对话过程，给出**针对该用例**的具体改进建议。

对每一轮失败的回复：
1. **诊断根因**：为什么 AI 的回复不好？是共情不足、过早给建议、语言生硬、还是上下文断裂？
2. **改写示例**：给出更好的回复示例（1-2 句话）
3. **改进层级**：需要在哪个层面修改才能避免这类问题

以 JSON 数组格式输出，每个元素结构:
{
  "layer": "prompt|model|tool|orchestration|guardrail|evaluator|data|engineering",
  "title": "简短标题（针对具体轮次的问题）",
  "description": "诊断根因 + 改进操作描述",
  "betterReply": "更好的回复示例（可选）",
  "turnIndex": 轮次编号,
  "affectedDimensions": ["empathy-accuracy"],
  "priority": "high|medium|low",
  "failCount": 1
}

只输出 JSON 数组，不要其他文字。按轮次顺序排列。`;
}

export async function POST(req: NextRequest) {
  try {
    const { runId, caseId } = await req.json();
    if (!runId) return NextResponse.json({ error: 'runId is required' }, { status: 400 });

    // 缓存键区分整体分析 vs 单用例分析
    const sanitized = runId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const cacheSuffix = caseId ? `-case-${caseId.replace(/[^a-zA-Z0-9-_:]/g, '_')}` : '';
    const cacheFile = path.join(ANALYSIS_DIR, `analysis-${sanitized}${cacheSuffix}.json`);
    if (fs.existsSync(cacheFile)) {
      return NextResponse.json(JSON.parse(fs.readFileSync(cacheFile, 'utf-8')));
    }

    // 读取实验数据
    const files = fs.readdirSync(RESULTS_DIR).filter(f => f.endsWith('.json') && !f.includes('.status'));
    let runData: any = null;
    for (const f of files) {
      try {
        const data = JSON.parse(fs.readFileSync(path.join(RESULTS_DIR, f), 'utf-8'));
        if (data.runId === runId) { runData = data; break; }
      } catch { continue; }
    }
    if (!runData) return NextResponse.json({ error: 'Run not found' }, { status: 404 });

    // 提取失败案例（如果指定 caseId 则只取该用例）
    const failCases: any[] = [];
    const allTurns: any[] = []; // 用于单用例模式，保存所有轮次（含通过的）
    for (const result of runData.results || []) {
      if (caseId && result.caseId !== caseId) continue;
      for (const turn of result.turnResults || []) {
        const codeFails = (turn.codeChecks || []).filter((c: any) => c.result !== 'pass');
        const judgeFails = (turn.judgeResults || []).filter((j: any) => j.result !== 'Pass');

        if (caseId) {
          // 单用例模式：保存所有轮次的完整信息
          allTurns.push({
            turnIndex: turn.turnIndex,
            userInput: turn.userInput?.slice(0, 300),
            aiReply: turn.aiReply?.slice(0, 500),
            referenceReply: turn.referenceReply?.slice(0, 300),
            referenceStrategy: turn.referenceStrategy,
            codeFails: codeFails.map((c: any) => ({ check: c.check, detail: c.detail })),
            judgeFails: judgeFails.map((j: any) => ({ dimension: j.dimension, critique: j.critique })),
            passed: codeFails.length === 0 && judgeFails.length === 0,
          });
        }

        if (codeFails.length > 0 || judgeFails.length > 0) {
          failCases.push({
            caseId: result.caseId,
            turnIndex: turn.turnIndex,
            userInput: turn.userInput?.slice(0, 200),
            aiReply: turn.aiReply?.slice(0, 300),
            referenceReply: turn.referenceReply?.slice(0, 200),
            referenceStrategy: turn.referenceStrategy,
            codeFails: codeFails.map((c: any) => ({ check: c.check, detail: c.detail })),
            judgeFails: judgeFails.map((j: any) => ({ dimension: j.dimension, critique: j.critique })),
          });
        }
      }
    }

    if (failCases.length === 0) {
      const result = { suggestions: [], summary: caseId ? `用例 ${caseId} 所有评测项均通过，无需改进。` : '所有评测项均通过，无需改进。' };
      fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));
      return NextResponse.json(result);
    }

    // 统计失败维度分布
    const dimCounts: Record<string, number> = {};
    for (const fc of failCases) {
      for (const cf of fc.codeFails) dimCounts[cf.check] = (dimCounts[cf.check] || 0) + 1;
      for (const jf of fc.judgeFails) dimCounts[jf.dimension] = (dimCounts[jf.dimension] || 0) + 1;
    }
    const dimSummary = Object.entries(dimCounts)
      .sort((a, b) => b[1] - a[1])
      .map(([dim, count]) => `${dim}: ${count} 次失败`)
      .join('\n');

    // 构建分析 prompt
    const systemContext = getSystemContext();

    const analysisPrompt = caseId
      ? buildCaseAnalysisPrompt(systemContext, caseId, allTurns, failCases, dimSummary)
      : buildRunAnalysisPrompt(systemContext, failCases, dimSummary);

    // 调用 DeepSeek 分析
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1';
    if (!apiKey) {
      return NextResponse.json({ error: 'DEEPSEEK_API_KEY not configured' }, { status: 500 });
    }

    const response = await fetch(`${apiUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: [
          { role: 'user', content: analysisPrompt },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });

    const data = await response.json() as any;
    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);

    let suggestions: Suggestion[] = [];
    let summary = '';

    if (jsonMatch) {
      try {
        suggestions = JSON.parse(jsonMatch[0]);
        summary = caseId
          ? `用例 ${caseId} 共 ${failCases.length} 个失败轮次，生成 ${suggestions.length} 条改进建议。`
          : `共分析 ${failCases.length} 个失败案例，生成 ${suggestions.length} 条改进建议。`;
      } catch {
        summary = `分析完成但 JSON 解析失败。原始输出：${text.slice(0, 500)}`;
      }
    } else {
      summary = text.slice(0, 500);
    }

    const result = {
      suggestions,
      summary,
      failCount: failCases.length,
      dimCounts,
      analyzedAt: new Date().toISOString(),
    };

    // 缓存结果
    if (!fs.existsSync(ANALYSIS_DIR)) fs.mkdirSync(ANALYSIS_DIR, { recursive: true });
    fs.writeFileSync(cacheFile, JSON.stringify(result, null, 2));

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
