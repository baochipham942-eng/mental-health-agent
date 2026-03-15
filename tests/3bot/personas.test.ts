import { describe, it, expect } from 'vitest';
import {
    validatePersona,
    getEmotionTrajectory,
    getRulesForPhase,
    getPersonasByRisk,
    getPersonasByCoping,
    ALL_PERSONAS,
    PERSONA_XIAOLI,
    PERSONA_XIAOZHANG,
    PERSONA_LAOWANG,
    PERSONA_XIAOCHEN,
    PERSONA_XIAOZHOU,
    type PatientPersona,
} from './personas';

// ====== Persona 完整性校验 ======

describe('validatePersona', () => {
    it('所有内置 persona 均通过校验', () => {
        for (const persona of ALL_PERSONAS) {
            const { valid, errors } = validatePersona(persona);
            expect(valid, `${persona.name} 校验失败: ${errors.join('; ')}`).toBe(true);
        }
    });

    it('缺少 id → 校验失败', () => {
        const bad = { ...PERSONA_XIAOLI, id: '' };
        const { valid, errors } = validatePersona(bad);
        expect(valid).toBe(false);
        expect(errors).toContain('缺少 id 或 name');
    });

    it('对话脚本少于 2 轮 → 校验失败', () => {
        const bad = {
            ...PERSONA_XIAOLI,
            conversationScript: [PERSONA_XIAOLI.conversationScript[0]],
        };
        const { valid } = validatePersona(bad);
        expect(valid).toBe(false);
    });

    it('turnIndex 不连续 → 校验失败', () => {
        const bad: PatientPersona = {
            ...PERSONA_XIAOLI,
            conversationScript: [
                { ...PERSONA_XIAOLI.conversationScript[0], turnIndex: 0 },
                { ...PERSONA_XIAOLI.conversationScript[1], turnIndex: 2 }, // 跳过 1
            ],
        };
        const { valid, errors } = validatePersona(bad);
        expect(valid).toBe(false);
        expect(errors.some(e => e.includes('turnIndex 不连续'))).toBe(true);
    });

    it('情绪强度超范围 → 校验失败', () => {
        const bad: PatientPersona = {
            ...PERSONA_XIAOLI,
            conversationScript: [
                { ...PERSONA_XIAOLI.conversationScript[0], emotionState: { label: '焦虑', intensity: 11 } },
                PERSONA_XIAOLI.conversationScript[1],
            ],
        };
        const { valid } = validatePersona(bad);
        expect(valid).toBe(false);
    });

    it('无预期行为 → 校验失败', () => {
        const bad = { ...PERSONA_XIAOLI, expectedBehaviors: [] };
        const { valid } = validatePersona(bad);
        expect(valid).toBe(false);
    });

    it('高风险无 escalate 意图 → 校验失败', () => {
        const bad: PatientPersona = {
            ...PERSONA_LAOWANG,
            conversationScript: PERSONA_LAOWANG.conversationScript.map(t => ({
                ...t,
                intent: 'vent' as const,
            })),
        };
        const { valid, errors } = validatePersona(bad);
        expect(valid).toBe(false);
        expect(errors.some(e => e.includes('escalate'))).toBe(true);
    });
});

// ====== 工具函数 ======

describe('getEmotionTrajectory', () => {
    it('小李: 焦虑 → 焦虑 → 脆弱 → 自卑', () => {
        const { labels, intensities } = getEmotionTrajectory(PERSONA_XIAOLI);
        expect(labels).toEqual(['焦虑', '焦虑', '脆弱', '自卑']);
        expect(intensities).toEqual([6, 5, 7, 7]);
    });

    it('老王: 抑郁 → 疲惫 → 绝望（升级）', () => {
        const { labels, intensities } = getEmotionTrajectory(PERSONA_LAOWANG);
        expect(labels).toEqual(['抑郁', '疲惫', '绝望']);
        expect(intensities[2]).toBeGreaterThan(intensities[0]); // 情绪恶化
    });

    it('小陈: 正向情绪保持高位', () => {
        const { intensities } = getEmotionTrajectory(PERSONA_XIAOCHEN);
        expect(intensities.every(i => i >= 8)).toBe(true);
    });
});

describe('getRulesForPhase', () => {
    it('early 阶段包含 early 和 any 规则', () => {
        const rules = getRulesForPhase(PERSONA_XIAOLI, 'early');
        expect(rules.length).toBeGreaterThan(0);
        expect(rules.every(r => r.phase === 'early' || r.phase === 'any')).toBe(true);
    });

    it('late 阶段包含 late 和 any 规则', () => {
        const rules = getRulesForPhase(PERSONA_XIAOLI, 'late');
        expect(rules.length).toBeGreaterThan(0);
        expect(rules.some(r => r.phase === 'late')).toBe(true);
    });
});

// ====== Persona 注册表 ======

describe('Persona 注册表', () => {
    it('共 5 个 persona', () => {
        expect(ALL_PERSONAS).toHaveLength(5);
    });

    it('每个 persona id 唯一', () => {
        const ids = ALL_PERSONAS.map(p => p.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('按风险筛选: high = 老王', () => {
        const high = getPersonasByRisk('high');
        expect(high).toHaveLength(1);
        expect(high[0].name).toBe('老王');
    });

    it('按风险筛选: none = 小张、小陈', () => {
        const none = getPersonasByRisk('none');
        expect(none).toHaveLength(2);
        expect(none.map(p => p.name).sort()).toEqual(['小张', '小陈']);
    });

    it('按 coping style 筛选: ruminating = 老王、小周', () => {
        const ruminating = getPersonasByCoping('ruminating');
        expect(ruminating).toHaveLength(2);
    });

    it('按 coping style 筛选: people-pleasing = 小张', () => {
        const pp = getPersonasByCoping('people-pleasing');
        expect(pp).toHaveLength(1);
        expect(pp[0].name).toBe('小张');
    });
});

// ====== Persona 心理画像完整性 ======

describe('Persona 画像内容', () => {
    it('小李 — 冒充者综合征 + 回避型', () => {
        expect(PERSONA_XIAOLI.psychProfile.primaryIssue).toContain('冒充者');
        expect(PERSONA_XIAOLI.psychProfile.attachmentStyle).toBe('avoidant');
        expect(PERSONA_XIAOLI.psychProfile.copingStyle).toBe('intellectualizing');
    });

    it('小张 — 讨好型 + 焦虑依恋', () => {
        expect(PERSONA_XIAOZHANG.psychProfile.copingStyle).toBe('people-pleasing');
        expect(PERSONA_XIAOZHANG.psychProfile.attachmentStyle).toBe('anxious');
    });

    it('老王 — 高风险 + 自伤意念', () => {
        expect(PERSONA_LAOWANG.psychProfile.riskLevel).toBe('high');
        expect(PERSONA_LAOWANG.conversationScript.some(t => t.intent === 'escalate')).toBe(true);
    });

    it('小陈 — 无风险 + 正向分享', () => {
        expect(PERSONA_XIAOCHEN.psychProfile.riskLevel).toBe('none');
        expect(PERSONA_XIAOCHEN.psychProfile.primaryIssue).toContain('无');
    });

    it('小周 — 亲密关系 + 焦虑依恋', () => {
        expect(PERSONA_XIAOZHOU.psychProfile.primaryIssue).toContain('亲密关系');
        expect(PERSONA_XIAOZHOU.psychProfile.attachmentStyle).toBe('anxious');
    });

    it('所有 persona 的 expectedBehaviors 包含 must 级别', () => {
        for (const persona of ALL_PERSONAS) {
            const hasMust = persona.expectedBehaviors.some(b => b.level === 'must');
            expect(hasMust, `${persona.name} 缺少 must 级别行为`).toBe(true);
        }
    });
});
