'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { extractSummary, extractRiskTriage, extractNextStepsLines } from '@/lib/api/chat';
import { ActionCard } from '@/types/chat';
import { NextStepsChecklist } from './NextStepsChecklist';
import { ActionCardGrid } from './ActionCardGrid';

interface ConclusionSectionsProps {
  reply: string;
  actionCards?: ActionCard[];
  routeType: 'crisis' | 'assessment' | 'support';
  messageId: string;
  sessionId: string;
  validationError?: {
    actionCards?: string;
    nextStepsLines?: string;
  };
}

export function ConclusionSections({
  reply,
  actionCards,
  routeType,
  messageId,
  sessionId,
  validationError,
}: ConclusionSectionsProps) {
  // 如果校验失败，不显示结构化区块
  const shouldShowStructured = !validationError;

  const summary = extractSummary(reply);
  const riskTriage = extractRiskTriage(reply);
  const nextStepsLines = extractNextStepsLines(reply);

  // 展开/收起状态
  const [isSummaryExpanded, setIsSummaryExpanded] = useState(false);
  const [isRiskTriageExpanded, setIsRiskTriageExpanded] = useState(false);

  // 从 summary 中提取关键信息作为摘要
  const extractSummaryBrief = (text: string): string => {
    if (!text) return '';

    // 尝试提取关键信息：持续时间、影响分数、自伤念头等
    const durationMatch = text.match(/(\d+[个]?[月周天])/);
    const impactMatch = text.match(/(影响|强度|评分)[：:：]?\s*(\d+)\s*[\/分]/);
    const riskMatch = text.match(/(无|没有|未发现).*?(自伤|自杀|伤害)/);

    const parts: string[] = [];
    if (durationMatch) parts.push(`持续 ${durationMatch[1]}`);
    if (impactMatch) parts.push(`影响 ${impactMatch[2]}/10`);
    if (riskMatch) parts.push('无自伤念头');

    // 如果没有提取到关键信息，取前30字作为摘要
    if (parts.length === 0) {
      const cleaned = text.replace(/\n/g, ' ').trim();
      return cleaned.length > 30 ? cleaned.substring(0, 30) + '...' : cleaned;
    }

    return parts.join(' · ');
  };

  // 从 riskTriage 中提取第一句话作为摘要
  const extractRiskTriageBrief = (text: string): string => {
    if (!text) return '';

    // 取第一句话（到句号、问号、感叹号或换行）
    const firstSentence = text.split(/[。！？\n]/)[0].trim();
    return firstSentence.length > 50 ? firstSentence.substring(0, 50) + '...' : firstSentence;
  };

  const summaryBrief = summary ? extractSummaryBrief(summary) : '';
  const riskTriageBrief = riskTriage ? extractRiskTriageBrief(riskTriage) : '';

  // 如果校验失败，只显示纯文本
  if (!shouldShowStructured) {
    return (
      <div className="mt-4 prose prose-sm max-w-none">
        <ReactMarkdown>{reply}</ReactMarkdown>
      </div>
    );
  }

  // Crisis 路由不显示行动卡片和清单
  const isCrisis = routeType === 'crisis';
  const shouldShowActions = !isCrisis && routeType === 'assessment';
  const hasActionCards = actionCards && actionCards.length > 0;

  // 如果有行动卡片，只显示简短引导语（避免重复）
  // 提取简短引导语：去除已提取的结构化内容后的剩余文本
  const getBriefIntro = () => {
    if (!hasActionCards) return null;

    // 移除已提取的结构化内容
    let briefText = reply;
    if (summary) briefText = briefText.replace(summary, '').trim();
    if (riskTriage) briefText = briefText.replace(riskTriage, '').trim();
    if (nextStepsLines.length > 0) {
      nextStepsLines.forEach(line => {
        briefText = briefText.replace(line, '').trim();
      });
    }

    // 移除常见的结构化标记
    briefText = briefText
      .replace(/【初筛总结】/g, '')
      .replace(/【风险与分流】/g, '')
      .replace(/【下一步清单】/g, '')
      .replace(/\*\*初筛总结\*\*/g, '')
      .replace(/\*\*风险与分流\*\*/g, '')
      .replace(/\*\*下一步清单\*\*/g, '')
      .trim();

    // 如果剩余文本很短（少于50字），作为引导语显示
    if (briefText && briefText.length < 50 && briefText.length > 0) {
      return briefText;
    }

    // 否则返回默认简短引导语
    return hasActionCards ? '以下是一些适合你的行动建议：' : null;
  };

  const briefIntro = getBriefIntro();

  return (
    <div className="mt-3 space-y-2.5 w-full min-w-0">
      {/* 简短引导语（如果有行动卡片） */}
      {briefIntro && hasActionCards && (
        <p className="text-sm text-gray-600 mb-2">{briefIntro}</p>
      )}

      {/* 行动建议容器 - 紧凑工具卡样式 */}
      {shouldShowActions && (nextStepsLines.length > 0 || hasActionCards) && (
        <ActionCardContainer hasActionCards={hasActionCards}>
          <div className="p-3 bg-white rounded-xl border border-gray-200 shadow-xs w-full min-w-0 max-w-5xl mx-auto">
            <h2 className="text-sm font-semibold text-gray-900 mb-2.5 flex items-center gap-1.5">
              <span className="text-base">🎯</span>
              行动建议
            </h2>
            <div className="space-y-2.5 w-full min-w-0">
              {/* 下一步行动清单 */}
              {nextStepsLines.length > 0 && (
                <NextStepsChecklist items={nextStepsLines} messageId={messageId} />
              )}
              {/* 行动卡片 */}
              {hasActionCards && (
                <ActionCardGrid cards={actionCards} messageId={messageId} sessionId={sessionId} />
              )}
            </div>
          </div>
        </ActionCardContainer>
      )}

      {/* 初筛总结 - 紧凑摘要 + 可展开 */}
      {summary && (
        <div className="p-2.5 bg-gray-50 rounded-xl border border-gray-200">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-gray-700 mb-1">初筛总结</h3>
              {isSummaryExpanded ? (
                <div className="prose prose-sm max-w-none text-gray-700 text-xs leading-relaxed">
                  <ReactMarkdown>{summary}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-xs text-gray-600 line-clamp-1">{summaryBrief || '查看详情'}</p>
              )}
            </div>
            <button
              onClick={() => setIsSummaryExpanded(!isSummaryExpanded)}
              className="shrink-0 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1"
            >
              {isSummaryExpanded ? '收起' : '展开'}
            </button>
          </div>
        </div>
      )}

      {/* 风险与分流 - 紧凑摘要 + 可展开 */}
      {riskTriage && (
        <div
          className={`p-2.5 rounded-xl border ${routeType === 'crisis'
            ? 'bg-red-50 border-red-300'
            : 'bg-yellow-50 border-yellow-200'
            }`}
        >
          {routeType === 'crisis' && !isRiskTriageExpanded && (
            <div className="mb-2 p-2 bg-red-100 border border-red-300 rounded-sm">
              <p className="text-red-800 font-semibold text-xs">
                ⚠️ 检测到高风险表达，建议立即寻求专业帮助
              </p>
            </div>
          )}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-xs font-semibold text-gray-700 mb-1">风险与分流</h3>
              {isRiskTriageExpanded ? (
                <div className="space-y-2">
                  <div className="prose prose-sm max-w-none text-gray-700 text-xs leading-relaxed">
                    <ReactMarkdown>{riskTriage}</ReactMarkdown>
                  </div>
                  {routeType === 'crisis' && (
                    <div className="mt-2 p-2 bg-white rounded-sm border border-red-200">
                      <p className="text-xs font-semibold text-gray-800 mb-1.5">求助资源：</p>
                      <ul className="text-xs text-gray-700 space-y-0.5">
                        <li>• 全国24小时心理危机干预热线：400-161-9995</li>
                        <li>• 北京危机干预热线：010-82951332</li>
                        <li>• 上海危机干预热线：021-64383562</li>
                        <li>• 如遇紧急情况，请立即拨打 110 或前往就近医院急诊科</li>
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-xs text-gray-600 line-clamp-1">{riskTriageBrief || '查看详情'}</p>
              )}
            </div>
            <button
              onClick={() => setIsRiskTriageExpanded(!isRiskTriageExpanded)}
              className="shrink-0 text-xs text-blue-600 hover:text-blue-700 font-medium px-2 py-1"
            >
              {isRiskTriageExpanded ? '收起' : '了解更多'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionCardContainer({ children, hasActionCards }: { children: React.ReactNode; hasActionCards?: boolean }) {
  const [isVisible, setIsVisible] = useState(false);

  // 当组件挂载或 hasActionCards 变为 true 时，触发动画
  if (typeof window !== 'undefined') {
    // useLayoutEffect or useEffect
  }
  // We can just use useEffect inside the component
  useEffect(() => {
    // 稍微延迟以确保 DOM 渲染
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 300); // 300ms 延迟，让用户先看到文字，再看到卡片浮现
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`transition-all duration-1000 ease-out transform ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
        }`}
    >
      {children}
    </div>
  );
}
