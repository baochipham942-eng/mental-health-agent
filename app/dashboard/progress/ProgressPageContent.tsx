'use client';

import React, { useState, useEffect } from 'react';
import { Spin, Empty } from '@arco-design/web-react';
import type { ProgressTimeline } from '@/lib/ai/progress/tracker';
import { EmotionTrendChart } from '@/components/progress/EmotionTrendChart';

// 根据趋势生成鼓励语
function getEncouragement(timeline: ProgressTimeline): { text: string; sub: string } {
  const { trend, emotions, milestones, exerciseCount } = timeline;

  if (emotions.length === 0) {
    return { text: '每一次对话，都是了解自己的开始', sub: '开始聊天后，你的情绪轨迹会慢慢呈现' };
  }
  if (trend === 'improving') {
    return { text: '你最近的状态在好转', sub: '持续的改变来自每一次小小的努力' };
  }
  if (trend === 'worsening') {
    return { text: '最近似乎有些不容易', sub: '愿意来这里本身，就是一种勇气' };
  }
  if (exerciseCount >= 5) {
    return { text: '你已经坚持练习了好几次', sub: '每一次呼吸都在帮助你找回平静' };
  }
  if (milestones.length > 0) {
    return { text: '你正在一步步成长', sub: '回头看看，你已经走了很远' };
  }
  return { text: '情绪像天气，有晴有雨都正常', sub: '重要的是，你愿意关注自己的感受' };
}

// 根据趋势返回主题色
function getTheme(trend: 'improving' | 'stable' | 'worsening') {
  if (trend === 'improving') return {
    bg: 'from-emerald-50 via-teal-50/50 to-gray-50',
    accent: 'text-emerald-600',
    badge: 'bg-emerald-100 text-emerald-700',
    badgeLabel: '好转中',
  };
  if (trend === 'worsening') return {
    bg: 'from-amber-50 via-orange-50/30 to-gray-50',
    accent: 'text-amber-600',
    badge: 'bg-amber-100 text-amber-700',
    badgeLabel: '需要关注',
  };
  return {
    bg: 'from-indigo-50 via-purple-50/30 to-gray-50',
    accent: 'text-indigo-600',
    badge: 'bg-indigo-100 text-indigo-700',
    badgeLabel: '平稳',
  };
}

// 严重程度配置
const SEVERITY: Record<string, { label: string; color: string; bg: string }> = {
  minimal:            { label: '良好',   color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  mild:               { label: '轻度',   color: 'text-sky-700',     bg: 'bg-sky-50 border-sky-200' },
  moderate:           { label: '中度',   color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  moderately_severe:  { label: '中重度', color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200' },
  severe:             { label: '需关注', color: 'text-rose-700',    bg: 'bg-rose-50 border-rose-200' },
};

export function ProgressPageContent() {
  const [timeline, setTimeline] = useState<ProgressTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/progress?days=${days}`)
      .then(res => res.json())
      .then(data => {
        // API 返回错误时 data 没有 emotions 字段，需要防御
        if (data && Array.isArray(data.emotions)) {
          setTimeline(data);
        } else {
          setTimeline(null);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spin size={32} tip="加载中..." />
      </div>
    );
  }

  if (!timeline) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Empty description="暂无数据" />
      </div>
    );
  }

  const theme = getTheme(timeline.trend);
  const encouragement = getEncouragement(timeline);

  return (
    <div className={`min-h-full bg-gradient-to-b ${theme.bg}`}>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-5">

        {/* ==================== 顶部：鼓励语 + 时间切换 ==================== */}
        <div className="text-center pt-2 pb-1">
          <h1 className={`text-xl font-bold ${theme.accent} mb-1`}>{encouragement.text}</h1>
          <p className="text-sm text-gray-400">{encouragement.sub}</p>
        </div>

        <div className="flex justify-center">
          <div className="flex bg-white/60 backdrop-blur-sm rounded-full p-1 shadow-sm border border-gray-100/80">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                  days === d
                    ? 'bg-white text-gray-700 shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {d === 7 ? '近一周' : d === 30 ? '近一月' : '近三月'}
              </button>
            ))}
          </div>
        </div>

        {/* ==================== 情绪曲线卡片 ==================== */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100/80 p-5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-600">情绪轨迹</span>
            <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${theme.badge}`}>
              {theme.badgeLabel}
            </span>
          </div>

          {timeline.emotions.length >= 2 ? (
            <EmotionTrendChart data={timeline.emotions} height={200} />
          ) : timeline.emotions.length === 1 ? (
            <div className="h-[120px] flex flex-col items-center justify-center text-gray-400">
              <span className="text-3xl mb-2">
                {timeline.emotions[0].value <= 3 ? '😊' : timeline.emotions[0].value <= 6 ? '😐' : '😔'}
              </span>
              <p className="text-sm">第一次记录：情绪强度 {timeline.emotions[0].value}/10</p>
              <p className="text-xs mt-1">再聊几次，趋势就清晰了</p>
            </div>
          ) : (
            <div className="h-[120px] flex flex-col items-center justify-center text-gray-400">
              <span className="text-3xl mb-2">🌱</span>
              <p className="text-sm">开始第一次对话，你的情绪轨迹就会出现</p>
            </div>
          )}
        </div>

        {/* ==================== 成长足迹（统计 + 里程碑） ==================== */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100/80 p-5">
          <span className="text-sm font-medium text-gray-600">成长足迹</span>

          {/* 统计数字 */}
          <div className="grid grid-cols-3 gap-3 mt-3">
            <MiniStat icon="💬" value={timeline.sessionCount} label="次对话" />
            <MiniStat icon="🧘" value={timeline.exerciseCount} label="次练习" />
            <MiniStat icon="🔭" value={timeline.labSessionCount} label="次探索" />
          </div>

          {/* 里程碑 */}
          {timeline.milestones.length > 0 && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <div className="space-y-2">
                {timeline.milestones.slice(0, 4).map((m, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-sm">
                    <span className="w-6 h-6 rounded-full bg-amber-50 flex items-center justify-center text-xs shrink-0">✦</span>
                    <span className="text-gray-600">{m}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ==================== 自我了解（PHQ-9 / GAD-7） ==================== */}
        <QuestionnaireSection phq9={timeline.phq9Scores} gad7={timeline.gad7Scores} />

        {/* ==================== 探索足迹 ==================== */}
        {timeline.labExplorations.length > 0 && (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100/80 p-5">
            <span className="text-sm font-medium text-gray-600">探索足迹</span>
            <div className="mt-3 space-y-2.5">
              {timeline.labExplorations.map((e, i) => {
                const emoji: Record<string, string> = { wisdom: '🏛️', mirrors: '🪞', custom: '🎭', group: '🎯' };
                return (
                  <div key={i} className="flex items-center gap-3 px-3 py-2.5 bg-purple-50/60 rounded-xl">
                    <span className="text-lg">{emoji[e.labType] || '🔬'}</span>
                    <span className="text-sm text-gray-700 flex-1 truncate">{e.title}</span>
                    <span className="text-xs text-gray-400">{e.date.slice(5)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 底部留白 */}
        <div className="h-6" />
      </div>
    </div>
  );
}

// ==================== 子组件 ====================

function MiniStat({ icon, value, label }: { icon: string; value: number; label: string }) {
  return (
    <div className="flex items-center gap-2.5 px-3 py-2.5 bg-gray-50/80 rounded-xl">
      <span className="text-lg">{icon}</span>
      <div>
        <span className="text-lg font-bold text-gray-800">{value}</span>
        <span className="text-xs text-gray-400 ml-1">{label}</span>
      </div>
    </div>
  );
}

function QuestionnaireSection({ phq9, gad7 }: {
  phq9: { date: string; score: number; severity: string }[];
  gad7: { date: string; score: number; severity: string }[];
}) {
  if (phq9.length === 0 && gad7.length === 0) {
    return (
      <div className="bg-white rounded-2xl shadow-sm border border-gray-100/80 p-5 text-center">
        <span className="text-sm font-medium text-gray-600 block mb-3">深度了解自己</span>
        <div className="py-4">
          <span className="text-3xl">🪞</span>
          <p className="text-sm text-gray-400 mt-2">在聊天中说「想了解一下自己」</p>
          <p className="text-xs text-gray-300 mt-1">通过几个简单的问题，帮你更清晰地认识当前状态</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100/80 p-5 space-y-4">
      <span className="text-sm font-medium text-gray-600">深度了解</span>

      {phq9.length > 0 && (
        <ScoreTimeline title="情绪健康度" maxScore={27} records={phq9} gradientFrom="from-indigo-400" gradientTo="to-violet-400" />
      )}

      {gad7.length > 0 && (
        <ScoreTimeline title="压力指数" maxScore={21} records={gad7} gradientFrom="from-teal-400" gradientTo="to-cyan-400" />
      )}
    </div>
  );
}

function ScoreTimeline({ title, maxScore, records, gradientFrom, gradientTo }: {
  title: string;
  maxScore: number;
  records: { date: string; score: number; severity: string }[];
  gradientFrom: string;
  gradientTo: string;
}) {
  const latest = records[records.length - 1];
  const prev = records.length >= 2 ? records[records.length - 2] : null;
  const delta = prev ? latest.score - prev.score : 0;
  const sev = SEVERITY[latest.severity] || SEVERITY.minimal;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">{title}</span>
        <span className={`text-xs px-2 py-0.5 rounded-full border ${sev.bg} ${sev.color}`}>
          {sev.label}
        </span>
      </div>

      {/* 最新分数 */}
      <div className="flex items-end gap-3 mb-3">
        <span className="text-3xl font-bold text-gray-800">{latest.score}</span>
        <span className="text-xs text-gray-400 mb-1">/ {maxScore}</span>
        {prev && (
          <span className={`text-xs mb-1 font-medium ${
            delta < 0 ? 'text-emerald-500' : delta > 0 ? 'text-rose-500' : 'text-gray-400'
          }`}>
            {delta < 0 ? `↓ ${Math.abs(delta)}` : delta > 0 ? `↑ ${delta}` : '持平'}
          </span>
        )}
      </div>

      {/* 进度条 */}
      <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${gradientFrom} ${gradientTo} transition-all duration-700`}
          style={{ width: `${Math.max(4, (latest.score / maxScore) * 100)}%` }}
        />
      </div>

      {/* 历史记录（紧凑） */}
      {records.length >= 2 && (
        <div className="flex items-center gap-1 mt-2 overflow-x-auto">
          {records.map((r, i) => (
            <div key={i} className="flex flex-col items-center shrink-0" title={`${r.date}: ${r.score}分`}>
              <div
                className={`w-2 h-2 rounded-full bg-gradient-to-r ${gradientFrom} ${gradientTo}`}
                style={{ opacity: 0.3 + (i / records.length) * 0.7 }}
              />
              <span className="text-[9px] text-gray-300 mt-0.5">{r.date.slice(5)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
