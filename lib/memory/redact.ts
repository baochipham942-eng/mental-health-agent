/**
 * PII脱敏工具
 * 在存储记忆前对敏感信息进行脱敏处理
 */

// 常见PII模式匹配
const PII_PATTERNS: Array<{ pattern: RegExp; replacement: string; name: string }> = [
    // 手机号（中国）
    { pattern: /1[3-9]\d{9}/g, replacement: '[手机号已脱敏]', name: 'phone' },

    // 身份证号
    { pattern: /\d{17}[\dXx]/g, replacement: '[身份证已脱敏]', name: 'id_card' },

    // 邮箱
    { pattern: /[\w.-]+@[\w.-]+\.\w+/gi, replacement: '[邮箱已脱敏]', name: 'email' },

    // 银行卡号（16-19位数字）
    { pattern: /\d{16,19}/g, replacement: '[卡号已脱敏]', name: 'bank_card' },

    // QQ号（5-11位数字，但要避免误匹配）
    { pattern: /QQ[：:]\s*\d{5,11}/gi, replacement: 'QQ: [已脱敏]', name: 'qq' },

    // 微信号
    { pattern: /微信[号：:]\s*[\w-]+/gi, replacement: '微信号: [已脱敏]', name: 'wechat' },

    // IP地址
    { pattern: /\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/g, replacement: '[IP已脱敏]', name: 'ip' },
];

/**
 * 对文本进行PII脱敏
 * @param content 原始内容
 * @returns 脱敏后的内容
 */
export function redactPII(content: string): string {
    let result = content;

    for (const { pattern, replacement } of PII_PATTERNS) {
        result = result.replace(pattern, replacement);
    }

    return result;
}

/**
 * 检查文本是否包含PII
 * @param content 要检查的内容
 * @returns 是否包含PII及匹配到的类型
 */
export function containsPII(content: string): { hasPII: boolean; types: string[] } {
    const types: string[] = [];

    for (const { pattern, name } of PII_PATTERNS) {
        // 重置正则的lastIndex
        pattern.lastIndex = 0;
        if (pattern.test(content)) {
            types.push(name);
        }
    }

    return {
        hasPII: types.length > 0,
        types,
    };
}
