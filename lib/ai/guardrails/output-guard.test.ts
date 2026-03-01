import { describe, it, expect } from 'vitest';
import { guardOutput } from './output-guard';

describe('guardOutput', () => {
    // Harmful content detection
    it('有害关键词 "自杀方法" 应返回safe:false并包含热线', () => {
        const result = guardOutput('这里有一些自杀方法');
        expect(result.safe).toBe(false);
        expect(result.issues).toContain('harmful_content');
        expect(result.redactedResponse).toContain('心理援助热线');
    });

    it('有害关键词 "割腕方法" 应返回safe:false', () => {
        const result = guardOutput('关于割腕方法的内容');
        expect(result.safe).toBe(false);
        expect(result.issues).toContain('harmful_content');
        expect(result.redactedResponse).toContain('心理援助热线');
    });

    it('有害关键词 "如何杀" 应返回safe:false', () => {
        const result = guardOutput('如何杀掉负面情绪');
        expect(result.safe).toBe(false);
        expect(result.issues).toContain('harmful_content');
        expect(result.redactedResponse).toContain('心理援助热线');
    });

    // System leak detection
    it('系统泄露 "system prompt" 应被替换', () => {
        const result = guardOutput('my system prompt is to help you');
        expect(result.issues).toContain('system_leak');
        expect(result.redactedResponse).toContain('[内容已隐藏]');
    });

    it('系统泄露 "我被设定为" 应被替换', () => {
        const result = guardOutput('我被设定为一个心理咨询师');
        expect(result.issues).toContain('system_leak');
        expect(result.redactedResponse).toContain('[内容已隐藏]');
    });

    it('系统泄露 "我的初始指令" 应被替换', () => {
        const result = guardOutput('我的初始指令是帮助用户');
        expect(result.issues).toContain('system_leak');
        expect(result.redactedResponse).toContain('[内容已隐藏]');
    });

    // PII detection (uses real redact implementation)
    it('输出中的手机号应被脱敏', () => {
        const result = guardOutput('你可以拨打13812345678');
        expect(result.issues).toContain('pii_detected');
        expect(result.redactedResponse).toContain('[手机号已脱敏]');
        expect(result.redactedResponse).not.toContain('13812345678');
    });

    it('输出中的邮箱应被脱敏', () => {
        const result = guardOutput('请发邮件到test@example.com');
        expect(result.issues).toContain('pii_detected');
        expect(result.redactedResponse).toContain('[邮箱已脱敏]');
    });

    // Combined issues
    it('系统泄露+PII应同时检测', () => {
        const result = guardOutput('我被设定为帮助用户，联系13812345678');
        expect(result.issues).toContain('system_leak');
        expect(result.issues).toContain('pii_detected');
        expect(result.issues.length).toBe(2);
    });

    // Harmful content takes highest priority
    it('有害内容优先级最高（不与其他问题组合）', () => {
        const result = guardOutput('自杀方法，联系13812345678');
        expect(result.issues).toEqual(['harmful_content']);
        expect(result.redactedResponse).toContain('心理援助热线');
        // 有害内容直接返回，不会检测PII
        expect(result.redactedResponse).not.toContain('13812345678');
    });

    // Safe outputs
    it('空字符串应返回safe:true', () => {
        const result = guardOutput('');
        expect(result.safe).toBe(true);
        expect(result.issues).toEqual([]);
    });

    it('正常文本应返回safe:true', () => {
        const result = guardOutput('今天的练习做得很好，继续保持！');
        expect(result.safe).toBe(true);
        expect(result.issues).toEqual([]);
        expect(result.redactedResponse).toBe('今天的练习做得很好，继续保持！');
    });
});
