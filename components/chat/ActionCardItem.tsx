'use client';

import { useState, useEffect } from 'react';
import { ActionCard } from '@/types/chat';
import { useChatStore } from '@/store/chatStore';
import { BreathingExercise } from './widgets/BreathingExercise';
import { MoodTracker } from './widgets/MoodTracker';
import { PreExerciseModal } from './modals/PreExerciseModal';
import { PostExerciseModal } from './modals/PostExerciseModal';
import { logExercise } from '@/lib/actions/exercise';

interface ActionCardItemProps {
  card: ActionCard;
  index: number;
}

const effortLabels: Record<'low' | 'medium' | 'high', { label: string; color: string }> = {
  low: { label: '低', color: 'bg-green-100 text-green-800' },
  medium: { label: '中', color: 'bg-yellow-100 text-yellow-800' },
  high: { label: '高', color: 'bg-orange-100 text-orange-800' },
};

// 生成卡片唯一 ID（基于 title）
function getCardId(card: ActionCard): string {
  return `card-${card.title.replace(/\s+/g, '-').toLowerCase()}`;
}

export function ActionCardItem({ card, index }: ActionCardItemProps) {
  const cardId = getCardId(card);
  const { getSkillProgress, updateSkillProgress } = useChatStore();

  const progress = getSkillProgress(cardId);
  const [isDetailView, setIsDetailView] = useState(false); // Detail 视图（步骤态）
  const [showPreTest, setShowPreTest] = useState(false);
  const [showPostTest, setShowPostTest] = useState(false);
  const [preTestScore, setPreTestScore] = useState<number | null>(null);
  const [postTestScore, setPostTestScore] = useState<number | null>(null);
  const [startTime, setStartTime] = useState<number | null>(null);

  const effort = effortLabels[card.effort] || effortLabels.medium;
  const stepsCount = card.steps?.length || 0;
  const completedSteps = progress?.completedSteps || [];
  const status = progress?.status || 'not_started';
  const isNotStarted = status === 'not_started';
  const isInProgress = status === 'in_progress';
  const isCompleted = status === 'done';

  // 从 localStorage 加载前后测分数
  useEffect(() => {
    const savedPreTest = localStorage.getItem(`skill-pretest-${cardId}`);
    const savedPostTest = localStorage.getItem(`skill-posttest-${cardId}`);
    if (savedPreTest) setPreTestScore(parseInt(savedPreTest, 10));
    if (savedPostTest) setPostTestScore(parseInt(savedPostTest, 10));
  }, [cardId]);

  // List 视图：开始/继续/再次练习
  const handleMainAction = () => {
    if (isNotStarted) {
      // 未开始：显示前测
      setShowPreTest(true);
    } else {
      // 进行中或已完成：进入 Detail 视图
      setIsDetailView(true);
      if (!startTime) setStartTime(Date.now());
    }
  };

  const handlePreTestSubmit = (score: number) => {
    setPreTestScore(score);
    localStorage.setItem(`skill-pretest-${cardId}`, score.toString());
    setShowPreTest(false);

    setStartTime(Date.now());
    updateSkillProgress(cardId, { status: 'in_progress', completedSteps: [] });
    setIsDetailView(true); // 进入 Detail 视图
  };

  const handlePreTestClose = () => {
    setShowPreTest(false);
    setStartTime(Date.now());
    updateSkillProgress(cardId, { status: 'in_progress', completedSteps: [] });
    setIsDetailView(true);
  }

  const handleStepToggle = (stepIndex: number) => {
    const newCompletedSteps = completedSteps.includes(stepIndex)
      ? completedSteps.filter((i: number) => i !== stepIndex)
      : [...completedSteps, stepIndex];

    const allStepsCompleted = newCompletedSteps.length === stepsCount;

    updateSkillProgress(cardId, {
      status: allStepsCompleted ? 'done' : 'in_progress',
      completedSteps: newCompletedSteps,
    });

    // 如果全部完成，显示后测
    if (allStepsCompleted && !postTestScore) {
      setShowPostTest(true);
    }
  };

  const handlePostTestSubmit = async (score: number, feedback: string) => {
    setPostTestScore(score);
    localStorage.setItem(`skill-posttest-${cardId}`, score.toString());
    setShowPostTest(false);

    // Logging
    const duration = startTime ? Math.round((Date.now() - startTime) / 1000) : 60;
    try {
      await logExercise({
        cardId: card.title,
        title: card.title,
        durationSeconds: duration,
        preMoodScore: preTestScore || 5, // Default if skipped
        postMoodScore: score,
        feedback: feedback
      });
    } catch (e) {
      console.error("Logging failed", e);
    }
  };

  const handlePostTestClose = () => {
    setShowPostTest(false);
  }

  // Detail 视图：标记完成（toggle）
  const handleToggleComplete = () => {
    if (isCompleted) {
      // 撤销完成：回到进行中
      updateSkillProgress(cardId, {
        status: 'in_progress',
        completedSteps: completedSteps,
      });
    } else {
      // 标记完成：如果还有未完成的步骤，先全部标记为完成
      if (completedSteps.length < stepsCount) {
        const allSteps = Array.from({ length: stepsCount }, (_, i) => i);
        updateSkillProgress(cardId, {
          status: 'done',
          completedSteps: allSteps,
        });
      } else {
        updateSkillProgress(cardId, {
          status: 'done',
          completedSteps: completedSteps,
        });
      }

      // 如果还没做后测，显示后测
      if (!postTestScore) {
        setShowPostTest(true);
      } else {
        // 已做过，直接退出
        setIsDetailView(false);
      }
    }
  };

  // Detail 视图：先到这里（退出详情，保持进度）
  const handlePause = () => {
    setIsDetailView(false);
  };

  // 再次练习：重置状态
  const handleRestart = () => {
    updateSkillProgress(cardId, { status: 'not_started', completedSteps: [] });
    setPreTestScore(null);
    setPostTestScore(null);
    setStartTime(null);
    localStorage.removeItem(`skill-pretest-${cardId}`);
    localStorage.removeItem(`skill-posttest-${cardId}`);
    setIsDetailView(false);
  };

  // 前后测变化值
  const scoreChange = preTestScore !== null && postTestScore !== null
    ? postTestScore - preTestScore
    : null;

  // 估算时间（简单估算：每步约30秒-1分钟）
  const estimatedMinutes = Math.max(1, Math.ceil(stepsCount * 0.5));

  // List 视图
  if (!isDetailView) {
    return (
      <>
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden hover:shadow-md transition-shadow w-full">
          {/* 卡片头部 - 紧凑样式 */}
          <div className="p-3">
            <div className="flex items-start justify-between mb-1.5 gap-2">
              <h4 className="text-sm font-semibold text-gray-900 flex-1 leading-tight line-clamp-1">{card.title}</h4>
              <div className="flex items-center gap-1 flex-shrink-0">
                <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded ${effort.color}`}>
                  {effort.label}
                </span>
                {isCompleted && (
                  <span className="text-xs">✅</span>
                )}
              </div>
            </div>
            <p className="text-xs text-gray-600 mb-2 line-clamp-1">{card.when}</p>

            {/* 步骤摘要 */}
            {stepsCount > 0 && (
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="px-1.5 py-0.5 text-[10px] font-medium rounded bg-gray-100 text-gray-600">
                  {stepsCount}步
                </span>
                <span className="text-[10px] text-gray-500">
                  约{estimatedMinutes}分钟
                </span>
              </div>
            )}

            {/* 前后测变化显示 */}
            {scoreChange !== null && (
              <div className="mb-2 p-1.5 bg-blue-50 rounded border border-blue-200">
                <p className="text-[10px] text-gray-600 mb-0.5">前后测变化：</p>
                <p className="text-xs font-semibold text-blue-700">
                  {preTestScore} → {postTestScore}
                  <span className={scoreChange < 0 ? 'text-green-600' : scoreChange > 0 ? 'text-red-600' : 'text-gray-600'}>
                    {' '}({scoreChange > 0 ? '+' : ''}{scoreChange})
                  </span>
                </p>
              </div>
            )}

            {/* 主按钮：List 视图只保留一个 */}
            <div className="mt-2">
              {isCompleted ? (
                <button
                  onClick={handleRestart}
                  className="w-full h-8 px-3 bg-gray-600 text-white text-xs font-medium rounded-md hover:bg-gray-700 transition-colors"
                >
                  再次练习
                </button>
              ) : (
                <button
                  onClick={handleMainAction}
                  className="w-full h-8 px-3 bg-green-600 text-white text-xs font-medium rounded-md hover:bg-green-700 transition-colors"
                >
                  {isInProgress ? '继续练习' : '开始练习'}
                </button>
              )}
            </div>

            {/* 进行中状态显示已完成标记 */}
            {isInProgress && completedSteps.length > 0 && (
              <p className="text-[10px] text-gray-500 mt-1.5 text-center">
                已完成 {completedSteps.length}/{stepsCount} 步
              </p>
            )}
          </div>
        </div>

        <PreExerciseModal
          isOpen={showPreTest}
          onClose={handlePreTestClose}
          onSubmit={handlePreTestSubmit}
        />
        <PostExerciseModal
          isOpen={showPostTest}
          onClose={handlePostTestClose}
          onSubmit={handlePostTestSubmit}
        />
      </>
    );
  }

  // Detail 视图（步骤态）
  return (
    <>
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden w-full flex flex-col max-h-[500px]">
        {/* Detail 头部 - 紧凑 */}
        <div className="p-3 border-b border-gray-100 flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <h4 className="text-sm font-semibold text-gray-900 line-clamp-1">{card.title}</h4>
            <p className="text-xs text-gray-600 mt-0.5 line-clamp-1">{card.when}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-xs text-blue-600 font-mono bg-blue-50 px-2 py-1 rounded">
              进行中...
            </div>
            <button
              onClick={handlePause}
              className="ml-2 text-xs text-gray-500 hover:text-gray-700 font-medium flex-shrink-0"
            >
              ← 返回
            </button>
          </div>
        </div>

        {/* 核心内容区：如果是呼吸组件，优先渲染组件；否则渲染步骤列表 */}
        <div className="flex-1 overflow-y-auto p-3 bg-gray-50">
          {card.widget === 'breathing' ? (
            <BreathingExercise />
          ) : card.widget === 'mood_tracker' ? (
            <MoodTracker />
          ) : (
            <div className="space-y-2">
              {card.steps.map((step, stepIndex) => {
                const isStepCompleted = completedSteps.includes(stepIndex);
                return (
                  <div
                    key={stepIndex}
                    className={`p-2.5 rounded-md border ${isStepCompleted ? 'border-green-300 bg-green-50' : 'border-gray-200 bg-white'
                      }`}
                  >
                    <div className="flex items-start gap-2">
                      <button
                        onClick={() => handleStepToggle(stepIndex)}
                        className={`flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors mt-0.5 ${isStepCompleted
                          ? 'bg-green-500 text-white'
                          : 'bg-blue-600 text-white hover:bg-blue-700'
                          }`}
                      >
                        {isStepCompleted ? '✓' : stepIndex + 1}
                      </button>
                      <p className={`text-xs text-gray-700 flex-1 break-words leading-relaxed ${isStepCompleted ? 'line-through text-gray-400' : ''}`}>
                        {step}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 底部按钮 - 固定在卡片内部底部 */}
        <div className="p-3 border-t border-gray-100 bg-white flex items-center gap-2">
          <button
            onClick={handlePause}
            className="flex-1 h-8 px-3 border border-gray-300 text-gray-700 text-xs font-medium rounded-md hover:bg-gray-100 transition-colors"
          >
            先到这里
          </button>
          <button
            onClick={handleToggleComplete}
            className={`flex-1 h-8 px-3 text-xs font-medium rounded-md transition-colors ${isCompleted
              ? 'bg-gray-600 text-white hover:bg-gray-700'
              : 'bg-green-600 text-white hover:bg-green-700'
              }`}
          >
            {isCompleted ? (card.widget ? '结束练习' : '撤销完成') : (card.widget ? '完成练习' : '标记完成')}
          </button>
        </div>
      </div>

      <PreExerciseModal
        isOpen={showPreTest}
        onClose={handlePreTestClose}
        onSubmit={handlePreTestSubmit}
      />
      <PostExerciseModal
        isOpen={showPostTest}
        onClose={handlePostTestClose}
        onSubmit={handlePostTestSubmit}
      />
    </>
  );
}
