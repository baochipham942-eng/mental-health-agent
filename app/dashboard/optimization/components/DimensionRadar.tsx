'use client';

/**
 * 维度雷达图组件
 * 纯 SVG 实现，显示 4 个评估维度的分数分布
 * 支持对比模式（两组分数叠加显示）
 */

interface DimensionRadarProps {
  scores: { legal: number; ethical: number; professional: number; ux: number }; // 0-10
  size?: number; // SVG 尺寸，默认 200
  className?: string;
  /** 对比模式：显示第二组分数 */
  compareScores?: { legal: number; ethical: number; professional: number; ux: number };
}

const LABELS = ['法律', '伦理', '专业', 'UX'] as const;
const KEYS = ['legal', 'ethical', 'professional', 'ux'] as const;
const MAX_SCORE = 10;

/** 3 层参考网格对应的分数 */
const GRID_LEVELS = [3.3, 6.6, 10];

export default function DimensionRadar({
  scores,
  size = 200,
  className = '',
  compareScores,
}: DimensionRadarProps) {
  const cx = size / 2;
  const cy = size / 2;
  const radius = size * 0.35; // 留出标签空间
  const labelOffset = radius + 20;

  // 4 个轴方向: 上(0,-1)、右(1,0)、下(0,1)、左(-1,0)
  const directions: [number, number][] = [
    [0, -1], // 上 → legal
    [1, 0],  // 右 → ethical
    [0, 1],  // 下 → professional
    [-1, 0], // 左 → ux
  ];

  /** 将分数（0-10）映射到 SVG 坐标 */
  function scoreToPoint(score: number, dirIndex: number): [number, number] {
    const ratio = Math.min(score, MAX_SCORE) / MAX_SCORE;
    const [dx, dy] = directions[dirIndex];
    return [cx + dx * radius * ratio, cy + dy * radius * ratio];
  }

  /** 生成多边形路径 */
  function buildPolygon(s: typeof scores): string {
    return KEYS.map((key, i) => scoreToPoint(s[key], i).join(',')).join(' ');
  }

  /** 参考网格多边形 */
  function gridPolygon(level: number): string {
    const ratio = level / MAX_SCORE;
    return directions
      .map(([dx, dy]) => `${cx + dx * radius * ratio},${cy + dy * radius * ratio}`)
      .join(' ');
  }

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
    >
      {/* 参考网格 */}
      {GRID_LEVELS.map((level) => (
        <polygon
          key={level}
          points={gridPolygon(level)}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={1}
        />
      ))}

      {/* 4 条轴线 */}
      {directions.map(([dx, dy], i) => (
        <line
          key={i}
          x1={cx}
          y1={cy}
          x2={cx + dx * radius}
          y2={cy + dy * radius}
          stroke="#d1d5db"
          strokeWidth={1}
        />
      ))}

      {/* 对比分数区域（橙色） */}
      {compareScores && (
        <polygon
          points={buildPolygon(compareScores)}
          fill="rgba(251, 146, 60, 0.15)"
          stroke="rgb(251, 146, 60)"
          strokeWidth={1.5}
        />
      )}

      {/* 主分数区域（蓝色） */}
      <polygon
        points={buildPolygon(scores)}
        fill="rgba(59, 130, 246, 0.2)"
        stroke="rgb(59, 130, 246)"
        strokeWidth={2}
      />

      {/* 主分数顶点圆点 + 分数值 */}
      {KEYS.map((key, i) => {
        const [px, py] = scoreToPoint(scores[key], i);
        return (
          <g key={key}>
            <circle cx={px} cy={py} r={3} fill="rgb(59, 130, 246)" />
            <text
              x={px + (directions[i][0] === 0 ? 0 : directions[i][0] * 10)}
              y={py + (directions[i][1] === 0 ? 0 : directions[i][1] * 10)}
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fontWeight="bold"
              fill="rgb(59, 130, 246)"
            >
              {scores[key].toFixed(1)}
            </text>
          </g>
        );
      })}

      {/* 对比分数顶点圆点 */}
      {compareScores &&
        KEYS.map((key, i) => {
          const [px, py] = scoreToPoint(compareScores[key], i);
          return (
            <circle key={`cmp-${key}`} cx={px} cy={py} r={2.5} fill="rgb(251, 146, 60)" />
          );
        })}

      {/* 轴标签 */}
      {LABELS.map((label, i) => {
        const [dx, dy] = directions[i];
        const lx = cx + dx * labelOffset;
        const ly = cy + dy * labelOffset;
        return (
          <text
            key={label}
            x={lx}
            y={ly}
            textAnchor="middle"
            dominantBaseline="middle"
            fontSize={11}
            fill="#6b7280"
          >
            {label}
          </text>
        );
      })}
    </svg>
  );
}
