/**
 * MessageBubble 纯函数单元测试
 *
 * 直接导入 message-utils.ts 的真实源码（纯函数，无服务端依赖）
 * 不复制逻辑，确保测试与源码同步
 */

import { describe, it, expect } from 'vitest';
import { parseThoughtTags, stripDuplicateFollowupText } from '../message-utils';

// ====== parseThoughtTags ======

describe('parseThoughtTags', () => {
    it('空字符串 → 空结果', () => {
        const result = parseThoughtTags('');
        expect(result.displayContent).toBe('');
        expect(result.thoughtContent).toBeNull();
    });

    it('无 thought 标签 → 原样返回', () => {
        const result = parseThoughtTags('我理解你的感受');
        expect(result.displayContent).toBe('我理解你的感受');
        expect(result.thoughtContent).toBeNull();
    });

    it('提取单个 thought 标签', () => {
        const result = parseThoughtTags('<thought>用户情绪低落</thought>我理解你的感受');
        expect(result.displayContent).toBe('我理解你的感受');
        expect(result.thoughtContent).toBe('用户情绪低落');
    });

    it('提取多个 thought 标签', () => {
        const result = parseThoughtTags(
            '<thought>第一个想法</thought>你好<thought>第二个想法</thought>世界'
        );
        expect(result.displayContent).toBe('你好世界');
        expect(result.thoughtContent).toContain('第一个想法');
        expect(result.thoughtContent).toContain('第二个想法');
    });

    it('多行 thought 内容', () => {
        const result = parseThoughtTags(
            '<thought>\n用户情绪：焦虑\n强度：7/10\n</thought>让我们聊聊'
        );
        expect(result.displayContent).toBe('让我们聊聊');
        expect(result.thoughtContent).toContain('用户情绪：焦虑');
    });

    it('大小写不敏感', () => {
        const result = parseThoughtTags('<THOUGHT>内部思考</THOUGHT>显示内容');
        expect(result.displayContent).toBe('显示内容');
        expect(result.thoughtContent).toBe('内部思考');
    });

    it('清洗 DeepSeek 泄漏的 recommend_skill_card', () => {
        const result = parseThoughtTags('你可以试试 to=recommend_skill_card some params 呼吸练习');
        expect(result.displayContent).toBe('你可以试试 呼吸练习');
    });

    it('清洗 recommend_lab_exploration 泄漏', () => {
        const result = parseThoughtTags('建议你 to=recommend_lab_exploration params here 探索一下');
        expect(result.displayContent).toBe('建议你 探索一下');
    });

    it('清洗夹杂乱码中文和 JSON 的工具调用泄漏', () => {
        const result = parseThoughtTags('to=recommend_skill_card  尚度json  {"card_type":"breathing"}\n\n听起来你压力很大');
        expect(result.displayContent).toBe('听起来你压力很大');
    });

    it('移除 thought 后的多余空行被压缩', () => {
        const result = parseThoughtTags('<thought>x</thought>\n\n\n你好\n\n世界');
        expect(result.displayContent).toBe('你好\n世界');
    });

    it('只有 thought 标签 → displayContent 为空', () => {
        const result = parseThoughtTags('<thought>纯内部思考</thought>');
        expect(result.displayContent).toBe('');
        expect(result.thoughtContent).toBe('纯内部思考');
    });

    it('嵌套场景（不支持嵌套，取最外层）', () => {
        const result = parseThoughtTags('<thought>外层<thought>内层</thought>外层继续</thought>显示');
        expect(result.displayContent).toContain('显示');
    });
});

// ====== stripDuplicateFollowupText ======

describe('stripDuplicateFollowupText', () => {
    it('无 followup 问题 → 原样返回', () => {
        expect(stripDuplicateFollowupText('一些文本')).toBe('一些文本');
        expect(stripDuplicateFollowupText('一些文本', undefined)).toBe('一些文本');
    });

    it('空原文 → 返回空', () => {
        expect(stripDuplicateFollowupText('', '问题')).toBe('');
    });

    it('去除完全重复的问题文本', () => {
        const result = stripDuplicateFollowupText(
            '你最近工作压力大吗？',
            '你最近工作压力大吗？'
        );
        expect(result).toBe('');
    });

    it('去除引导语前缀 + 重复问题', () => {
        const result = stripDuplicateFollowupText(
            '为了更好地了解你的情况，请回答：你最近睡眠如何？',
            '你最近睡眠如何？'
        );
        expect(result).toBe('');
    });

    it('保留不重复的内容行', () => {
        const result = stripDuplicateFollowupText(
            '我理解你的感受。\n你最近工作压力大吗？',
            '你最近工作压力大吗？'
        );
        expect(result).toContain('我理解你的感受');
    });

    it('标点差异不影响去重', () => {
        const result = stripDuplicateFollowupText(
            '你最近压力大吗？',
            '你最近压力大吗'
        );
        expect(result).toBe('');
    });

    it('多行内容只去除匹配行', () => {
        const result = stripDuplicateFollowupText(
            '第一行独立内容\n重复的问题\n第三行独立内容',
            '重复的问题'
        );
        expect(result).toContain('第一行独立内容');
        expect(result).toContain('第三行独立内容');
        expect(result).not.toContain('重复的问题');
    });

    it('去除"我想再确认一个小问题"前缀', () => {
        const result = stripDuplicateFollowupText(
            '我想再确认一个小问题：问题内容',
            '问题内容'
        );
        expect(result).toBe('');
    });

    it('去除"我想再确认两个小问题"前缀', () => {
        const result = stripDuplicateFollowupText(
            '我想再确认两个小问题：你的问题',
            '你的问题'
        );
        expect(result).toBe('');
    });

    it('长度差异超过 30% 的行不去除', () => {
        const result = stripDuplicateFollowupText(
            '这是一段很长很长很长很长很长的独立内容，与问题完全不同，不应该被去除',
            '短问题'
        );
        expect(result).toContain('这是一段很长');
    });
});
