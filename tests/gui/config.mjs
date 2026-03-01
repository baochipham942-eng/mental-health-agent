/**
 * GUI 测试配置
 *
 * 使用 UI-TARS SDK + 豆包视觉模型进行 GUI 自动化测试
 * 模型: doubao-seed-1-6-vision-250815（唯一兼容 UI-TARS 坐标格式的模型）
 */

// 火山引擎 API 配置
export const VOLCENGINE_API_KEY = process.env.VOLCENGINE_API_KEY || 'f5c52332-99e3-4e5b-9235-e6b61da87f12';
export const BASE_URL = 'https://ark.cn-beijing.volces.com/api/v3';
export const MODEL = 'doubao-seed-1-6-vision-250815';

// 心理疗愈 Agent 应用 URL
export const APP_URL = process.env.APP_URL || 'http://localhost:3000';

// GUI Agent 默认参数
export const GUI_DEFAULTS = {
    maxLoopCount: 30,
    loopIntervalInMs: 1500,
    timeoutMs: 180_000, // 3 分钟超时
};

/**
 * 创建标准 GUIAgent 模型配置
 */
export function getModelConfig() {
    return {
        baseURL: BASE_URL,
        apiKey: VOLCENGINE_API_KEY,
        model: MODEL,
        temperature: 0,
    };
}
