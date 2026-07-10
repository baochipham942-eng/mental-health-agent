import { describe, it, expect } from 'vitest';
import { writeChatPreludeMetadata, sanitizeMessageMetaForUser } from '../response-visibility';

const INTERNAL_PART_TYPES = ['data-state', 'data-safety', 'data-persona', 'data-memory', 'data-dialogue', 'data-trace'];
const PRODUCT_PART_TYPES = ['data-route', 'data-scene', 'data-websearch', 'data-adaptive-mode'];

function collectPreludeParts(isAdmin: boolean) {
    const writes: any[] = [];
    const writer = { write: (chunk: any) => writes.push(chunk) } as any;

    writeChatPreludeMetadata(writer, {
        isAdmin,
        routeType: 'support',
        sceneContext: { id: 'general_support', label: '通用支持', source: 'fallback', confidence: 0 } as any,
        webSearchDecision: { need: 'none', status: 'skipped' } as any,
        adaptiveMode: 'companion',
        stateData: { reasoning: '普通消息默认交给主模型直接回应' },
        safetyData: { label: 'normal', score: 1, reasoning: 'triage 判定安全', constraints: [] },
        personaData: { mode: 'companion', reasoning: '默认陪伴式回应' },
        memoryData: { check: '无' },
        dialogueData: { turn: 1, phase: 'opening', machineState: 'opening', riskLevel: 'none' },
        traceData: { agentTrace: [{ agent: 'triage', startMs: 0, durationMs: 10 }] },
    });

    return writes;
}

describe('writeChatPreludeMetadata', () => {
    it('普通用户：不下发 safety/agentTrace 等内部调试 parts，产品 parts 保留', () => {
        const writes = collectPreludeParts(false);
        const types = writes.map((w) => w.type);

        for (const t of INTERNAL_PART_TYPES) {
            expect(types).not.toContain(t);
        }
        for (const t of PRODUCT_PART_TYPES) {
            expect(types).toContain(t);
        }
        // 序列化整体不含内部字段
        expect(JSON.stringify(writes)).not.toContain('agentTrace');
    });

    it('管理员：内部调试 parts 完整下发（含 agentTrace）', () => {
        const writes = collectPreludeParts(true);
        const types = writes.map((w) => w.type);

        for (const t of [...PRODUCT_PART_TYPES, ...INTERNAL_PART_TYPES]) {
            expect(types).toContain(t);
        }
        const trace = writes.find((w) => w.type === 'data-trace');
        expect(trace.data.agentTrace).toHaveLength(1);
        const safety = writes.find((w) => w.type === 'data-safety');
        expect(safety.data.reasoning).toBe('triage 判定安全');
    });

    it('data-state 只带 reasoning，不把自由文本塞进 state 字段（防止回填 currentState 撞 z.enum）', () => {
        const writes = collectPreludeParts(true);
        const statePart = writes.find((w) => w.type === 'data-state');
        expect(statePart.data.reasoning).toBe('普通消息默认交给主模型直接回应');
        expect(statePart.data.state).toBeUndefined();
    });
});

describe('sanitizeMessageMetaForUser', () => {
    it('剥掉内部分析字段，保留产品字段', () => {
        const meta = {
            safety: { label: 'normal', reasoning: 'xx' },
            state: { reasoning: 'yy', route: 'support' },
            agentTrace: [{ agent: 'triage' }],
            dialogueContext: { state: 'opening' },
            persona: { mode: 'companion' },
            memory: { check: '无' },
            routeType: 'support',
            actionCards: [{ id: 'breathing' }],
            toolCalls: [{ toolName: 'recommend_skill_card' }],
            scene: { id: 'general_support' },
            webSearch: { status: 'skipped' },
            adaptiveMode: 'companion',
        };

        const clean = sanitizeMessageMetaForUser(meta)!;

        expect(clean.safety).toBeUndefined();
        expect(clean.state).toBeUndefined();
        expect(clean.agentTrace).toBeUndefined();
        expect(clean.dialogueContext).toBeUndefined();
        expect(clean.persona).toBeUndefined();
        expect(clean.memory).toBeUndefined();

        expect(clean.routeType).toBe('support');
        expect(clean.actionCards).toHaveLength(1);
        expect(clean.toolCalls).toHaveLength(1);
        expect(clean.scene).toEqual({ id: 'general_support' });
        expect(clean.webSearch).toEqual({ status: 'skipped' });
        expect(clean.adaptiveMode).toBe('companion');
        // 原对象不被修改
        expect(meta.safety).toBeDefined();
    });

    it('null / 非对象 meta 返回 undefined', () => {
        expect(sanitizeMessageMetaForUser(null)).toBeUndefined();
        expect(sanitizeMessageMetaForUser(undefined)).toBeUndefined();
        expect(sanitizeMessageMetaForUser('str')).toBeUndefined();
        expect(sanitizeMessageMetaForUser([1, 2])).toBeUndefined();
    });
});
