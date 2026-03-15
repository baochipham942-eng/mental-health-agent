'use client';

import { MoodTheme } from '@/lib/mood-theme';

/** 根据情绪主题给出线下引导建议 */
function getOfflineSuggestion(theme?: MoodTheme): string | null {
  if (!theme) return null;
  const suggestions: Record<string, string> = {
    ocean: '试试出门散个步，或者泡杯热茶放松一下。',
    rain: '今天辛苦了。睡前可以听听喜欢的音乐。',
    autumn: '放下手机，去做一件让自己开心的小事吧。',
    spring: '带着这份好心情，去和身边的人聊聊天吧。',
  };
  return suggestions[theme.key] || null;
}

interface LeaveDialogProps {
  visible: boolean;
  onStay: () => void;
  onLeave: () => void;
  moodTheme?: MoodTheme;
}

export function LeaveDialog({ visible, onStay, onLeave, moodTheme }: LeaveDialogProps) {
  if (!visible) return null;

  const suggestion = getOfflineSuggestion(moodTheme);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-250"
      style={{
        background: 'rgba(0,0,0,0.25)',
        backdropFilter: 'blur(4px)',
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? 'auto' : 'none',
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onStay();
      }}
    >
      <div
        className="bg-white rounded-[20px] px-7 pt-8 pb-6 max-w-[340px] w-[90%] text-center shadow-2xl"
        style={{
          transform: visible ? 'scale(1) translateY(0)' : 'scale(0.92) translateY(10px)',
          transition: 'transform 0.3s cubic-bezier(0.34,1.56,0.64,1)',
        }}
      >
        <div className="leave-dialog-orb" />
        <h3 className="text-[17px] font-semibold text-gray-800 mb-2">
          要离开这次对话吗？
        </h3>
        <p className="text-[13.5px] text-gray-400 leading-[1.7] mb-2">
          每一段倾诉都是了不起的勇气。<br />
          随时可以回来继续。
        </p>
        {suggestion && (
          <p className="text-[12.5px] text-gray-400/80 leading-[1.6] mb-4 italic">
            {suggestion}
          </p>
        )}
        {!suggestion && <div className="mb-4" />}
        <div className="flex gap-2.5">
          <button
            onClick={onStay}
            className="flex-1 py-[11px] rounded-xl border-none text-sm font-medium cursor-pointer text-white transition-all duration-200 hover:-translate-y-px"
            style={{
              background: 'linear-gradient(135deg, rgba(var(--mood-color),0.85), rgba(var(--mood-color),0.65))',
              boxShadow: '0 2px 12px rgba(var(--mood-color),0.25)',
            }}
          >
            再聊会儿
          </button>
          <button
            onClick={onLeave}
            className="flex-1 py-[11px] rounded-xl text-sm font-medium cursor-pointer text-gray-500 bg-gray-50 border border-gray-200 transition-all duration-200 hover:bg-gray-100"
          >
            下次再来
          </button>
        </div>
      </div>
    </div>
  );
}
