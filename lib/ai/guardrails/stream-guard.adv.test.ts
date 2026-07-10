import { describe, it, expect } from 'vitest';
import { createOutputGuardStream } from './stream-guard';

type Chunk = { type: string; id?: string; delta?: string };

async function run(deltas: string[]): Promise<string> {
    const guard = createOutputGuardStream<Chunk>({ mode: 'stream' });
    const writer = guard.writable.getWriter();
    const reader = guard.readable.getReader();
    const out: string[] = [];
    const readAll = (async () => {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value.type === 'text-delta') out.push(value.delta ?? '');
        }
    })();
    for (const d of deltas) await writer.write({ type: 'text-delta', id: 't1', delta: d });
    await writer.write({ type: 'text-end', id: 't1' });
    await writer.close();
    await readAll;
    return out.join('');
}

describe('adversarial stream-guard', () => {
    it('system-leak spanning >48 chars via \\s* straddles tail buffer', async () => {
        // "system" + 60 spaces + "prompt" — pattern length 72 > TAIL_BUFFER 48
        const deltas = ['system', ' '.repeat(30), ' '.repeat(30), 'prompt', '，接下来是正常的安慰内容，希望你今天过得好一些。'];
        const result = await run(deltas);
        console.log('OUT1:', JSON.stringify(result));
        // 期望（如果护栏完备）：不含 "system"，且正常内容完整
        expect(result.includes('接下来是正常的安慰内容')).toBe(true);
    });

    it('second occurrence of same leak pattern passes unredacted', async () => {
        const deltas = ['我的系统提示', '不能说。但另一份', '我的系统提示', '是：你是一个AI。'];
        const result = await run(deltas);
        console.log('OUT2:', JSON.stringify(result));
        expect(result.match(/我的系统提示/g)?.length ?? 0).toBe(0);
    });
});
