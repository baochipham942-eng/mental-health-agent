'use client';

import { useState, useRef, useCallback } from 'react';
import { MOOD_THEMES, applyMoodColor } from '@/lib/mood-theme';

/** 情绪卡片配置 */
const MOOD_CARDS = [
  {
    key: 'rain',
    label: '雨天',
    hint: '有些沉重，想安静待一会儿',
    empathy: '有时候，<br/>天空也需要一场雨<br/>来洗去尘埃。',
    note: '每一滴雨都是释放',
    cssClass: 'ob-card-rain',
  },
  {
    key: 'spring',
    label: '春日',
    hint: '有些期待，也有些不安',
    empathy: '花会开的，<br/>在它该开的时候。<br/>不着急。',
    note: '期待本身就是一种力量',
    cssClass: 'ob-card-spring',
  },
  {
    key: 'ocean',
    label: '海浪',
    hint: '情绪像潮水，有些翻涌',
    empathy: '潮起潮落，<br/>是大海的呼吸。<br/>你的情绪也是。',
    note: '让情绪自然流动',
    cssClass: 'ob-card-ocean',
  },
  {
    key: 'autumn',
    label: '秋叶',
    hint: '想要放下一些什么',
    empathy: '落叶不是结束，<br/>是树在学会放手。',
    note: '放下也是一种勇气',
    cssClass: 'ob-card-autumn',
  },
];

interface OnboardingFlowProps {
  onComplete: (moodKey: string) => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<1 | 2>(1); // eslint-disable-line @typescript-eslint/no-unused-vars
  const [selectedMood, setSelectedMood] = useState<typeof MOOD_CARDS[0] | null>(null);
  const [showRevealCard, setShowRevealCard] = useState(false);
  const [showRevealText, setShowRevealText] = useState(false);
  const [showCta, setShowCta] = useState(false);
  const [step1Class, setStep1Class] = useState('active');
  const [step2Class, setStep2Class] = useState('hidden');
  const cardRefs = useRef<(HTMLDivElement | null)[]>([]);

  const handleCardSelect = useCallback((mood: typeof MOOD_CARDS[0], _index: number) => {
    setSelectedMood(mood);

    // 应用情绪主题色
    const theme = MOOD_THEMES[mood.key];
    if (theme) {
      applyMoodColor(theme.color);
    }

    // 步骤切换动画
    setStep1Class('fade-out');

    setTimeout(() => {
      setStep(2);
      setStep2Class('active');

      // 渐次显示
      setTimeout(() => setShowRevealCard(true), 200);
      setTimeout(() => setShowRevealText(true), 900);
      setTimeout(() => setShowCta(true), 1500);
    }, 500);
  }, []);

  const handleEnterChat = useCallback(() => {
    if (selectedMood) {
      // 保存 onboarding 状态到 localStorage
      localStorage.setItem('onboardingCompleted', 'true');
      localStorage.setItem('onboardingMood', selectedMood.key);
      onComplete(selectedMood.key);
    }
  }, [selectedMood, onComplete]);

  const handleSkip = useCallback(() => {
    localStorage.setItem('onboardingCompleted', 'true');
    onComplete('default');
  }, [onComplete]);

  return (
    <div className="relative w-full h-full">
      {/* Step 1: 图片选择 */}
      <div className={`onboarding-step ob-step1 ${step1Class}`}>
        <h1 className="ob-title">此刻，你像哪张图？</h1>
        <p className="ob-subtitle">选择最接近你现在感受的一张</p>

        <div className="ob-image-grid">
          {MOOD_CARDS.map((mood, index) => (
            <div
              key={mood.key}
              ref={(el) => { cardRefs.current[index] = el; }}
              className={`ob-image-card ${mood.cssClass}`}
              onClick={() => handleCardSelect(mood, index)}
            >
              <div className="ob-card-bg" />
              <div className="ob-card-overlay">
                <div className="ob-card-label">{mood.label}</div>
                <div className="ob-card-hint">{mood.hint}</div>
              </div>
            </div>
          ))}
        </div>

        <button className="ob-skip" onClick={handleSkip}>
          跳过，直接开始
        </button>
      </div>

      {/* Step 2: 情绪揭示 */}
      <div className={`onboarding-step ob-step2 ${step2Class}`}>
        {selectedMood && (
          <>
            <div className={`ob-reveal-card ${selectedMood.cssClass} ${showRevealCard ? 'show' : ''}`}>
              <div className="ob-card-bg" />
            </div>

            <div className={`ob-reveal-text ${showRevealText ? 'show' : ''}`}>
              <p
                className="ob-reveal-empathy"
                dangerouslySetInnerHTML={{ __html: selectedMood.empathy }}
              />
              <p className="ob-reveal-note">{selectedMood.note}</p>
            </div>

            <div className={`ob-cta ${showCta ? 'show' : ''}`}>
              <button className="ob-cta-button" onClick={handleEnterChat}>
                开始倾诉
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
