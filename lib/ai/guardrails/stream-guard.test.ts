import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./output-guard', async (importOriginal) => {
    const actual = await importOriginal<typeof import('./output-guard')>();
    return { ...actual, guardOutput: vi.fn(actual.guardOutput) };
});

import { createOutputGuardStream, STREAM_GUARD_FALLBACK, type StreamGuardMode } from './stream-guard';
import { guardOutput } from './output-guard';

interface Chunk { type: string; id?: string; delta?: string }

const textDeltas = (deltas: string[], id = 't1'): Chunk[] => [
    { type: 'text-start', id },
    ...deltas.map(delta => ({ type: 'text-delta', id, delta })),
    { type: 'text-end', id },
];

/** 把 chunks 灌进护栏流，返回输出 chunks */
async function run(chunks: Chunk[], mode: StreamGuardMode = 'stream'): Promise<Chunk[]> {
    const ts = createOutputGuardStream<Chunk>({ mode });
    const writer = ts.writable.getWriter();
    const reader = ts.readable.getReader();
    const out: Chunk[] = [];
    const readAll = (async () => {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            out.push(value!);
        }
    })();
    for (const c of chunks) await writer.write(c);
    await writer.close();
    await readAll;
    return out;
}

const joinText = (chunks: Chunk[]) =>
    chunks.filter(c => c.type === 'text-delta').map(c => c.delta).join('');

describe('createOutputGuardStream', () => {
    beforeEach(() => {
        vi.mocked(guardOutput).mockClear();
    });

    it('正常文本完整透传，且非文本 chunk 原样通过', async () => {
        const out = await run(textDeltas(['今天的练习', '做得很好，', '继续保持！']));
        expect(joinText(out)).toBe('今天的练习做得很好，继续保持！');
        expect(out[0]).toEqual({ type: 'text-start', id: 't1' });
        expect(out[out.length - 1]).toEqual({ type: 'text-end', id: 't1' });
    });

    it('有害短语拆成多个 chunk 时，用户侧收不到原文，只收到危机热线', async () => {
        const out = await run(textDeltas(['我来告诉你自', '杀方', '法是什么，第一步……']));
        const text = joinText(out);
        expect(text).not.toContain('自杀方法');
        expect(text).not.toContain('第一步');
        expect(text).toContain('心理援助热线');
    });

    it('手机号跨 chunk 时应被脱敏', async () => {
        const out = await run(textDeltas(['你可以拨打138', '1234', '5678 找我聊聊，好吗？']));
        const text = joinText(out);
        expect(text).not.toContain('13812345678');
        expect(text).toContain('[手机号已脱敏]');
        expect(text).toContain('找我聊聊');
    });

    it('系统泄露短语跨 chunk 时应被替换为 [内容已隐藏]', async () => {
        const out = await run(textDeltas(['my system ', 'prompt is to help you. 我们继续聊聊今天发生的事情吧，把细节都说给我听听。']));
        const text = joinText(out);
        expect(text).not.toContain('system prompt');
        expect(text).toContain('[内容已隐藏]');
    });

    it('stream 模式下超出尾部缓冲的安全前缀会先行放行（不整段憋住）', async () => {
        const long = '安全的陪伴内容。'.repeat(20); // 160 字，远超 48 字尾巴
        const ts = createOutputGuardStream<Chunk>({ mode: 'stream' });
        const writer = ts.writable.getWriter();
        const reader = ts.readable.getReader();
        const out: Chunk[] = [];
        const readAll = (async () => {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                out.push(value!);
            }
        })();
        await writer.write({ type: 'text-start', id: 't1' });
        await writer.write({ type: 'text-delta', id: 't1', delta: long });
        // 尚未 close：前缀已经放行，尾巴仍在缓冲
        const flushedEarly = out.filter(c => c.type === 'text-delta').length > 0;
        await writer.close();
        await readAll;
        expect(flushedEarly).toBe(true);
        expect(joinText(out)).toBe(long);
    });

    it('buffer 模式下 text-end 之前不放行任何文本', async () => {
        const ts = createOutputGuardStream<Chunk>({ mode: 'buffer' });
        const writer = ts.writable.getWriter();
        const reader = ts.readable.getReader();
        const out: Chunk[] = [];
        const readAll = (async () => {
            for (;;) {
                const { done, value } = await reader.read();
                if (done) break;
                out.push(value!);
            }
        })();
        await writer.write({ type: 'text-start', id: 't1' });
        await writer.write({ type: 'text-delta', id: 't1', delta: '完整缓冲的回复内容，' });
        await writer.write({ type: 'text-delta', id: 't1', delta: '结束前不应放行。' });
        expect(out.filter(c => c.type === 'text-delta')).toHaveLength(0);
        await writer.write({ type: 'text-end', id: 't1' });
        await writer.close();
        await readAll;
        expect(joinText(out)).toBe('完整缓冲的回复内容，结束前不应放行。');
    });

    it('buffer 模式下有害内容整体替换为危机热线，原文一个字不漏出', async () => {
        const out = await run(textDeltas(['先说点别的，', '然后告诉你安眠药剂量。']), 'buffer');
        const text = joinText(out);
        expect(text).not.toContain('先说点别的');
        expect(text).not.toContain('安眠药剂量');
        expect(text).toContain('心理援助热线');
    });

    it('guardOutput 抛异常时 fail-closed：输出固定安全回复，不透传原文', async () => {
        // Once：首个 delta 抛错即 fail-closed 进入 blocked，之后不再调用 guardOutput；
        // 用 Once 避免实现泄漏到后续用例（mockClear 不会还原 implementation）
        vi.mocked(guardOutput).mockImplementationOnce(() => {
            throw new Error('guard exploded');
        });
        const out = await run(textDeltas(['这段原文不应该被用户看到。']));
        const text = joinText(out);
        expect(text).not.toContain('这段原文');
        expect(text).toContain(STREAM_GUARD_FALLBACK);
    });

    it('检出有害内容后吞掉后续所有原文 chunk', async () => {
        const out = await run(textDeltas(['告诉你怎么死', '比较快，另外这里是后续走私的内容。']));
        const text = joinText(out);
        expect(text).not.toContain('怎么死');
        expect(text).not.toContain('走私');
        // 危机回复只发一次（该短语在危机文案里只出现一次）
        expect(text.split('我理解你正在经历困难的时刻').length - 1).toBe(1);
    });
});
