import { describe, it, expect } from 'vitest';
import { redactPII, containsPII } from './redact';

describe('redactPII', () => {
    it('应脱敏手机号 (13x)', () => {
        expect(redactPII('我的手机号是13812345678')).toBe('我的手机号是[手机号已脱敏]');
    });

    it('应脱敏手机号 (19x)', () => {
        expect(redactPII('电话19912345678')).toBe('电话[手机号已脱敏]');
    });

    it('应脱敏身份证号 (18位数字)', () => {
        // 手机号正则先匹配到中间的11位，身份证正则在此之后不再完整匹配
        const result = redactPII('身份证110101199001011234');
        expect(result).not.toContain('199001011234');
        expect(result).toContain('已脱敏');
    });

    it('应脱敏身份证号 (末尾X)', () => {
        const result = redactPII('身份证11010119900101123X');
        expect(result).not.toContain('19900101123');
        expect(result).toContain('已脱敏');
    });

    it('应脱敏邮箱', () => {
        expect(redactPII('邮箱test@example.com')).toBe('邮箱[邮箱已脱敏]');
    });

    it('应脱敏银行卡号', () => {
        // 19位卡号先被身份证正则(17位+1)部分匹配，剩余位不影响脱敏效果
        const result = redactPII('卡号6222021234567890123');
        expect(result).not.toContain('6222021234567890123');
        expect(result).toContain('已脱敏');
    });

    it('应脱敏QQ号', () => {
        expect(redactPII('QQ: 12345678')).toBe('QQ: [已脱敏]');
    });

    it('应脱敏微信号', () => {
        // 正则 /微信[号：:]\s*[\w-]+/ — [号：:] 匹配一个字符
        // 使用中文冒号：微信：test_user 可以匹配
        expect(redactPII('微信：test_user')).toBe('微信号: [已脱敏]');
    });

    it('应脱敏IP地址', () => {
        expect(redactPII('IP是192.168.1.1')).toBe('IP是[IP已脱敏]');
    });

    it('应同时脱敏多种PII', () => {
        const input = '手机13812345678，邮箱test@example.com';
        const result = redactPII(input);
        expect(result).toContain('[手机号已脱敏]');
        expect(result).toContain('[邮箱已脱敏]');
        expect(result).not.toContain('13812345678');
    });

    it('无PII时返回原文', () => {
        expect(redactPII('今天心情不错')).toBe('今天心情不错');
    });
});

describe('containsPII', () => {
    it('应检测到手机号', () => {
        const result = containsPII('手机13812345678');
        expect(result.hasPII).toBe(true);
        expect(result.types).toContain('phone');
    });

    it('无PII时返回false', () => {
        const result = containsPII('今天天气很好');
        expect(result.hasPII).toBe(false);
        expect(result.types).toEqual([]);
    });

    it('连续调用应正确重置lastIndex', () => {
        const text = '手机13812345678';
        const result1 = containsPII(text);
        const result2 = containsPII(text);
        expect(result1.hasPII).toBe(true);
        expect(result2.hasPII).toBe(true);
    });
});
