import { describe, it, expect } from 'vitest';
import { containsProfanity, getProfanityReason, checkProfanity } from './profanity';

describe('containsProfanity', () => {
    it('检测政治敏感词', () => {
        expect(containsProfanity('六四事件')).toBe(true);
    });

    it('检测色情词汇', () => {
        expect(containsProfanity('色情内容')).toBe(true);
    });

    it('检测暴力词汇', () => {
        expect(containsProfanity('恐怖袭击')).toBe(true);
    });

    it('检测侮辱词汇', () => {
        expect(containsProfanity('傻逼')).toBe(true);
    });

    it('检测违法词汇', () => {
        expect(containsProfanity('贩毒')).toBe(true);
    });

    it('正常文本不触发', () => {
        expect(containsProfanity('今天天气不错')).toBe(false);
    });

    it('空字符串不触发', () => {
        expect(containsProfanity('')).toBe(false);
    });

    it('英文大小写不敏感', () => {
        expect(containsProfanity('FUCK')).toBe(true);
    });
});

describe('getProfanityReason', () => {
    it('返回命中的分类名称', () => {
        const reason = getProfanityReason('色情');
        expect(reason).toContain('色情低俗');
    });

    it('无违规返回 null', () => {
        expect(getProfanityReason('正常文本')).toBeNull();
    });
});

describe('checkProfanity', () => {
    it('空字符串返回无违规', () => {
        const result = checkProfanity('');
        expect(result).toEqual({ hasProfanity: false, reason: null, categories: [] });
    });

    it('单分类命中返回正确分类', () => {
        const result = checkProfanity('贩毒');
        expect(result.hasProfanity).toBe(true);
        expect(result.categories).toContain('illegal');
        expect(result.reason).toContain('违法违规');
    });

    it('多分类命中返回所有分类', () => {
        const result = checkProfanity('傻逼去贩毒');
        expect(result.hasProfanity).toBe(true);
        expect(result.categories).toContain('insulting');
        expect(result.categories).toContain('illegal');
        expect(result.reason).toContain('侮辱谩骂');
        expect(result.reason).toContain('违法违规');
    });
});
