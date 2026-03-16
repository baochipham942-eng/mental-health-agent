'use client';

import { useState, useRef, useCallback } from 'react';
import { MOOD_THEMES, applyMoodColor } from '@/lib/mood-theme';

/** 来访目的卡片 */
const MOOD_CARDS = [
  {
    key: 'rain',
    label: '心情不太好',
    hint: '情绪低落，想有人陪一会儿',
    empathy: '愿意说出来，<br/>本身就是一种勇气。<br/>我在这里。',
    note: '被看见是治愈的开始',
    cssClass: 'ob-card-rain',
  },
  {
    key: 'ocean',
    label: '压力有点大',
    hint: '工作生活的压力，想找人说说',
    empathy: '扛着这些走到这里，<br/>你已经很了不起了。<br/>先放下一会儿吧。',
    note: '说出来，就轻了一半',
    cssClass: 'ob-card-ocean',
  },
  {
    key: 'autumn',
    label: '想理清思路',
    hint: '有些纠结，想整理一下自己的想法',
    empathy: '答案不急着找，<br/>慢慢聊着聊着，<br/>它会自己浮现。',
    note: '想清楚本身就是进步',
    cssClass: 'ob-card-autumn',
  },
  {
    key: 'spring',
    label: '随便聊聊',
    hint: '没什么大事，就想找人说说话',
    empathy: '不需要理由，<br/>想聊就聊。<br/>这里没有门槛。',
    note: '日常的倾诉也很重要',
    cssClass: 'ob-card-spring',
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
        <h1 className="ob-title">今天来这里，是因为？</h1>
        <p className="ob-subtitle">选一个最接近你现在状态的</p>

        <div className="ob-image-grid">
          {MOOD_CARDS.map((mood, index) => (
            <div
              key={mood.key}
              ref={(el) => { cardRefs.current[index] = el; }}
              className={`ob-image-card ${mood.cssClass}`}
              role="button"
              tabIndex={0}
              aria-label={`${mood.label} - ${mood.hint}`}
              onClick={() => handleCardSelect(mood, index)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardSelect(mood, index); } }}
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
