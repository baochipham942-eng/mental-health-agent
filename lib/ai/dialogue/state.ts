/**
 * 对话状态管理
 * 追踪对话阶段、SCEB 收集进度、累积风险
 */

import { RiskLevel, RiskSignalResult } from './risk-signals';

/**
 * 对话阶段
 */
export type DialoguePhase =
    | 'initial_contact'    // 初次接触 (1-2 轮)
    | 'rapport_building'   // 关系建立 (3-4 轮)
    | 'exploration'        // 深度探索 (5-7 轮)
    | 'safety_check'       // 安全确认 (风险触发时)
    | 'conclusion';        // 总结阶段

/**
 * SCEB 要素收集状态
 */
export interface SCEBStatus {
    situation: boolean;    // 情境
    cognition: boolean;    // 认知
    emotion: boolean;      // 情绪
    behavior: boolean;     // 行为
}

/**
 * 对话状态快照
 */
export interface DialogueState {
    turn: number;
    phase: DialoguePhase;
    sceb: SCEBStatus;
    riskHistory: RiskLevel[];
    highestRisk: RiskLevel;
    safetyCheckCompleted: boolean;
}

/**
 * 根据对话轮次推断当前阶段
 */
export function inferPhase(turn: number, riskTriggered: boolean): DialoguePhase {
    if (riskTriggered) {
        return 'safety_check';
    }
    if (turn <= 2) {
        return 'initial_contact';
    }
    if (turn <= 4) {
        return 'rapport_building';
    }
    if (turn <= 7) {
        return 'exploration';
    }
    return 'conclusion';
}

/**
 * 获取当前阶段允许的话题深度
 */
export function getAllowedTopics(phase: DialoguePhase): string[] {
    switch (phase) {
        case 'initial_contact':
            return ['situation', 'surface_emotion'];
        case 'rapport_building':
            return ['situation', 'emotion', 'light_cognition'];
        case 'exploration':
            return ['situation', 'cognition', 'emotion', 'behavior'];
        case 'safety_check':
            return ['safety', 'coping', 'support_system'];
        case 'conclusion':
            return ['summary', 'next_steps', 'resources'];
        default:
            return ['situation', 'emotion'];
    }
}

/**
 * 获取当前阶段禁止的行为
 */
export function getForbiddenActions(phase: DialoguePhase): string[] {
    switch (phase) {
        case 'initial_contact':
            return ['safety_assessment', 'deep_cognition_probe', 'behavior_analysis'];
        case 'rapport_building':
            return ['safety_assessment', 'conclusion'];
        case 'exploration':
            return ['premature_conclusion'];
        case 'safety_check':
            return ['topic_change', 'minimizing'];
        case 'conclusion':
            return ['new_topic_introduction'];
        default:
            return [];
    }
}

/**
 * 生成对话阶段上下文注入 Prompt
 */
export function generatePhaseContextPrompt(state: DialogueState): string {
    const phase = state.phase;
    const turn = state.turn;

    let contextPrompt = `\n**对话上下文**：
- 当前轮次：第 ${turn} 轮
- 对话阶段：${getPhaseLabel(phase)}
- 允许话题：${getAllowedTopics(phase).join('、')}
`;

    // 如果是早期阶段，明确禁止安全评估
    if (phase === 'initial_contact' || phase === 'rapport_building') {
        contextPrompt += `
**重要**：当前处于关系建立阶段，**严禁**询问自伤/自杀相关问题，除非用户主动提及。
`;
    }

    // 如果是探索阶段，提示可以深入
    if (phase === 'exploration') {
        contextPrompt += `
**提示**：对话已进入深度阶段，可以温和地探索认知和行为模式。
`;
    }

    // 如果是安全确认阶段
    if (phase === 'safety_check') {
        contextPrompt += `
**重要**：检测到风险信号，请以温和的方式进行安全评估，优先表达关心。
`;
    }

    return contextPrompt;
}

/**
 * 获取阶段的中文标签
 */
function getPhaseLabel(phase: DialoguePhase): string {
    const labels: Record<DialoguePhase, string> = {
        initial_contact: '初次接触',
        rapport_building: '关系建立',
        exploration: '深度探索',
        safety_check: '安全确认',
        conclusion: '总结阶段',
    };
    return labels[phase] || '未知';
}

/**
 * 计算对话轮次（从历史消息推断）
 */
export function calculateTurn(history: Array<{ role: string }>): number {
    return history.filter(m => m.role === 'user').length + 1;
}

/**
 * 创建初始对话状态
 */
export function createInitialState(): DialogueState {
    return {
        turn: 1,
        phase: 'initial_contact',
        sceb: {
            situation: false,
            cognition: false,
            emotion: false,
            behavior: false,
        },
        riskHistory: [],
        highestRisk: 'low',
        safetyCheckCompleted: false,
    };
}

/**
 * 更新对话状态
 */
export function updateState(
    currentState: DialogueState,
    riskResult: RiskSignalResult
): DialogueState {
    const newTurn = currentState.turn + 1;
    const newRiskHistory = [...currentState.riskHistory, riskResult.level];

    // 计算最高风险等级
    const riskOrder: RiskLevel[] = ['low', 'medium', 'high', 'crisis'];
    const highestRisk = riskOrder.reduce((highest, level) => {
        if (newRiskHistory.includes(level)) {
            return riskOrder.indexOf(level) > riskOrder.indexOf(highest) ? level : highest;
        }
        return highest;
    }, 'low' as RiskLevel);

    // 推断新阶段
    const newPhase = inferPhase(newTurn, riskResult.shouldTriggerSafetyAssessment);

    return {
        ...currentState,
        turn: newTurn,
        phase: newPhase,
        riskHistory: newRiskHistory,
        highestRisk,
    };
}
