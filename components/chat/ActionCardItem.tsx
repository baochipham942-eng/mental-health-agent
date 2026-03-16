import { useState, useEffect, useRef, useCallback } from 'react';
import { ActionCard } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';
import { BreathingExercise } from './widgets/BreathingExercise';
import { MeditationExercise } from './widgets/MeditationExercise';
import { MoodTracker } from './widgets/MoodTracker';
import { BasicEmptyChair } from './widgets/BasicEmptyChair';
import { LeavesOnStream } from './widgets/LeavesOnStream';
import { InlineMoodRating } from './widgets/InlineMoodRating';
import { logExercise } from '@/lib/actions/exercise';
import { motion, AnimatePresence } from 'framer-motion';
import { useChatActions } from './ChatContext';

/** AI 引导型练习类型 */
const GUIDED_EXERCISES = ['grounding', 'reframing', 'activation'] as const;
type GuidedType = typeof GUIDED_EXERCISES[number];

function isGuidedExerciseType(widget?: string): widget is GuidedType {
  return !!widget && (GUIDED_EXERCISES as readonly string[]).includes(widget);
}

const GUIDED_LABELS: Record<GuidedType, string> = {
  grounding: '五感着陆',
  reframing: '认知重构',
  activation: '行为激活',
};

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

/** Widget 类型视觉标识 */
const WIDGET_VISUALS: Record<string, { emoji: string; borderColor: string; accentColor: string }> = {
  breathing:    { emoji: '🌬️', borderColor: 'border-l-blue-400',    accentColor: 'text-blue-500' },
  meditation:   { emoji: '🧘', borderColor: 'border-l-purple-400',  accentColor: 'text-purple-500' },
  empty_chair:  { emoji: '🪑', borderColor: 'border-l-amber-400',   accentColor: 'text-amber-500' },
  leaves_stream:{ emoji: '🎈', borderColor: 'border-l-sky-400', accentColor: 'text-sky-500' },
  mood_tracker: { emoji: '🌡️', borderColor: 'border-l-rose-400',    accentColor: 'text-rose-500' },
  grounding:    { emoji: '🦶', borderColor: 'border-l-teal-400',    accentColor: 'text-teal-500' },
  reframing:    { emoji: '🧠', borderColor: 'border-l-indigo-400',  accentColor: 'text-indigo-500' },
  activation:   { emoji: '⚡️', borderColor: 'border-l-orange-400',  accentColor: 'text-orange-500' },
};
const DEFAULT_VISUAL = { emoji: '✨', borderColor: 'border-l-gray-300', accentColor: 'text-gray-400' };

/** 步骤勾选 Checkmark SVG 动画 */
function AnimatedCheck({ checked }: { checked: boolean }) {
  return (
    <AnimatePresence mode="wait">
      {checked ? (
        <motion.svg
          key="check"
          viewBox="0 0 24 24"
          className="w-3.5 h-3.5 text-white"
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: [1.3, 1], opacity: 1 }}
          exit={{ scale: 0.5, opacity: 0 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        >
          <motion.path
            d="M5 13l4 4L19 7"
            fill="none"
            stroke="currentColor"
            strokeWidth={3}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            animate={{ pathLength: 1 }}
            transition={{ duration: 0.25, delay: 0.05 }}
          />
        </motion.svg>
      ) : null}
    </AnimatePresence>
  );
}

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

  const { sendMessage } = useChatActions();
  const effort = effortLabels[card.effort] || effortLabels.medium;
  const stepsCount = card.steps?.length || 0;
  const completedSteps = progress?.completedSteps || [];
  const status = progress?.status || 'not_started';
  const isInProgress = status === 'in_progress';
  const isCompleted = status === 'done';

  // 估算时间
  const estimatedMinutes = Math.max(1, Math.ceil(stepsCount * 0.5));

  // 是否为 AI 引导型练习
  const isGuided = card.guided || isGuidedExerciseType(card.widget);
  const guidedType = isGuided ? (card.widget as GuidedType) : null;

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

  // 启动 AI 引导练习（调用后端 API 创建状态 + 发消息触发引导）
  const startGuidedExercise = useCallback(async () => {
    if (!guidedType) return;
    const label = GUIDED_LABELS[guidedType] || card.title;
    try {
      await fetch('/api/exercise/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exerciseType: guidedType,
          totalSteps: card.totalSteps || 4,
        }),
      });
    } catch (e) {
      console.error('[GuidedExercise] Failed to create state:', e);
    }
    updateSkillProgress(cardId, { status: 'in_progress', completedSteps: [] });
    setStartTime(Date.now());
    sendMessage(`我想开始「${label}」练习`);
  }, [guidedType, card, cardId, sendMessage, updateSkillProgress]);

  // 开始/继续/再次练习
  const handleMainAction = () => {
    // 漏斗埋点：技能卡片被点击
    fetch('/api/progress/funnel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'l1_skill_clicked', sessionId, skillType: card.widget }),
    }).catch(() => {});

    if (isGuided) {
      if (isCompleted) {
        updateSkillProgress(cardId, { status: 'not_started', completedSteps: [] });
      }
      startGuidedExercise();
      return;
    }
    if (!isExpanded) {
      setIsExpanded(true);
      setShowRating(false);
      if (isCompleted) {
        updateSkillProgress(cardId, { status: 'not_started', completedSteps: [] });
      }
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

  // UI 状态：showCompletionConfirm 用于显示完成确认信息
  const [showCompletionConfirm, setShowCompletionConfirm] = useState(false);

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

    // ★ 修复：不再自动收起卡片，而是显示完成确认信息
    // 用户可以手动点击"收起"按钮来关闭卡片
    setShowRating(false);
    setShowCompletionConfirm(true);
    setStartTime(null);

    // ★ SFBT Trigger: Send a structured message to trigger the backend SFBT logic
    // Improved Format: "我完成了五感着陆练习，现在感觉：🙂 (4分)"
    const emotions = ['😣', '☹️', '😐', '🙂', '😁'];
    const emoji = emotions[score - 1] || '😐';

    sendMessage(`我完成了“${card.title}”练习，现在感觉：${emoji} (${score}分)`);
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

  const visual = WIDGET_VISUALS[card.widget || ''] || DEFAULT_VISUAL;
  const progressRatio = stepsCount > 0 ? completedSteps.length / stepsCount : 0;

  return (
    <div ref={cardRef} className={`bg-white rounded-xl border border-l-[3px] transition-all duration-300 w-full overflow-hidden flex flex-col group ${visual.borderColor} ${isExpanded ? 'border-blue-200 shadow-glow-md ring-1 ring-blue-50' : 'border-gray-100 shadow-glow-card hover:shadow-glow-md'}`}>

      {/* 1. 常驻 Summary 区域 (始终显示) */}
      <div className="flex flex-col md:flex-row relative">
        {/* 左侧信息 */}
        <div className="p-4 flex-1 flex flex-col justify-center min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg flex-shrink-0" role="img">{visual.emoji}</span>
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
            <span className={`ml-auto px-2 py-0.5 text-[10px] font-bold rounded-full ${effort.color} bg-opacity-50 flex-shrink-0`}>
              {effort.label}强度
            </span>
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

          {/* 步骤进度条 */}
          {completedSteps.length > 0 && stepsCount > 0 && (
            <div className="mt-3 w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                className={`h-full rounded-full ${isCompleted ? 'bg-green-400' : 'bg-blue-400'}`}
                initial={{ width: 0 }}
                animate={{ width: `${progressRatio * 100}%` }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              />
            </div>
          )}
        </div>

        {/* 右侧动作按钮 — 固定尺寸容器，内容切换不影响 flex 布局 */}
        <div className="p-4 bg-gray-50 md:bg-white md:border-l border-gray-100 flex flex-row md:flex-col justify-center items-center gap-3 md:w-32 md:min-h-[60px] flex-shrink-0 transition-colors">
          {isExpanded ? (
            headerControl || (
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
            )
          ) : (
            <button
              onClick={handleMainAction}
              className={`w-full md:w-auto px-4 py-2 rounded-full text-sm font-bold shadow-sm transition-all transform hover:scale-105 active:scale-95 ${
                isCompleted
                  ? 'bg-white border border-gray-200 text-gray-600 !font-medium hover:bg-gray-50 hover:text-blue-600'
                  : isInProgress
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-blue-600 text-white hover:bg-blue-700 hover:shadow-md'
              }`}
            >
              {isCompleted ? '再次练习' : isInProgress ? '继续' : isGuided ? '开始引导' : '开始练习'}
            </button>
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
            transition={{ height: { type: 'spring', stiffness: 500, damping: 40 }, opacity: { duration: 0.25, ease: 'easeInOut' } }}
            className="border-t border-gray-100 bg-gray-50"
          >
            <div className="p-5">
              {/* 这里的布局根据内容动态调整 */}

              {showCompletionConfirm ? (
                /* ★ 完成确认状态：显示成功信息和手动关闭按钮 */
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="text-center py-6"
                >
                  <div className="text-4xl mb-3">🎉</div>
                  <h4 className="text-lg font-semibold text-gray-800 mb-2">练习完成！</h4>
                  <p className="text-sm text-gray-500 mb-4">干得漂亮！坚持下去，你会感受到积极的变化。</p>
                  <button
                    onClick={() => {
                      setIsExpanded(false);
                      setShowCompletionConfirm(false);
                    }}
                    className="px-5 py-2 bg-green-600 text-white rounded-full text-sm font-medium hover:bg-green-700 transition-colors shadow-sm"
                  >
                    ✓ 我知道了
                  </button>
                </motion.div>
              ) : showRating ? (
                <InlineMoodRating onRate={handleRatingSubmit} />
              ) : (
                <>
                  {/* 如果有 specific component (Widget) */}
                  {/* AI 引导型练习：不展开 Widget，显示进行中提示 */}
                  {isGuided && isInProgress ? (
                    <div className="text-center py-6">
                      <div className="text-3xl mb-2 animate-pulse">💬</div>
                      <p className="text-sm text-gray-600 font-medium">AI 正在引导你完成「{GUIDED_LABELS[guidedType!] || card.title}」</p>
                      <p className="text-xs text-gray-400 mt-1">请在对话中跟随指引</p>
                    </div>
                  ) : card.widget === 'breathing' ? (
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
                  ) : card.widget === 'empty_chair' ? ( // 新增：空椅子
                    <BasicEmptyChair
                      onComplete={handleWidgetComplete}
                      setHeaderControl={setHeaderControl}
                      onStart={handleWidgetStart}
                    />
                  ) : card.widget === 'leaves_stream' ? ( // 新增：想法脱钩
                    <LeavesOnStream
                      onComplete={handleWidgetComplete}
                      setHeaderControl={setHeaderControl}
                      onStart={handleWidgetStart}
                    />
                  ) : (
                    /* Default Steps List */
                    <div className="space-y-4">
                      <h5 className="font-medium text-gray-700 px-1">步骤指导</h5>
                      <div className="space-y-3">
                        {card.steps?.map((step, idx) => {
                          const done = completedSteps.includes(idx);
                          return (
                            <div
                              key={idx}
                              className={`flex gap-3 p-3 rounded-xl border transition-all cursor-pointer ${done
                                ? 'bg-blue-50 border-blue-100 opacity-60'
                                : 'bg-white border-gray-200 hover:border-blue-300'
                                }`}
                              onClick={() => handleStepToggle(idx)}
                            >
                              <motion.div
                                className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold mt-0.5 ${done
                                  ? 'bg-blue-500 text-white'
                                  : 'bg-gray-100 text-gray-500'
                                  }`}
                                animate={done ? { scale: [1, 1.3, 1] } : { scale: 1 }}
                                transition={{ duration: 0.3 }}
                              >
                                {done ? <AnimatedCheck checked /> : idx + 1}
                              </motion.div>
                              <div className={`text-sm leading-relaxed ${done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                {step}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={handleManualComplete}
                          className="px-5 py-2 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-700 shadow-sm"
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
