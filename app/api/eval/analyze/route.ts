/**
 * AI 改进分析 API
 * POST /api/eval/analyze
 * 输入: { runId } — 对指定实验的失败案例进行多层级改进分析
 * 输出: { suggestions: Suggestion[] }
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { generateText, type LlmProviderName } from '@/lib/llm';

const RESULTS_DIR = path.join(process.cwd(), 'tests/eval/results');
const ANALYSIS_DIR = path.join(process.cwd(), 'data/coding');

interface Suggestion {
  layer: 'orchestration' | 'engineering' | 'guardrail' | 'evaluator' | 'data' | 'model' | 'prompt';
  title: string;
  description: string;
  dismissal_reason?: string;  // 为什么不是更上层的问题
  tags?: string[];            // 涌现标签（4-8字短标签，合并自原定性分析）
  targetFile?: string;
  betterReply?: string;       // 单用例模式：更好的回复示例
  turnIndex?: number;         // 单用例模式：轮次编号
  affectedDimensions: string[];
  priority: 'high' | 'medium' | 'low';
  failCount: number;
  status?: 'accepted' | 'rejected' | 'deferred';  // 人工标记
  note?: string;            // 人工备注（进展记录）
  statusUpdatedAt?: string;
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

/** 整体实验分析 prompt — 层级化根因诊断 */
function buildRunAnalysisPrompt(systemContext: string, failCases: any[], dimSummary: string): string {
  const failSample = failCases.slice(0, 15);
  return `你是一个 AI 系统架构师，擅长从评测失败中做**层级化根因诊断**。你的核心原则：**架构问题优先于提示词问题**。大部分失败的根因在架构、编排、工程层面，不是"改提示词"能解决的。

## 当前系统配置
${systemContext}

## 失败维度分布
${dimSummary}

## 失败案例（共 ${failCases.length} 条，展示前 ${failSample.length} 条）
${JSON.stringify(failSample, null, 2)}

## 诊断方法论 — 逐层排查，由深到浅

你必须按以下顺序逐层排查，**只有当上层确认不是根因时，才能归因到下层**：

### L1: 架构 & 编排（orchestration）— 最优先
问自己：失败是因为系统架构设计缺陷吗？
- 状态机流转是否合理？（如：结束信号场景下状态机没有正确切换到 WRAP_UP）
- Triage Agent 路由分类是否准确？（如：本应走 crisis 路径却走了 support）
- Agent 之间的信息传递是否完整？（如：Counselor Agent 拿不到 Triage 的上下文）
- 多轮对话中上下文窗口是否足够？（如：只保留 10 轮导致遗忘关键信息）

### L2: 工程 & 代码（engineering）
问自己：代码实现是否有 bug 或逻辑缺陷？
- 是否有未处理的边界情况？（如：用户连续发"谢谢再见"但代码没有检测结束意图）
- 数据预处理/后处理是否有问题？（如：情绪分析结果没有正确传递给 Counselor）
- API 调用参数是否合理？（如：temperature 过高导致回复不稳定）
- 并发/时序问题？（如：Quality Agent 的反馈没有及时回流）

### L3: 防护规则（guardrail）
问自己：现有规则是否需要更新？
- 禁用词列表是否需要增补？
- 否定感受模式匹配是否太宽/太窄？
- 回复长度限制是否合理？

### L4: 评估器校准（evaluator）
问自己：是评估器本身判断有偏差吗？
- 某个维度是否系统性地过于严格/宽松？
- 评估标准是否与产品定位一致？（如：产品定位轻松陪伴，但评估标准按专业咨询打分）
- 多个维度是否在重复评判同一个问题？（如：同一回复被 empathy-accuracy 和 interpretation-accuracy 双重扣分）

### L5: 数据 & 模型（data / model）
问自己：是数据质量或模型能力的问题吗？
- 测试用例是否有偏差？（如：4/5 用例都以"谢谢"结尾导致结束场景过度放大）
- 参考回复质量是否足够好？
- 当前模型是否有已知的能力短板？

### L6: 提示词（prompt）— 最后手段
**只有以上 5 层都排除后**，才考虑提示词调整。问自己：
- 系统提示词中是否缺少对特定场景的指令？
- 是否需要添加 few-shot 示例？
- 指令是否有歧义导致模型误解？

⚠️ 重要约束：
- 如果你的建议超过 30% 是 prompt 层，说明你没有做好根因分析，请重新审视
- 每条建议必须说明**为什么不是更上层的问题**（dismissal_reason 字段）
- 同一根因导致多个维度失败时，只输出一条建议，在 affectedDimensions 中列出所有受影响维度

## 输出格式

以 JSON 数组格式输出，每个元素结构:
{
  "layer": "orchestration|engineering|guardrail|evaluator|data|model|prompt",
  "title": "简短标题",
  "description": "根因分析 + 具体改进操作（2-3句）",
  "dismissal_reason": "为什么不是更上层的问题（1句话）",
  "tags": ["涌现标签1", "涌现标签2"],
  "targetFile": "建议修改的文件路径（如 lib/ai/agents/counselor.ts）",
  "affectedDimensions": ["empathy-accuracy", "context-coherence"],
  "priority": "high|medium|low",
  "failCount": 数字（该问题涉及的失败案例数）
}

tags 字段要求：
- 每条建议附带 1-2 个涌现标签（从失败案例中自然提炼，不限于预设维度）
- 标签要短（4-8字），如：结束信号处理、首轮即给建议、情绪映射错误、维度耦合扣分
- 同一标签可出现在多条建议中（表示关联）

只输出 JSON 数组，不要其他文字。按诊断层级从深到浅排序（orchestration 在前，prompt 在后）。`;
}

/** 单用例深度分析 prompt — 层级化根因诊断 */
function buildCaseAnalysisPrompt(systemContext: string, caseId: string, allTurns: any[], _failCases: any[], dimSummary: string): string {
  return `你是一个 AI 系统架构师，擅长从单个对话用例中做**层级化根因诊断**。核心原则：**架构问题优先于提示词问题**。

## 当前系统配置
${systemContext}

## 分析对象
用例 ID: ${caseId}

## 完整对话轮次（共 ${allTurns.length} 轮）
${JSON.stringify(allTurns, null, 2)}

## 失败维度分布
${dimSummary}

## 诊断方法论 — 逐层排查

对每一轮失败的回复，按以下顺序排查根因（只有上层排除后才归因到下层）：

1. **编排问题**：状态机是否在正确状态？Triage 路由是否正确？上下文是否完整传递？
2. **工程问题**：代码逻辑有无 bug？边界情况是否处理？数据流转是否正确？
3. **防护规则**：现有规则是否误触发/漏触发？
4. **评估器偏差**：该维度的评判标准是否合理？是否与产品定位冲突？
5. **数据/模型**：测试用例是否有代表性？模型能力是否不足？
6. **提示词**（最后手段）：只有以上都排除后，才考虑提示词缺少指令或示例

## 输出要求

对每一轮失败，给出：
- 根因层级和分析（为什么不是更上层的问题）
- 改写示例（如果是回复质量问题）
- 具体修改建议

以 JSON 数组格式输出，每个元素结构:
{
  "layer": "orchestration|engineering|guardrail|evaluator|data|model|prompt",
  "title": "简短标题（针对具体轮次的问题）",
  "description": "根因分析 + 改进操作描述",
  "dismissal_reason": "为什么不是更上层的问题",
  "tags": ["涌现标签（4-8字）"],
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
    const body = await req.json();
    const { runId, caseId, provider: reqProvider, cacheOnly, action } = body;
    if (!runId) return NextResponse.json({ error: 'runId is required' }, { status: 400 });

    // ===== 更新建议状态（同意/拒绝/搁置 + 备注）=====
    if (action === 'update-status') {
      const { index, status, note } = body as { index: number; status?: string; note?: string; runId: string; caseId?: string; provider?: string; action: string };
      const provider: LlmProviderName = (['deepseek', 'openai', 'glm', 'openrouter', 'kimi'] as const).includes(reqProvider) ? reqProvider : 'deepseek';
      const sanitized = runId.replace(/[^a-zA-Z0-9-_]/g, '_');
      const providerSuffix = provider !== 'deepseek' ? `-${provider}` : '';
      const cacheSuffix = caseId ? `-case-${caseId.replace(/[^a-zA-Z0-9-_:]/g, '_')}` : '';
      const cacheFile = path.join(ANALYSIS_DIR, `analysis-${sanitized}${cacheSuffix}${providerSuffix}.json`);
      if (!fs.existsSync(cacheFile)) return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
      const data = JSON.parse(fs.readFileSync(cacheFile, 'utf-8'));
      if (index < 0 || index >= (data.suggestions || []).length) return NextResponse.json({ error: 'Invalid index' }, { status: 400 });
      if (status !== undefined) data.suggestions[index].status = status;
      if (note !== undefined) data.suggestions[index].note = note;
      data.suggestions[index].statusUpdatedAt = new Date().toISOString();
      fs.writeFileSync(cacheFile, JSON.stringify(data, null, 2));
      return NextResponse.json({ success: true });
    }

    // 解析 provider（默认 deepseek，支持前端切换）
    const provider: LlmProviderName = (['deepseek', 'openai', 'glm', 'openrouter', 'kimi'] as const).includes(reqProvider)
      ? reqProvider : 'deepseek';

    // 缓存键区分整体分析 vs 单用例分析 vs 不同 provider
    const sanitized = runId.replace(/[^a-zA-Z0-9-_]/g, '_');
    const providerSuffix = provider !== 'deepseek' ? `-${provider}` : '';
    const cacheSuffix = caseId ? `-case-${caseId.replace(/[^a-zA-Z0-9-_:]/g, '_')}` : '';
    const cacheFile = path.join(ANALYSIS_DIR, `analysis-${sanitized}${cacheSuffix}${providerSuffix}.json`);
    if (fs.existsSync(cacheFile)) {
      return NextResponse.json(JSON.parse(fs.readFileSync(cacheFile, 'utf-8')));
    }

    // cacheOnly 模式：只读缓存，没有就返回空（根因总览页使用）
    if (cacheOnly) {
      return NextResponse.json({ suggestions: [], summary: '', cached: false });
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

    // 调用 LLM 分析（通过统一 LLM 层，支持多 provider）
    const { reply: text } = await generateText(
      [{ role: 'user', content: analysisPrompt }],
      { provider, temperature: 0.3, max_tokens: 3000, timeoutMs: 60000 },
    );
    const jsonMatch = (text || '').match(/\[[\s\S]*\]/);

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

    // 汇总标签频次（合并自原定性分析的开放编码能力）
    const tagSummary: Record<string, number> = {};
    for (const s of suggestions) {
      for (const tag of s.tags || []) {
        tagSummary[tag] = (tagSummary[tag] || 0) + (s.failCount || 1);
      }
    }

    const result = {
      suggestions,
      summary,
      provider,
      failCount: failCases.length,
      dimCounts,
      tagSummary,
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
