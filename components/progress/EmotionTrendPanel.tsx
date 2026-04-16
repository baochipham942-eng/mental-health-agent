'use client';

import { useState } from 'react';
import { useEmotionTrend } from '@/hooks/useEmotionTrend';
import { EmotionTrendChart } from './EmotionTrendChart';
import { TrendBadge } from './TrendBadge';

/**
 * 情绪趋势面板 — 聚合组件
 * 包含 7/30 天切换、图表、趋势标签、里程碑、空状态
 */
export function EmotionTrendPanel() {
  const [days, setDays] = useState<7 | 30>(7);
  const { data, isLoading, error } = useEmotionTrend(days);

  // 加载态
  if (isLoading) {
    return (
      <div className="rounded-2xl bg-white/80 backdrop-blur-xs border border-gray-100 p-5">
        <div className="animate-pulse space-y-3">
          <div className="h-4 w-24 bg-gray-200 rounded-sm" />
          <div className="h-[140px] bg-gray-100 rounded-xl" />
        </div>
      </div>
    );
  }

  // 错误态
  if (error) {
    return null; // 静默失败，不影响主体验
  }

  // 未登录
  if (!data) {
    return null;
  }

  const emotions = data.emotions;

  // 空状态
  if (emotions.length === 0) {
    return (
      <div className="rounded-2xl bg-linear-to-br from-purple-50 to-blue-50 border border-purple-100/50 p-5 text-center">
        <p className="text-sm text-gray-500 mb-1">还没有情绪记录</p>
        <p className="text-xs text-gray-400">开始第一次对话，你的情绪轨迹就会出现在这里</p>
      </div>
    );
  }

  // 数据不足
  if (emotions.length < 2) {
    return (
      <div className="rounded-2xl bg-linear-to-br from-purple-50 to-blue-50 border border-purple-100/50 p-5 text-center">
        <p className="text-sm text-gray-500 mb-1">
          已记录 {emotions.length} 次情绪
        </p>
        <p className="text-xs text-gray-400">再聊几次，趋势就清晰了</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-white/80 backdrop-blur-xs border border-gray-100 p-5 space-y-3">
      {/* 标题行 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-gray-700">情绪轨迹</h3>
          <TrendBadge trend={data.trend} />
        </div>

        {/* 7/30 天切换 */}
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {([7, 30] as const).map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-2.5 py-1 text-xs rounded-md transition-all ${
                days === d
                  ? 'bg-white text-gray-700 shadow-xs font-medium'
                  : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              {d}天
            </button>
          ))}
        </div>
      </div>

      {/* 图表 */}
      <EmotionTrendChart data={emotions} />

      {/* 统计摘要 */}
      <div className="flex items-center gap-4 text-xs text-gray-400">
        <span>{data.sessionCount} 次对话</span>
        {data.exerciseCount > 0 && <span>{data.exerciseCount} 次练习</span>}
        {data.labSessionCount > 0 && <span>{data.labSessionCount} 次探索</span>}
      </div>

      {/* 里程碑 */}
      {data.milestones.length > 0 && (
        <div className="pt-2 border-t border-gray-100">
          <p className="text-xs text-gray-400 mb-1.5">成长记录</p>
          <div className="flex flex-wrap gap-1.5">
            {data.milestones.slice(0, 3).map((m, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 bg-violet-50 text-violet-600 text-xs rounded-full">
                ✦ {m}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
