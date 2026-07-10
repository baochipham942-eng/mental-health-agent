import { describe, expect, it } from 'vitest';
import { toChatState } from './chat';

describe('toChatState', () => {
    it('合法枚举值原样返回', () => {
        expect(toChatState('normal')).toBe('normal');
        expect(toChatState('awaiting_followup')).toBe('awaiting_followup');
        expect(toChatState('in_crisis')).toBe('in_crisis');
    });

    it('reasoning 长句 / 对象 / 空值一律拦下（否则下一轮请求撞服务端 z.enum 400）', () => {
        expect(toChatState('用户主诉持续情绪困扰，进入深度了解流程评估')).toBeUndefined();
        expect(toChatState({ reasoning: 'xx', route: 'assessment' })).toBeUndefined();
        expect(toChatState(undefined)).toBeUndefined();
        expect(toChatState(null)).toBeUndefined();
        expect(toChatState('')).toBeUndefined();
    });
});
