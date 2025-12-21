// ... imports
import { useState, useEffect, useRef } from 'react';
import { ActionCard } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';
import { BreathingExercise } from './widgets/BreathingExercise';
import { MeditationExercise } from './widgets/MeditationExercise';
import { MoodTracker } from './widgets/MoodTracker';
import { InlineMoodRating } from './widgets/InlineMoodRating';
import { logExercise } from '@/lib/actions/exercise';
import { motion, AnimatePresence } from 'framer-motion';

interface ActionCardItemProps {
  card: ActionCard;
  index: number;
  messageId: string;
  sessionId: string;
}

const effortLabels: Record<'low' | 'medium' | 'high', { label: string; color: string }> = {
  low: { label: '低', color: 'bg-green-100 text-green-800' },
  medium: { label: '中', color: 'bg-yellow-100 text-yellow-800' },
  high: { label: '高', color: 'bg-orange-100 text-orange-800' },
};

function getCardId(card: ActionCard, sessionId: string, messageId: string): string {
  // Scope by Session AND Message to ensure unique state per instance
  return `card-${sessionId}-${messageId}-${card.title.replace(/\s+/g, '-').toLowerCase()}`;
}

export function ActionCardItem({ card, index, messageId, sessionId }: ActionCardItemProps) {
  const cardId = getCardId(card, sessionId, messageId);
  const { getSkillProgress, updateSkillProgress } = useChatStore();

  const progress = getSkillProgress(cardId);
  // 使用 isExpanded 代替 isDetailView，实现手风琴效果
  const [isExpanded, setIsExpanded] = useState(false);
  const [showRating, setShowRating] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);
  const [headerControl, setHeaderControl] = useState<React.ReactNode>(null);

  const effort = effortLabels[card.effort] || effortLabels.medium;
  const stepsCount = card.steps?.length || 0;
  const completedSteps = progress?.completedSteps || [];
  const status = progress?.status || 'not_started';
  const isInProgress = status === 'in_progress';
  const isCompleted = status === 'done';

  // 估算时间
  const estimatedMinutes = Math.max(1, Math.ceil(stepsCount * 0.5));

  // 引用卡片元素以便滚动
  const cardRef = useRef<HTMLDivElement>(null);

  // 展开时自动滚动视口
  useEffect(() => {
    if (isExpanded && cardRef.current) {
      setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [isExpanded]);

  // 开始/继续/再次练习
  const handleMainAction = () => {
    if (!isExpanded) {
      setIsExpanded(true);
      setShowRating(false); // 重置评分状态

      // 如果是"再次练习"，重置进度
      if (isCompleted) {
        updateSkillProgress(cardId, { status: 'not_started', completedSteps: [] });
      }

      // 修复：点击展开时，不再自动设为"进行中"。
      // 只有在 Widget 中点击"开始"时才更新状态。
    } else {
      // 如果已经展开，点击按钮可以收起（可选）
      // setIsExpanded(false);
    }
  };

  // Widget 开始回调 (手动触发开始状态)
  const handleWidgetStart = () => {
    if (!startTime) {
      setStartTime(Date.now());
    }
    if (!isInProgress) {
      updateSkillProgress(cardId, { status: 'in_progress', completedSteps: [] });
    }
  };

  // 呼吸练习等 Widget 完成回调
  const handleWidgetComplete = (duration: number) => {
    // 自动标记为完成
    if (!isCompleted) {
      updateSkillProgress(cardId, {
        status: 'done',
        completedSteps: Array.from({ length: stepsCount }, (_, i) => i),
      });
    }
    // 显示评分界面（原地替换 Widget）
    setShowRating(true);
    // 清除 header control
    setHeaderControl(null);
  };

  // 提交评分
  const handleRatingSubmit = async (score: number) => {
    // 保存本地（可选）
    localStorage.setItem(`skill-posttest-${cardId}`, score.toString());

    // 记录日志
    const duration = startTime ? Math.round((Date.now() - startTime) / 1000) : 60;
    try {
      await logExercise({
        cardId: card.title,
        title: card.title,
        durationSeconds: duration,
        preMoodScore: 5, // 默认值，因为去掉了前测
        postMoodScore: score,
        feedback: '' // 移除文本反馈
      });
    } catch (e) {
      console.error("Logging failed", e);
    }

    // 收起卡片
    setTimeout(() => {
      setIsExpanded(false);
      setShowRating(false);
      setStartTime(null);
    }, 500); // 稍微延迟一点让用户看到点击效果
  };

  // 普通步骤的完成逻辑 (简化的 Toggle)
  const handleStepToggle = (stepIndex: number) => {
    const newCompletedSteps = completedSteps.includes(stepIndex)
      ? completedSteps.filter((i: number) => i !== stepIndex)
      : [...completedSteps, stepIndex];

    const allStepsCompleted = newCompletedSteps.length === stepsCount;

    updateSkillProgress(cardId, {
      status: allStepsCompleted ? 'done' : 'in_progress',
      completedSteps: newCompletedSteps,
    });
  };

  // 普通步骤的"完成练习"（如果没有 Widget）
  const handleManualComplete = () => {
    handleWidgetComplete(0);
  }

  return (
    <div ref={cardRef} className={`bg-white rounded-xl border transition-all duration-300 w-full overflow-hidden flex flex-col group ${isExpanded ? 'border-blue-200 shadow-md ring-1 ring-blue-50' : 'border-gray-100 shadow-sm hover:shadow-md'}`}>

      {/* 1. 常驻 Summary 区域 (始终显示) */}
      <div className="flex flex-col md:flex-row relative">
        {/* 左侧信息 */}
        <div className="p-4 flex-1 flex flex-col justify-center min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full ${effort.color} bg-opacity-50`}>
              {effort.label}强度
            </span>
            <h4 className="text-base font-bold text-gray-800 line-clamp-1 group-hover:text-blue-600 transition-colors">
              {card.title}
            </h4>
            <AnimatePresence>
              {isCompleted && !isExpanded && (
                <motion.span
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-green-500 text-xs font-medium flex items-center gap-1"
                >
                  ✅
                </motion.span>
              )}
            </AnimatePresence>
          </div>

          <p className="text-sm text-gray-500 line-clamp-1 mb-3">{card.when}</p>

          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
              👣 {stepsCount}个步骤
            </span>
            <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
              ⏱️ 约{estimatedMinutes}分钟
            </span>
          </div>
        </div>

        {/* 右侧动作按钮 (Header Controls) */}
        <div className="p-4 bg-gray-50 md:bg-white md:border-l border-gray-100 flex flex-row md:flex-col justify-center items-center gap-3 md:w-32 flex-shrink-0 transition-colors">
          {/* 
            Header Logic:
            1. If expanded AND headerControl is present: Show headerControl (e.g. "Start/Finish" buttons injected by widget)
            2. If expanded AND no headerControl: Show nothing (clean look) or "Processing" if using simple steps
            3. If collapsed: Show standard "Start" / "Continue" / "Again" button
          */}

          {isExpanded && headerControl ? (
            headerControl
          ) : isExpanded ? (
            // Expanded but no widget controls (e.g. simple steps or rating view)
            // Clean or minimal status
            showRating ? (
              <span className="text-xs font-bold text-gray-400">评分中</span>
            ) : (
              <button
                onClick={() => setIsExpanded(false)}
                className="text-xs text-blue-500 hover:underline"
              >
                收起
              </button>
            )
          ) : (
            // Collapsed state
            isCompleted ? (
              <button
                onClick={handleMainAction}
                className="w-full md:w-auto px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-full text-sm font-medium hover:bg-gray-50 hover:text-blue-600 transition-all shadow-sm"
              >
                再次练习
              </button>
            ) : (
              <button
                onClick={handleMainAction}
                className={`w-full md:w-auto px-4 py-2 rounded-full text-sm font-bold shadow-sm transition-all transform hover:scale-105 active:scale-95 ${isInProgress
                  ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                  : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md'
                  }`}
              >
                {isInProgress ? '继续' : '开始练习'}
              </button>
            )
          )}
        </div>
      </div>

      {/* 2. 展开区域 (Accordion Content) */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="border-t border-gray-100 bg-slate-50"
          >
            <div className="p-5">
              {/* 这里的布局根据内容动态调整 */}

              {showRating ? (
                <InlineMoodRating onRate={handleRatingSubmit} />
              ) : (
                <>
                  {/* 如果有 specific component (Widget) */}
                  {card.widget === 'breathing' ? (
                    <BreathingExercise
                      onComplete={handleWidgetComplete}
                      setHeaderControl={setHeaderControl}
                      onStart={handleWidgetStart}
                    />
                  ) : card.widget === 'meditation' ? (
                    <MeditationExercise
                      onComplete={handleWidgetComplete}
                      setHeaderControl={setHeaderControl}
                      onStart={handleWidgetStart}
                    />
                  ) : card.widget === 'mood_tracker' ? (
                    <MoodTracker />
                  ) : (
                    /* Default Steps List */
                    <div className="space-y-4">
                      <h5 className="font-medium text-gray-700 px-1">步骤指导</h5>
                      <div className="space-y-3">
                        {card.steps?.map((step, idx) => (
                          <div
                            key={idx}
                            className={`flex gap-3 p-3 rounded-lg border transition-all cursor-pointer ${completedSteps.includes(idx)
                              ? 'bg-blue-50 border-blue-100 opacity-60'
                              : 'bg-white border-gray-200 hover:border-blue-300'
                              }`}
                            onClick={() => handleStepToggle(idx)}
                          >
                            <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${completedSteps.includes(idx)
                              ? 'bg-blue-500 text-white'
                              : 'bg-gray-100 text-gray-500'
                              }`}>
                              {idx + 1}
                            </div>
                            <div className="text-sm text-gray-700 leading-relaxed">
                              {step}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={handleManualComplete}
                          className="px-5 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm"
                        >
                          完成打卡
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
