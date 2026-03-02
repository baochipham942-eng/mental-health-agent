'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, Spin, Empty, Tag } from '@arco-design/web-react';
import type { ProgressTimeline } from '@/lib/ai/progress/tracker';

const TabPane = Tabs.TabPane;

export function ProgressPageContent() {
  const [timeline, setTimeline] = useState<ProgressTimeline | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/progress?days=${days}`)
      .then(res => res.json())
      .then(data => {
        setTimeline(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [days]);

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spin size={32} tip="加载进度数据..." />
      </div>
    );
  }

  if (!timeline) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Empty description="暂无进度数据" />
      </div>
    );
  }

  const trendLabel = { improving: '改善中', stable: '稳定', worsening: '需关注' };
  const trendColor = { improving: 'green', stable: 'blue', worsening: 'orange' } as const;

  return (
    <div className="max-w-4xl mx-auto px-4 py-6 w-full">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold text-gray-800">我的状态</h1>
        <div className="flex gap-2">
          {[30, 90].map(d => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                days === d ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {d} 天
            </button>
          ))}
        </div>
      </div>

      {/* 概览卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
        <StatCard label="对话次数" value={timeline.sessionCount} unit="次" />
        <StatCard label="练习次数" value={timeline.exerciseCount} unit="次" />
        <StatCard label="探索次数" value={timeline.labSessionCount} unit="次" />
        <StatCard
          label="整体趋势"
          value={trendLabel[timeline.trend]}
          color={trendColor[timeline.trend]}
        />
        <StatCard label="里程碑" value={timeline.milestones.length} unit="个" />
      </div>

      <Tabs defaultActiveTab="emotion" className="bg-white rounded-xl shadow-sm p-4">
        <TabPane key="emotion" title="情绪趋势">
          <EmotionChart data={timeline.emotions} />
        </TabPane>
        <TabPane key="questionnaire" title="自我了解">
          <QuestionnaireChart phq9={timeline.phq9Scores} gad7={timeline.gad7Scores} />
        </TabPane>
        <TabPane key="explorations" title="探索足迹">
          <ExplorationList explorations={timeline.labExplorations} />
        </TabPane>
        <TabPane key="milestones" title="里程碑">
          <MilestoneList milestones={timeline.milestones} />
        </TabPane>
      </Tabs>
    </div>
  );
}

function StatCard({ label, value, unit, color }: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
}) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ? `text-${color}-600` : 'text-gray-800'}`}>
        {value}
        {unit && <span className="text-sm font-normal text-gray-400 ml-1">{unit}</span>}
      </p>
    </div>
  );
}

function EmotionChart({ data }: { data: { date: string; value: number }[] }) {
  if (data.length === 0) {
    return <Empty description="暂无情绪数据" className="py-12" />;
  }

  // 简单 ASCII-style 可视化（不依赖 recharts，保持轻量）
  const maxVal = Math.max(...data.map(d => d.value), 10);

  return (
    <div className="space-y-4 py-4">
      <p className="text-sm text-gray-500">情绪强度变化（分数越低越好）</p>
      <div className="space-y-2">
        {data.map((d, i) => (
          <div key={i} className="flex items-center gap-3">
            <span className="text-xs text-gray-400 w-20 shrink-0">{d.date.slice(5)}</span>
            <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  d.value <= 3 ? 'bg-green-400' :
                  d.value <= 5 ? 'bg-blue-400' :
                  d.value <= 7 ? 'bg-yellow-400' :
                  'bg-red-400'
                }`}
                style={{ width: `${(d.value / maxVal) * 100}%` }}
              />
            </div>
            <span className="text-sm font-medium text-gray-600 w-8 text-right">{d.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QuestionnaireChart({ phq9, gad7 }: {
  phq9: { date: string; score: number; severity: string }[];
  gad7: { date: string; score: number; severity: string }[];
}) {
  if (phq9.length === 0 && gad7.length === 0) {
    return <Empty description="暂无数据，聊天时说「了解一下自己」即可开始" className="py-12" />;
  }

  const severityColor: Record<string, string> = {
    minimal: 'green',
    mild: 'blue',
    moderate: 'orange',
    moderately_severe: 'orangered',
    severe: 'red',
  };

  const severityLabel: Record<string, string> = {
    minimal: '正常',
    mild: '轻度',
    moderate: '中度',
    moderately_severe: '中重度',
    severe: '重度',
  };

  return (
    <div className="space-y-6 py-4">
      {phq9.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">情绪健康度</h3>
          <div className="space-y-2">
            {phq9.map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-20 shrink-0">{d.date.slice(5)}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-400 transition-all flex items-center justify-end pr-2"
                    style={{ width: `${(d.score / 27) * 100}%`, minWidth: '2rem' }}
                  >
                    <span className="text-xs text-white font-medium">{d.score}</span>
                  </div>
                </div>
                <Tag color={severityColor[d.severity]} size="small">
                  {severityLabel[d.severity] || d.severity}
                </Tag>
              </div>
            ))}
          </div>
        </div>
      )}

      {gad7.length > 0 && (
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-3">压力指数</h3>
          <div className="space-y-2">
            {gad7.map((d, i) => (
              <div key={i} className="flex items-center gap-3">
                <span className="text-xs text-gray-400 w-20 shrink-0">{d.date.slice(5)}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-6 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-teal-400 transition-all flex items-center justify-end pr-2"
                    style={{ width: `${(d.score / 21) * 100}%`, minWidth: '2rem' }}
                  >
                    <span className="text-xs text-white font-medium">{d.score}</span>
                  </div>
                </div>
                <Tag color={severityColor[d.severity]} size="small">
                  {severityLabel[d.severity] || d.severity}
                </Tag>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ExplorationList({ explorations }: { explorations: { date: string; labType: string; title: string }[] }) {
  if (explorations.length === 0) {
    return <Empty description="还没有探索记录，去实验室看看吧" className="py-12" />;
  }

  const labEmoji: Record<string, string> = { wisdom: '🏛️', mirrors: '🪞', custom: '🎭', group: '🎯' };
  const labLabel: Record<string, string> = { wisdom: '智慧殿堂', mirrors: '镜像回廊', custom: '自定义大师', group: '圆桌论道' };

  return (
    <div className="py-4">
      <div className="space-y-3">
        {explorations.map((e, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-purple-50 rounded-xl border border-purple-100">
            <span className="text-xl">{labEmoji[e.labType] || '🔬'}</span>
            <div className="flex-1 min-w-0">
              <span className="text-sm text-purple-800 block truncate">{e.title}</span>
              <span className="text-xs text-purple-400">{labLabel[e.labType] || e.labType}</span>
            </div>
            <span className="text-xs text-gray-400 shrink-0">{e.date.slice(5)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MilestoneList({ milestones }: { milestones: string[] }) {
  if (milestones.length === 0) {
    return <Empty description="继续加油，里程碑即将到来" className="py-12" />;
  }

  return (
    <div className="py-4">
      <div className="space-y-3">
        {milestones.map((m, i) => (
          <div key={i} className="flex items-center gap-3 p-3 bg-green-50 rounded-xl border border-green-100">
            <span className="text-xl">🏆</span>
            <span className="text-sm text-green-800">{m}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
