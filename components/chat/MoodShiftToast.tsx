'use client';

import { useEffect, useState } from 'react';

interface MoodShiftToastProps {
  text: string | null;  // null = 隐藏
}

export function MoodShiftToast({ text }: MoodShiftToastProps) {
  const [visible, setVisible] = useState(false);
  const [displayText, setDisplayText] = useState('');

  useEffect(() => {
    if (text) {
      setDisplayText(text);
      setVisible(true);
      const timer = setTimeout(() => setVisible(false), 3000);
      return () => clearTimeout(timer);
    }
  }, [text]);

  return (
    <div className={`mood-shift-toast ${visible ? 'show' : ''}`}>
      <div className="mood-shift-dot" />
      <span>{displayText}</span>
    </div>
  );
}
