'use client';

import { useState, useRef, useEffect } from 'react';
import { MoodTheme } from '@/lib/mood-theme';

interface BreathingOrbProps {
  theme: MoodTheme;
}

export function BreathingOrb({ theme }: BreathingOrbProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  const orbRef = useRef<HTMLDivElement>(null);

  // 点击外部关闭 tooltip
  useEffect(() => {
    if (!showTooltip) return;
    const handleClick = (e: MouseEvent) => {
      if (orbRef.current && !orbRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [showTooltip]);

  return (
    <div ref={orbRef} className="relative">
      <div
        className="breathing-orb"
        onClick={() => setShowTooltip(!showTooltip)}
      >
        <div className="breathing-orb-inner" />
        <div className="breathing-orb-highlight" />
        <div className="breathing-orb-ring" />
      </div>

      {/* 状态提示 tooltip */}
      <div className={`orb-tooltip ${showTooltip ? 'show' : ''}`}>
        <div className="text-[11px] text-gray-400 mb-1">当前状态</div>
        <div className="text-[13px] text-gray-700 font-medium">{theme.label}</div>
        <div className="orb-energy-bar">
          <div
            className="orb-energy-fill"
            style={{ width: `${theme.energy}%` }}
          />
        </div>
      </div>
    </div>
  );
}
