/**
 * Arco Design 主题配置
 * 定义符合"心理疗愈"品牌的色彩变量
 */

// 主色调 - Indigo 柔和、专业、疗愈感
export const PRIMARY_COLOR = '#4f46e5';

// 功能色
export const COLORS = {
    primary: '#4f46e5',      // Indigo-600 - 主色
    primaryHover: '#4338ca', // Indigo-700 - 悬停色
    primaryLight: '#e0e7ff', // Indigo-100 - 浅色背景

    success: '#10b981',      // Green-500 - 成功/成长
    warning: '#f59e0b',      // Amber-500 - 警告
    danger: '#ef4444',       // Red-500 - 危险

    // 记忆分类颜色
    memory: {
        emotional: '#a855f7',  // Purple - 情绪模式
        coping: '#22c55e',     // Green - 偏好策略
        personal: '#3b82f6',   // Blue - 个人背景
        progress: '#f59e0b',   // Amber - 疗愈进展
        trigger: '#ef4444',    // Red - 敏感话题
    },

    // 中性色
    gray: {
        50: '#f8fafc',
        100: '#f1f5f9',
        200: '#e2e8f0',
        300: '#cbd5e1',
        400: '#94a3b8',
        500: '#64748b',
        600: '#475569',
        700: '#334155',
        800: '#1e293b',
        900: '#0f172a',
    }
};

// Arco Design 主题 token 覆盖
export const arcoThemeConfig = {
    // 品牌色
    'arcoblue-6': PRIMARY_COLOR,

    // 字体
    'font-family': `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue', sans-serif`,

    // 圆角
    'border-radius-small': '6px',
    'border-radius-medium': '8px',
    'border-radius-large': '12px',

    // 阴影
    'shadow-card': '0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1)',
};

// CSS 变量配置（用于自定义样式）
export const cssVariables = `
  :root {
    --primary-color: ${COLORS.primary};
    --primary-hover: ${COLORS.primaryHover};
    --primary-light: ${COLORS.primaryLight};
    --success-color: ${COLORS.success};
    --warning-color: ${COLORS.warning};
    --danger-color: ${COLORS.danger};
  }
`;
