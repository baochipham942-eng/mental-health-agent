'use client';

/**
 * 趋势标签 — 用去医疗化文案展示情绪趋势
 */

interface TrendBadgeProps {
  trend: 'improving' | 'stable' | 'worsening';
}

const TREND_CONFIG = {
  improving: {
    label: '近期在好转',
    color: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    icon: '↗',
  },
  stable: {
    label: '情绪平稳',
    color: 'bg-blue-50 text-blue-600 border-blue-200',
    icon: '→',
  },
  worsening: {
    label: '关注一下自己',
    color: 'bg-amber-50 text-amber-600 border-amber-200',
    icon: '↘',
  },
};

export function TrendBadge({ trend }: TrendBadgeProps) {
  const config = TREND_CONFIG[trend];
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border ${config.color}`}>
      <span>{config.icon}</span>
      {config.label}
    </span>
  );
}
