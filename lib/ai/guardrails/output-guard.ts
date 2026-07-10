/**
 * 输出护栏
 * 
 * 检测并处理 Agent 输出中的安全问题：
 * - 有害内容（绝对禁止）
 * - 系统信息泄露
 * - PII 检测与编校
 */
import { logWarn, logError } from '@/lib/observability/logger';
import { redactPII } from '@/lib/memory/redact';

export interface OutputGuardResult {
    safe: boolean;
    issues: Array<'pii_detected' | 'harmful_content' | 'system_leak'>;
    redactedResponse: string;
}

// ============================================================
// 有害内容关键词（绝对禁止输出）
// ============================================================
const HARMFUL_KEYWORDS = [
    // 自杀/自残方法
    '自杀方法',
    '具体剂量',
    '怎么死',
    '割腕方法',
    '上吊方法',
    '服毒方法',
    '跳楼方法',
    '烧炭方法',
    '安眠药剂量',

    // 暴力相关
    '如何伤害',
    '如何杀',
];

// ============================================================
// 系统信息泄露模式
// ============================================================
// \s 必须有上界：无界 \s* 会让模式长度超过流式护栏的尾部缓冲（TAIL_BUFFER_SIZE），
// 且几十个空白隔开的两个词也不构成真实泄露
const SYSTEM_LEAK_PATTERNS = [
    /system\s{0,20}prompt/i,
    /initial\s{0,20}instructions?/i,
    /我的系统提示/,
    /我的角色设定/,
    /我被设定为/,
    /我的初始指令/,
];

// 危机热线信息（用于替换有害内容）
const CRISIS_HOTLINE_MESSAGE =
    '我理解你正在经历困难的时刻。如果你正处于危机中，请拨打心理援助热线：\n' +
    '• 全国心理援助热线：400-161-9995\n' +
    '• 北京心理危机研究与干预中心：010-82951332\n' +
    '• 生命热线：400-821-1215\n\n' +
    '这里有专业的人愿意倾听和帮助你。';

/**
 * 检测并处理输出安全问题
 */
export function guardOutput(agentResponse: string): OutputGuardResult {
    const issues: OutputGuardResult['issues'] = [];
    let response = agentResponse;

    // 1. 有害内容检测（直接替换为安全响应）
    for (const keyword of HARMFUL_KEYWORDS) {
        if (response.includes(keyword)) {
            logError('output-guard-harmful', { keyword });
            return {
                safe: false,
                issues: ['harmful_content'],
                redactedResponse: CRISIS_HOTLINE_MESSAGE,
            };
        }
    }

    // 2. 系统信息泄露检测
    for (const pattern of SYSTEM_LEAK_PATTERNS) {
        // 全局替换：同一模式出现多次时逐一遮蔽（裸 pattern.replace 只替换首个）
        const globalPattern = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
        const replaced = response.replace(globalPattern, '[内容已隐藏]');
        if (replaced !== response) {
            issues.push('system_leak');
            logWarn('output-guard-leak', { pattern: pattern.source });
            response = replaced;
        }
    }

    // 3. PII 检测与编校（复用现有模块）
    const redactedResponse = redactPII(response);
    if (redactedResponse !== response) {
        issues.push('pii_detected');
        logWarn('output-guard-pii', {
            originalLength: response.length,
            redactedLength: redactedResponse.length
        });
        response = redactedResponse;
    }

    return {
        safe: issues.length === 0,
        issues,
        redactedResponse: response,
    };
}
