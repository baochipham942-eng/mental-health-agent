import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('./synthesizer-agent', () => ({
    synthesize: vi.fn(),
}));

import { orchestrateGroupChat } from './orchestrator';
import { synthesize } from './synthesizer-agent';

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
