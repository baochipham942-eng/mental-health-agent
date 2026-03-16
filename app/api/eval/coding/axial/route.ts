/**
 * 主轴编码 API
 * GET  /api/eval/coding/axial?runId=xxx — 获取聚类结果
 * POST /api/eval/coding/axial — 执行聚类
 *   body: { action: 'cluster', runId } — AI 聚类标签为主题
 *   body: { action: 'save', runId, themes } — 保存编辑后的主题
 */
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireEvalAdmin } from '../../auth-guard';

const CODING_DIR = path.join(process.cwd(), 'data/coding');

export interface Theme {
  id: string;
  name: string;
  description: string;
  tags: string[];          // 属于这个主题的标签
  failCount: number;       // 涉及的失败案例数
  dimensions: string[];    // 关联的评测维度
  suggestedAction: string; // 建议的改进方向
}

export interface AxialResult {
  runId: string;
  themes: Theme[];
  relationships: Array<{ from: string; to: string; type: string; description: string }>;
  insights: string;
  clusteredAt: string;
}

function getAxialFile(runId: string) {
  return path.join(CODING_DIR, `axial-coding-${runId.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`);
}

function getOpenCodingFile(runId: string) {
  return path.join(CODING_DIR, `open-coding-${runId.replace(/[^a-zA-Z0-9-_]/g, '_')}.json`);
}

export async function GET(req: NextRequest) {
  try {
    const denied = await requireEvalAdmin();
    if (denied) return denied;

    const runId = new URL(req.url).searchParams.get('runId');
    if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 });

    const file = getAxialFile(runId);
    if (fs.existsSync(file)) {
      return NextResponse.json(JSON.parse(fs.readFileSync(file, 'utf-8')));
    }

    return NextResponse.json({ runId, themes: [], relationships: [], insights: '', clusteredAt: null });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const denied = await requireEvalAdmin();
    if (denied) return denied;

    const body = await req.json();
    const { action, runId } = body;

    if (!runId) return NextResponse.json({ error: 'runId required' }, { status: 400 });
    if (!fs.existsSync(CODING_DIR)) fs.mkdirSync(CODING_DIR, { recursive: true });

    if (action === 'cluster') {
      // 读取开放编码数据
      const openFile = getOpenCodingFile(runId);
      if (!fs.existsSync(openFile)) {
        return NextResponse.json({ error: '请先完成开放编码' }, { status: 400 });
      }

      const openData = JSON.parse(fs.readFileSync(openFile, 'utf-8'));
      const items = openData.items || [];

      // 收集所有标签及其上下文
      const tagContexts: Record<string, { count: number; dimensions: Set<string>; examples: string[] }> = {};
      for (const item of items) {
        for (const tag of item.tags || []) {
          if (!tagContexts[tag]) tagContexts[tag] = { count: 0, dimensions: new Set(), examples: [] };
          tagContexts[tag].count++;
          tagContexts[tag].dimensions.add(item.dimension);
          if (tagContexts[tag].examples.length < 2) {
            tagContexts[tag].examples.push(`用户:"${item.userInput.slice(0, 60)}" → AI:"${item.aiReply.slice(0, 80)}"`);
          }
        }
      }

      const tagList = Object.entries(tagContexts)
        .sort((a, b) => b[1].count - a[1].count)
        .map(([tag, ctx]) =>
          `"${tag}" (${ctx.count}次, 维度: ${[...ctx.dimensions].join('/')}, 示例: ${ctx.examples[0] || '无'})`
        ).join('\n');

      if (!tagList) {
        return NextResponse.json({ error: '没有标签可聚类，请先生成开放编码标签' }, { status: 400 });
      }

      const prompt = `你是质性研究方法专家，擅长从开放编码中提炼主轴编码。

## 开放编码标签列表
${tagList}

## 你的任务

1. **聚类**：将上述标签聚合为 3-6 个上位主题（Axial Code），每个主题应该揭示一个核心问题模式
2. **命名**：每个主题用一个简洁的名称（如"共情缺失模式"、"过度介入倾向"、"上下文断裂"）
3. **关系**：分析主题之间的关系（因果、共现、层级）
4. **洞察**：生成 2-3 条结构化改进洞察

输出 JSON 格式:
{
  "themes": [
    {
      "id": "theme-1",
      "name": "主题名称",
      "description": "这个主题代表什么问题模式",
      "tags": ["属于这个主题的标签1", "标签2"],
      "failCount": 该主题下的总失败次数,
      "dimensions": ["关联的评测维度"],
      "suggestedAction": "建议的改进方向（1-2句话）"
    }
  ],
  "relationships": [
    {
      "from": "theme-1",
      "to": "theme-2",
      "type": "causes|co-occurs|hierarchy",
      "description": "关系描述"
    }
  ],
  "insights": "2-3 条结构化改进洞察，用 markdown 格式"
}

只输出 JSON。`;

      const apiKey = process.env.DEEPSEEK_API_KEY;
      const apiUrl = process.env.DEEPSEEK_API_URL || 'https://api.deepseek.com/v1';
      if (!apiKey) return NextResponse.json({ error: 'DEEPSEEK_API_KEY not set' }, { status: 500 });

      const response = await fetch(`${apiUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'deepseek-chat',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
          max_tokens: 2000,
        }),
      });

      const data = await response.json() as any;
      const text = data.choices?.[0]?.message?.content?.trim() || '';
      const jsonMatch = text.match(/\{[\s\S]*\}/);

      let result: AxialResult = { runId, themes: [], relationships: [], insights: '', clusteredAt: new Date().toISOString() };

      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          result.themes = parsed.themes || [];
          result.relationships = parsed.relationships || [];
          result.insights = parsed.insights || '';
        } catch { result.insights = `解析失败。原始输出：${text.slice(0, 500)}`; }
      }

      fs.writeFileSync(getAxialFile(runId), JSON.stringify(result, null, 2));
      return NextResponse.json(result);
    }

    if (action === 'save') {
      const result: AxialResult = {
        runId,
        themes: body.themes || [],
        relationships: body.relationships || [],
        insights: body.insights || '',
        clusteredAt: body.clusteredAt || new Date().toISOString(),
      };
      fs.writeFileSync(getAxialFile(runId), JSON.stringify(result, null, 2));
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
