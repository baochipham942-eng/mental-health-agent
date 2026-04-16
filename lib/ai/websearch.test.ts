import { afterEach, describe, expect, it, vi } from 'vitest';
import { assessWebSearchNeed, buildWebSearchSystemInjection, executeWebSearchIfNeeded } from './websearch';
import type { SceneContext } from './scene';

function createScene(overrides?: Partial<SceneContext>): SceneContext {
  return {
    id: 'general_support',
    label: '通用支持',
    role: 'unknown',
    conflict: '当前现实场景还不够明确',
    intent: 'support',
    confidence: 0.32,
    reasons: ['默认测试数据'],
    source: 'fallback',
    ...overrides,
  };
}

describe('websearch decision v1', () => {
  it('纯情绪支持不建议 websearch', () => {
    const decision = assessWebSearchNeed({
      message: '我现在就很委屈，先陪我聊聊吧。',
      routeType: 'support',
      scene: createScene({ id: 'workplace_boundary', label: '职场边界与职责侵蚀' }),
      capability: { mode: 'enabled', provider: 'openai', toolReady: true, autoSearchSuggested: false },
    });

    expect(decision.need).toBe('none');
    expect(decision.shouldOfferSearch).toBe(false);
    expect(decision.status).toBe('not_needed');
  });

  it('官方规则/技术文档问题要求外部事实', () => {
    const decision = assessWebSearchNeed({
      message: '这个数据库字段 domain 应该怎么定义，官方文档现在怎么规定？',
      routeType: 'support',
      scene: createScene({ id: 'workplace_boundary', label: '职场边界与职责侵蚀' }),
      capability: { mode: 'enabled', provider: 'openai', toolReady: true, autoSearchSuggested: false },
    });

    expect(decision.need).toBe('required');
    expect(decision.shouldOfferSearch).toBe(true);
    expect(decision.status).toBe('skipped');
  });

  it('职场流程规范问题给 suggested', () => {
    const decision = assessWebSearchNeed({
      message: '这种字段变更通常应该谁来写 Jira 卡？行业里一般怎么分工？',
      routeType: 'support',
      scene: createScene({ id: 'workplace_boundary', label: '职场边界与职责侵蚀' }),
      capability: { mode: 'enabled', provider: 'openai', toolReady: true, autoSearchSuggested: false },
    });

    expect(decision.need).toBe('suggested');
    expect(decision.status).toBe('skipped');
  });

  it('未接入实时搜索时，注入必须强调不能假装查过', () => {
    const injection = buildWebSearchSystemInjection({
      need: 'required',
      capabilityMode: 'advisor',
      provider: 'openai',
      toolReady: false,
      shouldOfferSearch: true,
      reason: '用户显式在问动态政策、官方规则或技术文档类事实',
      queryHint: '劳动法怎么规定',
      status: 'failed',
    });

    expect(injection).toContain('没有启用实时联网检索');
    expect(injection).toContain('不能假装自己已经查过');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.OPENAI_API_KEY;
  });

  it('执行实时搜索后返回 latency 和 citation count', async () => {
    process.env.OPENAI_API_KEY = 'test-key';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        output_text: '官方资料显示，产假和陪产假需要按当地规则核对。',
        output: [
          {
            action: {
              sources: [
                {
                  title: '官方政策说明',
                  url: 'https://example.com/policy',
                },
              ],
            },
          },
        ],
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }),
    ));

    const decision = await executeWebSearchIfNeeded({
      message: '劳动法现在怎么规定产假？',
      scene: createScene({ id: 'workplace_boundary', label: '职场边界与职责侵蚀' }),
      capability: { mode: 'enabled', provider: 'openai', toolReady: true, autoSearchSuggested: false },
      decision: {
        need: 'required',
        capabilityMode: 'enabled',
        provider: 'openai',
        toolReady: true,
        shouldOfferSearch: true,
        reason: '用户显式在问动态政策、官方规则或技术文档类事实',
        queryHint: '劳动法现在怎么规定产假',
        status: 'skipped',
      },
    });

    expect(decision.status).toBe('completed');
    expect(decision.summary).toContain('官方资料显示');
    expect(decision.latencyMs).toBeTypeOf('number');
    expect(decision.latencyMs).toBeGreaterThanOrEqual(0);
    expect(decision.citationCount).toBe(1);
    expect(decision.sources).toEqual([
      {
        title: '官方政策说明',
        url: 'https://example.com/policy',
      },
    ]);
  });
});
