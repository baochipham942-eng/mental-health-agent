import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./synthesizer-agent', () => ({
    synthesize: vi.fn(),
}));

import { orchestrateGroupChat, parseMentorReply } from './orchestrator';
import { synthesize } from './synthesizer-agent';
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
