import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./synthesizer-agent', () => ({
    synthesize: vi.fn(),
}));

vi.mock('./moderator-agent', () => ({
    generateOpening: vi.fn(),
    decideNextSpeaker: vi.fn(),
    generateTransition: vi.fn(),
}));

vi.mock('ai', async (importOriginal) => {
    const actual = await importOriginal<typeof import('ai')>();
    return { ...actual, generateText: vi.fn(), streamText: vi.fn() };
});

import { generateText } from 'ai';
import { orchestrateGroupChat, parseMentorReply } from './orchestrator';
import { synthesize } from './synthesizer-agent';
import { generateOpening, generateTransition } from './moderator-agent';
import { getMentor } from '@/lib/ai/mentors/personas';

async function collectEvents(generator: AsyncGenerator<any>) {
    const events: any[] = [];
    for await (const event of generator) {
        events.push(event);
    }
    return events;
}

describe('orchestrateGroupChat summarize intent', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        (synthesize as any).mockResolvedValue('整理好了：两位大师的观点可以合并成一个行动方向。');
    });

    it('只生成总结，不开启新导师轮次', async () => {
        const events = await collectEvents(orchestrateGroupChat({
            mentorIds: ['socrates', 'adler'],
            mode: 'discuss',
            topic: '我总是害怕失败',
            intent: 'summarize',
            messages: [
                { role: 'user', content: '我总是害怕失败' },
                { role: 'assistant', mentorId: 'socrates', content: '先问清楚你说的失败是什么。', round: 1 },
                { role: 'assistant', mentorId: 'adler', content: '你可以把行动和他人评价分开。', round: 1 },
                { role: 'user', content: '请总结一下' },
            ],
        }));

        expect(events.map(e => e.type)).toEqual([
            'moderator',
            'synthesis',
            'phase_metrics',
            'done',
        ]);
        expect(events.some(e => e.type === 'mentor_start')).toBe(false);
        expect(events.some(e => e.type === 'round_end')).toBe(false);
        expect(synthesize).toHaveBeenCalledWith(
            expect.any(Array),
            'discuss',
            '我总是害怕失败',
            expect.arrayContaining([
                expect.objectContaining({ mentorName: '苏格拉底', round: 1 }),
                expect.objectContaining({ mentorName: '阿尔弗雷德·阿德勒', round: 1 }),
            ]),
        );
    });
});

describe('orchestrateGroupChat 输出护栏', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('大师发言含有害内容时，分块吐出的是危机文案而非原文', async () => {
        (generateOpening as any).mockResolvedValue('两位大师已就位，我们开始吧。');
        (generateTransition as any).mockResolvedValue({ transition: '第一轮先到这里。', shouldEnd: true });
        (generateText as any).mockResolvedValue({ text: '教你一个自杀方法，第一步是……' });

        const events = await collectEvents(orchestrateGroupChat({
            mentorIds: ['socrates', 'adler'],
            mode: 'discuss',
            topic: '我最近很累',
            messages: [{ role: 'user', content: '我最近很累' }],
        }));

        const mentorText = events.filter(e => e.type === 'mentor_chunk').map(e => e.content).join('');
        expect(mentorText).not.toContain('自杀方法');
        expect(mentorText).toContain('心理援助热线');
    });

    it('synthesis 输出含 PII 时应脱敏后再吐出', async () => {
        (synthesize as any).mockResolvedValue('总结：有困难可以拨打13812345678找我。');

        const events = await collectEvents(orchestrateGroupChat({
            mentorIds: ['socrates', 'adler'],
            mode: 'discuss',
            topic: '我总是害怕失败',
            intent: 'summarize',
            messages: [
                { role: 'user', content: '我总是害怕失败' },
                { role: 'assistant', mentorId: 'socrates', content: '先问清楚失败是什么。', round: 1 },
                { role: 'user', content: '请总结一下' },
            ],
        }));

        const synthesis = events.find(e => e.type === 'synthesis');
        expect(synthesis.content).not.toContain('13812345678');
        expect(synthesis.content).toContain('[手机号已脱敏]');
    });
});

describe('orchestrateGroupChat 韧性与取消', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('LLM 超时/失败（重试耗尽）走弃权，不伪造发言', async () => {
        (generateOpening as any).mockResolvedValue('两位大师已就位。');
        (generateTransition as any).mockResolvedValue({ transition: '先到这里。', shouldEnd: true });
        // 模拟统一超时：abortSignal 触发时 SDK 抛 AbortError
        (generateText as any).mockRejectedValue(
            Object.assign(new Error('The operation was aborted due to timeout'), { name: 'AbortError' }),
        );

        const events = await collectEvents(orchestrateGroupChat({
            mentorIds: ['socrates', 'adler'],
            mode: 'discuss',
            topic: '我最近很累',
            messages: [{ role: 'user', content: '我最近很累' }],
        }));

        expect(events.filter(e => e.type === 'mentor_pass')).toHaveLength(2);
        expect(events.some(e => e.type === 'mentor_start')).toBe(false);
        expect(events[events.length - 1].type).toBe('done');
    }, 15_000);

    it('signal 已 abort 时不再产生任何事件（不调用剩余 mentor）', async () => {
        const controller = new AbortController();
        controller.abort();

        const events = await collectEvents(orchestrateGroupChat({
            mentorIds: ['socrates', 'adler'],
            mode: 'discuss',
            topic: '我最近很累',
            messages: [{ role: 'user', content: '我最近很累' }],
            signal: controller.signal,
        }));

        expect(events).toEqual([]);
        expect(generateText).not.toHaveBeenCalled();
    });
});

describe('parseMentorReply 弃权协议与显式 @', () => {
    const socrates = getMentor('socrates')!;
    const adler = getMentor('adler')!;
    const jung = getMentor('jung')!;
    const all = [socrates, adler, jung];

    it('[PASS] 开头视为弃权，并截取一句话理由', () => {
        const r = parseMentorReply('[PASS] 阿德勒已说出我想说的', socrates, all);
        expect(r.passed).toBe(true);
        expect(r.passReason).toBe('阿德勒已说出我想说的');
        expect(r.content).toBe('');
    });

    it('单独一行 @大师名 解析为显式回应请求（支持部分名匹配）', () => {
        const r = parseMentorReply(`未经审视的恐惧不值得服从。\n@荣格`, socrates, all);
        expect(r.passed).toBe(false);
        expect(r.wantToRespond).toEqual([jung.id]);
    });

    it('正文中仅提到名字不再视为想回应（旧启发式已退役）', () => {
        const r = parseMentorReply(`我不同意${adler.name}刚才的说法，勇气不是口号。`, socrates, all);
        expect(r.wantToRespond).toEqual([]);
        expect(r.passed).toBe(false);
    });

    it('不会把 @ 自己解析为回应请求', () => {
        const r = parseMentorReply(`我再补充一点。\n@${socrates.name}`, socrates, all);
        expect(r.wantToRespond).toEqual([]);
    });

    it('PASS 理由只取第一个短句，拦截内容走私', () => {
        const r = parseMentorReply('[PASS] 让我用思想实验替代重复论证：假设你现在有两份offer——A是维持现状', socrates, all);
        expect(r.passed).toBe(true);
        expect(r.passReason).toBe('让我用思想实验替代重复论证');
    });

    it('剥掉模型模仿共享历史格式的自名前缀', () => {
        const r = parseMentorReply(`[⚖️ 丹尼尔·卡尼曼]：朋友，我能感受到你的纠结。`, socrates, all);
        expect(r.content).toBe('朋友，我能感受到你的纠结。');
    });
});
