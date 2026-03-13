'use client';

import { useRef, useState, useEffect } from 'react';

/**
 * 情绪趋势折线图 — 纯 SVG，响应式宽度
 *
 * 情绪分 0-10，分越高 = 越负面
 * Y 轴翻转：上方 = 心情好（分低），下方 = 心情差（分高）
 */

interface DataPoint {
  date: string;
  value: number;
}

interface EmotionTrendChartProps {
  data: DataPoint[];
  height?: number;
}

// 按天聚合：同一天多条记录取均值
function aggregateByDay(data: DataPoint[]): DataPoint[] {
  const map = new Map<string, number[]>();
  for (const d of data) {
    const day = d.date.slice(0, 10); // YYYY-MM-DD
    if (!map.has(day)) map.set(day, []);
    map.get(day)!.push(d.value);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, values]) => ({
      date,
      value: Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10,
    }));
}

function getColor(value: number): string {
  if (value <= 3) return '#34d399';
  if (value <= 6) return '#fbbf24';
  return '#f87171';
}

// Catmull-Rom → cubic bezier 平滑
function smoothPath(points: [number, number][]): string {
  if (points.length < 2) return '';
  if (points.length === 2) {
    return `M ${points[0][0]},${points[0][1]} L ${points[1][0]},${points[1][1]}`;
  }

  let d = `M ${points[0][0]},${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const cp1x = p1[0] + (p2[0] - p0[0]) / 6;
    const cp1y = p1[1] + (p2[1] - p0[1]) / 6;
    const cp2x = p2[0] - (p3[0] - p1[0]) / 6;
    const cp2y = p2[1] - (p3[1] - p1[1]) / 6;

    d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2[0]},${p2[1]}`;
  }
  return d;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

// 生成不重复的日期标签（最多 5 个，均匀分布）
function pickDateLabels(
  data: DataPoint[],
  points: [number, number][],
  maxLabels: number = 5,
): { x: number; label: string }[] {
  if (data.length <= 1) return [];

  const count = Math.min(maxLabels, data.length);
  const labels: { x: number; label: string }[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < count; i++) {
    const idx = i === count - 1
      ? data.length - 1
      : Math.round((i / (count - 1)) * (data.length - 1));
    const label = formatDate(data[idx].date);
    if (!seen.has(label)) {
      seen.add(label);
      labels.push({ x: points[idx][0], label });
    }
  }
  return labels;
}

export function EmotionTrendChart({
  data: rawData,
  height = 180,
}: EmotionTrendChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  // 响应式宽度
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
      }
    });
    observer.observe(el);
    setWidth(el.clientWidth);
    return () => observer.disconnect();
  }, []);

  const data = aggregateByDay(rawData);
  if (data.length === 0 || width === 0) {
    return <div ref={containerRef} className="w-full" style={{ height }} />;
  }

  const padLeft = 28;
  const padRight = 12;
  const padTop = 20;
  const padBottom = 28;
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;

  // 映射坐标
  const points: [number, number][] = data.map((d, i) => [
    padLeft + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW),
    padTop + (d.value / 10) * chartH,
  ]);

  const pathD = smoothPath(points);

  // 渐变填充
  const areaD = pathD
    + ` L ${points[points.length - 1][0]},${padTop + chartH}`
    + ` L ${points[0][0]},${padTop + chartH} Z`;

  const dateLabels = pickDateLabels(data, points);
  const avgValue = data.reduce((s, d) => s + d.value, 0) / data.length;
  const mainColor = getColor(avgValue);

  // 唯一 gradient ID（防止多实例冲突）
  const gradId = `areaGrad-${height}`;

  return (
    <div ref={containerRef} className="w-full">
      <svg width={width} height={height} className="block">
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mainColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={mainColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Y 轴标签 */}
        <text x={4} y={padTop + 4} fontSize="11" fill="#d1d5db">好</text>
        <text x={4} y={padTop + chartH} fontSize="11" fill="#d1d5db">差</text>

        {/* 参考线 */}
        {[0.3, 0.7].map((ratio) => (
          <line
            key={ratio}
            x1={padLeft} y1={padTop + chartH * ratio}
            x2={padLeft + chartW} y2={padTop + chartH * ratio}
            stroke="#f3f4f6" strokeWidth="1" strokeDasharray="4 3"
          />
        ))}

        {/* 渐变填充 */}
        <path d={areaD} fill={`url(#${gradId})`} />

        {/* 折线 */}
        <path
          d={pathD}
          fill="none"
          stroke={mainColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* 数据点 */}
        {points.map(([x, y], i) => {
          const isLast = i === points.length - 1;
          return (
            <g key={i}>
              {isLast && (
                <circle cx={x} cy={y} r={8} fill={getColor(data[i].value)} opacity={0.15} />
              )}
              <circle
                cx={x} cy={y}
                r={isLast ? 4 : 2.5}
                fill={getColor(data[i].value)}
                stroke="white" strokeWidth="1.5"
              />
            </g>
          );
        })}

        {/* 日期标签 */}
        {dateLabels.map(({ x, label }, i) => (
          <text
            key={i}
            x={Math.max(padLeft, Math.min(x, width - padRight))}
            y={height - 6}
            fontSize="11" fill="#a3a3a3"
            textAnchor={i === 0 ? 'start' : i === dateLabels.length - 1 ? 'end' : 'middle'}
          >
            {label}
          </text>
        ))}
      </svg>
    </div>
  );
}
