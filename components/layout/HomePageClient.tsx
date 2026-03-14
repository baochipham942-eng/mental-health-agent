'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { OnboardingFlow } from '@/components/onboarding/OnboardingFlow';
import { SessionListPage } from '@/components/layout/SessionListPage';
import { applyMoodColor, MOOD_THEMES } from '@/lib/mood-theme';

interface Session {
  id: string;
  title: string | null;
  status: string;
  createdAt: string;
  relativeDate: string;
}

interface HomePageClientProps {
  sessions: Session[];
  hideSessionAction: (id: string) => Promise<void>;
  userName: string;
  nickname?: string | null;
  avatar?: string | null;
  isAdmin?: boolean;
}

export function HomePageClient(props: HomePageClientProps) {
  const router = useRouter();
  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null);

  useEffect(() => {
    // 检查是否完成过 onboarding
    const completed = localStorage.getItem('onboardingCompleted') === 'true';
    setShowOnboarding(!completed);

    // 恢复之前选择的情绪主题
    if (completed) {
      const savedMood = localStorage.getItem('onboardingMood');
      if (savedMood && MOOD_THEMES[savedMood]) {
        applyMoodColor(MOOD_THEMES[savedMood].color);
      }
    }
  }, []);

  // 等待客户端判断
  if (showOnboarding === null) {
    return <div className="h-full" />;
  }

  if (showOnboarding) {
    return (
      <OnboardingFlow
        onComplete={(moodKey) => {
          setShowOnboarding(false);
          // 应用选择的情绪主题
          if (MOOD_THEMES[moodKey]) {
            applyMoodColor(MOOD_THEMES[moodKey].color);
          }
          // 直接进入新对话
          router.push('/');
        }}
      />
    );
  }

  return <SessionListPage {...props} />;
}
