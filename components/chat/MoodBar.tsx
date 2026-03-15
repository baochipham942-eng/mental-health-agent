'use client';

import { useState, useEffect } from 'react';

interface MoodBarProps {
  pulse?: boolean;
}

export function MoodBar({ pulse = false }: MoodBarProps) {
  const [isPulsing, setIsPulsing] = useState(false);

  useEffect(() => {
    if (pulse) {
      setIsPulsing(true);
      const timer = setTimeout(() => setIsPulsing(false), 800);
      return () => clearTimeout(timer);
    }
  }, [pulse]);

  return <div className={`mood-bar ${isPulsing ? 'pulse' : ''}`} />;
}
