/**
 * 输入护栏
 * 
 * 检测并拦截潜在的安全威胁：
 * - Prompt 注入攻击
 * - 过长消息
 * - 可疑模式
 */
import { logWarn } from '@/lib/observability/logger';

export interface InputGuardResult {
    safe: boolean;
    reason?:
    | 'prompt_injection'
    | 'message_too_long'
    | 'suspicious_pattern';
    sanitizedInput?: string;
}

// ============================================================
// Prompt 注入模式（高风险，直接拦截）
// ============================================================
const INJECTION_PATTERNS = [
    // 英文模式
    /ignore\s+(previous|above|all)\s+(instructions?|prompts?)/i,
    /you\s+are\s+now\s+[a-z]+/i,
    /disregard\s+(previous|your)\s+(instructions?|programming)/i,
    /system\s*:\s*/i,
    /```(system|assistant)/i,
    /\[\[.*SYSTEM.*\]\]/i,
    /pretend\s+you\s+are/i,
    /act\s+as\s+if\s+you/i,
    /new\s+instructions?:/i,

    // 中文模式
    /不管前面说什么/,
    /忽略.*指令/,
    /忽略.*提示/,
    /假装你是/,
    /扮演.*角色/,
    /你现在是/,
    /从现在开始你是/,
    /忘记.*设定/,
    /重置.*对话/,
];

// ============================================================
// 可疑模式（记录但不拦截）
// ============================================================
const SUSPICIOUS_PATTERNS = [
    // 试图提取系统提示
    /tell me your (prompt|instructions)/i,
    /what is your (system|initial) (prompt|message)/i,
    /print your (system|initial)/i,
    /show me your (prompt|instructions)/i,
    /你的系统提示/,
    /你的设定是什么/,
    /告诉我你的指令/,
];

/**
 * 检测输入是否安全
 */
export function guardInput(userMessage: string): InputGuardResult {
    // 1. 长度检查（5000字符 ≈ 2500汉字）
    if (userMessage.length > 5000) {
        logWarn('input-guard-blocked', {
            reason: 'too_long',
            length: userMessage.length
        });
        return { safe: false, reason: 'message_too_long' };
    }

    // 2. Prompt 注入检测
    for (const pattern of INJECTION_PATTERNS) {
        if (pattern.test(userMessage)) {
            logWarn('input-guard-blocked', {
                reason: 'prompt_injection',
                pattern: pattern.source.substring(0, 50)
            });
            return { safe: false, reason: 'prompt_injection' };
        }
    }

    // 3. 可疑模式检测（只记录，不拦截）
    for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.test(userMessage)) {
            logWarn('input-guard-suspicious', {
                pattern: pattern.source.substring(0, 50)
            });
            // 不拦截，继续处理
        }
    }

    return { safe: true, sanitizedInput: userMessage };
}

/**
 * 获取拦截时的安全响应
 */
export function getBlockedResponse(reason: InputGuardResult['reason']): string {
    switch (reason) {
        case 'prompt_injection':
            return '我注意到你的消息包含一些特殊内容。让我们专注于你真正想讨论的话题吧。你现在感觉怎么样？';
        case 'message_too_long':
            return '你的消息有点长，让我们把话题聚焦一些。能简单告诉我你最想讨论什么吗？';
        default:
            return '让我们继续我们的对话吧。你现在感觉怎么样？';
    }
}
