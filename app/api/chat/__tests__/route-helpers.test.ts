/**
 * 集成测试 — route-helpers 核心路由逻辑
 *
 * 测试 decideRouteByRules 和 buildFallbackQuickAnalysis
 * 这些是 chat API 的决策中枢，决定请求走哪条处理链路
 */

import { describe, it, expect } from 'vitest';
import { decideRouteByRules, buildFallbackQuickAnalysis } from '../route-helpers';
import { countUserTurns, shouldSummarize, shouldSummarizeOnSessionEnd } from '@/lib/memory/summarizer';

// ====== decideRouteByRules ======

describe('decideRouteByRules — 路由优先级', () => {
    it('有进行中的练习 → support（最高优先级）', () => {
        const result = decideRouteByRules({
            message: '想死',
            state: 'in_crisis',
            activeExercise: { exerciseType: 'breathing' },
        });
        expect(result.routeType).toBe('support');
        expect(result.reason).toBe('active_exercise');
    });

    it('in_crisis 状态 → crisis', () => {
        const result = decideRouteByRules({
            message: '我好痛苦',
            state: 'in_crisis',
        });
        expect(result.routeType).toBe('crisis');
        expect(result.reason).toBe('crisis_state');
    });

    it('crisisCheckResult=true → crisis', () => {
        const result = decideRouteByRules({
            message: '不想活了',
            crisisCheckResult: true,
        });
        expect(result.routeType).toBe('crisis');
        expect(result.reason).toBe('crisis_few_shot');
    });

    it('assessmentStage=conclusion → assessment', () => {
        const result = decideRouteByRules({
            message: '我的评估结果',
            assessmentStage: 'conclusion',
        });
        expect(result.routeType).toBe('assessment');
        expect(result.reason).toBe('assessment_conclusion');
    });

    it('questionnaireType 存在 → assessment', () => {
        const result = decideRouteByRules({
            message: '测一下情绪',
            questionnaireType: 'phq9',
        });
        expect(result.routeType).toBe('assessment');
        expect(result.reason).toBe('questionnaire');
    });

    it('awaiting_followup 状态 → assessment', () => {
        const result = decideRouteByRules({
            message: '回答补充问题',
            state: 'awaiting_followup',
        });
        expect(result.routeType).toBe('assessment');
        expect(result.reason).toBe('assessment_followup');
    });

    it('explicitAssessmentRequest → assessment', () => {
        const result = decideRouteByRules({
            message: '了解一下自己',
            explicitAssessmentRequest: true,
        });
        expect(result.routeType).toBe('assessment');
        expect(result.reason).toBe('explicit_assessment_request');
    });

    it('默认 → support', () => {
        const result = decideRouteByRules({
            message: '今天心情不好',
        });
        expect(result.routeType).toBe('support');
        expect(result.reason).toBe('main_model_default');
    });
});

describe('decideRouteByRules — 优先级覆盖', () => {
    it('crisis 状态 + assessment conclusion → crisis 优先', () => {
        const result = decideRouteByRules({
            message: '想死',
            state: 'in_crisis',
            assessmentStage: 'conclusion',
        });
        expect(result.routeType).toBe('crisis');
    });

    it('active_exercise 覆盖 crisis', () => {
        // 练习进行中时，即使检测到危机关键词也走 support
        // 这是设计选择：先完成练习再处理
        const result = decideRouteByRules({
            message: '不想做了',
            state: 'in_crisis',
            activeExercise: { exerciseType: 'grounding' },
        });
        expect(result.routeType).toBe('support');
    });

    it('crisisCheckResult 优先于 assessment', () => {
        const result = decideRouteByRules({
            message: '想死',
            assessmentStage: 'conclusion',
            crisisCheckResult: true,
            // 注意：crisis_state 在 crisisCheckResult 之前判断
            // 但这里没有 state: 'in_crisis'，所以走 crisisCheckResult
        });
        // crisisCheckResult 在 assessmentStage 之前检查
        expect(result.routeType).toBe('crisis');
    });
});

// ====== buildFallbackQuickAnalysis ======

describe('buildFallbackQuickAnalysis', () => {
    it('非危机 → 默认安全兜底', () => {
        const result = buildFallbackQuickAnalysis({ crisisCheckResult: false });
        expect(result.safety).toBe('normal');
        expect(result.route).toBe('support');
        expect(result.adaptiveMode).toBe('companion');
        expect(result.emotion.label).toBe('未表达');
        expect(result.emotion.score).toBe(0);
    });

    it('危机 → 危机兜底', () => {
        const result = buildFallbackQuickAnalysis({ crisisCheckResult: true });
        expect(result.safety).toBe('crisis');
        expect(result.route).toBe('crisis');
        expect(result.adaptiveMode).toBe('guardian');
        expect(result.emotion.score).toBe(9);
    });

    it('兜底分析包含所有必需字段', () => {
        const result = buildFallbackQuickAnalysis({ crisisCheckResult: false });
        expect(result).toHaveProperty('safety');
        expect(result).toHaveProperty('safetyReasoning');
        expect(result).toHaveProperty('stateReasoning');
        expect(result).toHaveProperty('emotion');
        expect(result).toHaveProperty('route');
        expect(result).toHaveProperty('needsValidation');
        expect(result).toHaveProperty('adaptiveMode');
        expect(result).toHaveProperty('personaReasoning');
        expect(result).toHaveProperty('memoryCheck');
        expect(result).toHaveProperty('dialogueIntent');
    });
});

// ====== summary threshold helpers ======

describe('summary threshold helpers', () => {
    it('按有效用户消息计用户回合', () => {
        const messages = [
            { role: 'assistant', content: '你好' },
            { role: 'user', content: '最近压力很大' },
            { role: 'assistant', content: '我在听' },
            { role: 'user', content: ' ' },
            { role: 'user', content: '晚上睡不着' },
        ];

        expect(countUserTurns(messages)).toBe(2);
    });

    it('长聊滚动摘要保留 20 个用户回合门槛，每 8 回合刷新', () => {
        expect(shouldSummarize(19)).toBe(false);
        expect(shouldSummarize(20)).toBe(true);
        expect(shouldSummarize(27)).toBe(false);
        expect(shouldSummarize(28)).toBe(true);
    });

    it('结束会话时至少 2 个用户回合才生成轻量摘要', () => {
        expect(shouldSummarizeOnSessionEnd([
            { role: 'user', content: '你好' },
            { role: 'assistant', content: '你好，想聊什么？' },
        ])).toBe(false);

        expect(shouldSummarizeOnSessionEnd([
            { role: 'user', content: '最近压力很大' },
            { role: 'assistant', content: '我在听' },
            { role: 'user', content: '主要是项目一直延期' },
        ])).toBe(true);
    });
});
