import type { RouteType } from '@/types/chat';
import type { SceneContext } from './scene';

export type WebSearchCapabilityMode = 'off' | 'advisor' | 'enabled';
export type WebSearchNeedMode = 'none' | 'suggested' | 'required';
export type WebSearchStatus = 'not_needed' | 'skipped' | 'completed' | 'failed';

export interface WebSearchCapability {
  mode: WebSearchCapabilityMode;
  provider?: 'openai';
  toolReady: boolean;
  autoSearchSuggested: boolean;
}

export interface WebSearchSource {
  title: string;
  url: string;
}

export interface WebSearchDecision {
  need: WebSearchNeedMode;
  capabilityMode: WebSearchCapabilityMode;
  provider?: 'openai';
  toolReady: boolean;
  shouldOfferSearch: boolean;
  reason: string;
  queryHint?: string;
  status: WebSearchStatus;
  summary?: string;
  sources?: WebSearchSource[];
  latencyMs?: number;
  citationCount?: number;
  error?: string;
}

interface AssessWebSearchNeedInput {
  message: string;
  routeType: RouteType;
  scene: SceneContext;
  capability?: WebSearchCapability;
}

interface ExecuteWebSearchInput {
  message: string;
  scene: SceneContext;
  decision: WebSearchDecision;
  capability?: WebSearchCapability;
}

type OpenAIResponsesOutputItem = {
  type?: string;
  action?: {
    sources?: Array<{ title?: string; url?: string }>;
  };
  content?: Array<{
    type?: string;
    text?: string;
    annotations?: Array<{ title?: string; url?: string }>;
  }>;
};

type OpenAIWebSearchResponse = {
  output_text?: string;
  output?: OpenAIResponsesOutputItem[];
};

const EXPLICIT_FACT_PATTERNS = [
  /最新|官方|怎么规定|政策|法规|校规|劳动法|社保|产假|合同|赔偿/,
  /api|文档|sdk|schema|数据库|标准|规范|行业常规|行业惯例/i,
  /(字段|domain).*(怎么定义|官方|规范|schema)/i,
];

const FACT_TOPIC_PATTERNS = [
  /谁负责|应该谁来|通常怎么做|流程上|行业里|学校里|公司里/,
  /合法么|合规吗|能不能|是否允许|怎么申诉|怎么办手续/,
];

const COACHING_ONLY_PATTERNS = [
  /我很难受|我很烦|我委屈|我崩溃|我想吐槽|我就是想说说|先陪我聊聊/,
  /我想被接住|我想理清|我睡不着|我现在很慌/,
];

function normalize(text: string): string {
  return text.toLowerCase();
}

function needsExternalFacts(text: string): boolean {
  return EXPLICIT_FACT_PATTERNS.some((pattern) => pattern.test(text));
}

function hintsAtExternalFacts(text: string): boolean {
  return FACT_TOPIC_PATTERNS.some((pattern) => pattern.test(text));
}

function isPureCoaching(text: string): boolean {
  return COACHING_ONLY_PATTERNS.some((pattern) => pattern.test(text));
}

function dedupeSources(sources: WebSearchSource[]): WebSearchSource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    if (!source.url || seen.has(source.url)) return false;
    seen.add(source.url);
    return true;
  });
}

function buildOpenAIBaseUrl(): string {
  return (process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
}

function extractSources(output: OpenAIResponsesOutputItem[] = []): WebSearchSource[] {
  const directSources = output.flatMap((item) =>
    (item.action?.sources || [])
      .filter((source) => source.url)
      .map((source) => ({
        title: source.title || source.url || 'Untitled source',
        url: source.url || '',
      })),
  );

  const annotationSources = output.flatMap((item) =>
    (item.content || []).flatMap((contentItem) =>
      (contentItem.annotations || [])
        .filter((annotation) => annotation.url)
        .map((annotation) => ({
          title: annotation.title || annotation.url || 'Untitled source',
          url: annotation.url || '',
        })),
    ),
  );

  return dedupeSources([...directSources, ...annotationSources]).slice(0, 5);
}

async function runOpenAIRealtimeSearch(query: string): Promise<{ summary: string; sources: WebSearchSource[] }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY is not configured');
  }

  const response = await fetch(`${buildOpenAIBaseUrl()}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.MENTAL_WEBSEARCH_MODEL || process.env.OPENAI_CHAT_MODEL || 'gpt-5.5-mini',
      input: query,
      reasoning: { effort: 'low' },
      tools: [
        {
          type: 'web_search',
          user_location: {
            type: 'approximate',
            country: process.env.MENTAL_WEBSEARCH_COUNTRY || 'CN',
            timezone: process.env.TZ || 'Asia/Shanghai',
          },
        },
      ],
      tool_choice: 'required',
      include: ['web_search_call.action.sources'],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI web search failed: ${response.status} - ${error}`);
  }

  const data = await response.json() as OpenAIWebSearchResponse;
  const summary = data.output_text?.trim();
  const sources = extractSources(data.output || []);

  if (!summary) {
    throw new Error('OpenAI web search returned empty summary');
  }

  return { summary, sources };
}

export function resolveWebSearchCapability(): WebSearchCapability {
  const rawMode = (process.env.MENTAL_WEBSEARCH_MODE || 'enabled').toLowerCase();
  const mode: WebSearchCapabilityMode =
    rawMode === 'off' || rawMode === 'enabled' || rawMode === 'advisor'
      ? rawMode
      : 'enabled';

  const provider = process.env.MENTAL_WEBSEARCH_PROVIDER === 'openai' || !process.env.MENTAL_WEBSEARCH_PROVIDER
    ? 'openai'
    : undefined;

  const toolReady = mode === 'enabled' && provider === 'openai' && Boolean(process.env.OPENAI_API_KEY);

  return {
    mode,
    provider,
    toolReady,
    autoSearchSuggested: process.env.MENTAL_WEBSEARCH_AUTO_SUGGESTED === '1',
  };
}

export function assessWebSearchNeed(input: AssessWebSearchNeedInput): WebSearchDecision {
  const capability = input.capability || resolveWebSearchCapability();
  const normalized = normalize(input.message);

  if (capability.mode === 'off') {
    return {
      need: 'none',
      capabilityMode: capability.mode,
      provider: capability.provider,
      toolReady: capability.toolReady,
      shouldOfferSearch: false,
      reason: '当前环境关闭了 websearch 能力',
      status: 'not_needed',
    };
  }

  if (input.routeType === 'crisis') {
    return {
      need: 'none',
      capabilityMode: capability.mode,
      provider: capability.provider,
      toolReady: capability.toolReady,
      shouldOfferSearch: false,
      reason: '危机/高风险对话优先稳定支持，不让事实检索打断主链路',
      status: 'not_needed',
    };
  }

  if (isPureCoaching(normalized) && !needsExternalFacts(normalized) && !hintsAtExternalFacts(normalized)) {
    return {
      need: 'none',
      capabilityMode: capability.mode,
      provider: capability.provider,
      toolReady: capability.toolReady,
      shouldOfferSearch: false,
      reason: '当前更像情绪支持或场景理解问题，不需要外部动态事实',
      status: 'not_needed',
    };
  }

  if (needsExternalFacts(normalized)) {
    return {
      need: 'required',
      capabilityMode: capability.mode,
      provider: capability.provider,
      toolReady: capability.toolReady,
      shouldOfferSearch: true,
      reason: '用户显式在问动态政策、官方规则或技术文档类事实',
      queryHint: input.message.slice(0, 160),
      status: capability.toolReady ? 'skipped' : 'failed',
      ...(capability.toolReady ? {} : { error: 'runtime tool is not ready' }),
    };
  }

  if (hintsAtExternalFacts(normalized) || ['workplace_boundary', 'student_pressure'].includes(input.scene.id)) {
    return {
      need: 'suggested',
      capabilityMode: capability.mode,
      provider: capability.provider,
      toolReady: capability.toolReady,
      shouldOfferSearch: true,
      reason: '这类问题可能受制度、流程或外部规则影响，必要时应补充外部事实',
      queryHint: input.message.slice(0, 160),
      status: 'skipped',
    };
  }

  return {
    need: 'none',
    capabilityMode: capability.mode,
    provider: capability.provider,
    toolReady: capability.toolReady,
    shouldOfferSearch: false,
    reason: '当前没有明显的外部事实缺口',
    status: 'not_needed',
  };
}

function shouldExecuteRealtimeSearch(decision: WebSearchDecision, capability: WebSearchCapability): boolean {
  if (!decision.toolReady || capability.mode !== 'enabled') return false;
  if (decision.need === 'required') return true;
  if (decision.need === 'suggested' && capability.autoSearchSuggested) return true;
  return false;
}

export async function executeWebSearchIfNeeded(input: ExecuteWebSearchInput): Promise<WebSearchDecision> {
  const capability = input.capability || resolveWebSearchCapability();
  const baseDecision = input.decision;

  if (!shouldExecuteRealtimeSearch(baseDecision, capability)) {
    return {
      ...baseDecision,
      status: baseDecision.need === 'none' ? 'not_needed' : 'skipped',
    };
  }

  const query = baseDecision.queryHint || input.message;
  const searchStartedAt = Date.now();

  try {
    const result = await runOpenAIRealtimeSearch(query);
    return {
      ...baseDecision,
      status: 'completed',
      summary: result.summary,
      sources: result.sources,
      latencyMs: Date.now() - searchStartedAt,
      citationCount: result.sources.length,
    };
  } catch (error) {
    return {
      ...baseDecision,
      status: 'failed',
      latencyMs: Date.now() - searchStartedAt,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

export function buildWebSearchSystemInjection(decision: WebSearchDecision): string | undefined {
  if (decision.need === 'none') {
    return undefined;
  }

  if (decision.status === 'completed' && decision.summary) {
    return [
      '**websearch（实时结果）**：',
      `- 当前判断：${decision.need}（原因：${decision.reason}）。`,
      '- 以下内容来自实时外部检索，请把“事实查证”与“支持/教练判断”分开表达，不要假装这些信息来自你自己的长期记忆。',
      `- 检索摘要：${decision.summary}`,
      ...(decision.sources && decision.sources.length > 0
        ? ['- 主要来源：', ...decision.sources.map((source) => `  - ${source.title}: ${source.url}`)]
        : []),
    ].join('\n');
  }

  if (!decision.toolReady) {
    return [
      '**websearch 能力边界（v1）**：',
      `- 当前判断：${decision.need}（原因：${decision.reason}）。`,
      '- 当前运行时没有启用实时联网检索，不能假装自己已经查过。',
      '- 先给用户结构化支持或判断框架；凡是涉及政策、劳动法、学校规定、官方文档、技术规范等动态事实，都要明确标注“这部分需要查官方来源确认”。',
      '- 如果用户继续追问事实细节，优先建议查询官方文档/政策来源，而不是编造答案。',
    ].join('\n');
  }

  if (decision.status === 'failed') {
    return [
      '**websearch 能力边界（v1）**：',
      `- 当前判断：${decision.need}（原因：${decision.reason}）。`,
      `- 实时检索尝试失败：${decision.error || 'unknown error'}`,
      '- 不要假装已经查到结果；先回答你能确定的部分，并提醒用户对动态事实做官方核实。',
    ].join('\n');
  }

  return [
    '**websearch 能力边界（v1）**：',
    `- 当前判断：${decision.need}（原因：${decision.reason}）。`,
    '- 这轮没有自动执行实时检索；如果用户继续追问外部事实，再优先触发搜索或明确建议查看官方来源。',
  ].join('\n');
}
