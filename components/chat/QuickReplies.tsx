'use client';

import { cn } from '@/lib/utils/cn';

interface QuickRepliesProps {
  mode: 'riskChoice' | 'scale0to10' | 'optionChoice' | 'none';
  onPick: (text: string) => void;
  options?: string[]; // 用于 optionChoice 模式的选项列表
  disabled?: boolean;  // 新增：是否禁用（发送中）
}

export function QuickReplies({ mode, onPick, options = [], disabled = false }: QuickRepliesProps) {
  if (mode === 'none') {
    return null;
  }

  if (mode === 'riskChoice') {
    const choices = [
      { text: '没有', value: '没有' },
      { text: '偶尔闪过', value: '偶尔闪过' },
      { text: '经常出现', value: '经常出现' },
      { text: '已经计划', value: '已经计划' },
    ];

    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {choices.map((choice) => (
          <button
            key={choice.value}
            onClick={() => !disabled && onPick(choice.value)}
            disabled={disabled}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg',
              'bg-orange-100 text-orange-800 border border-orange-300',
              'hover:bg-orange-200 hover:border-orange-400',
              'transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {choice.text}
          </button>
        ))}
      </div>
    );
  }

  if (mode === 'scale0to10') {
    return (
      <div className="mt-3">
        <p className="text-xs text-gray-500 mb-2">0 = 最低/没有, 10 = 最高/非常强烈</p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, i) => i).map((num) => (
            <button
              key={num}
              onClick={() => !disabled && onPick(num.toString())}
              disabled={disabled}
              className={cn(
                'w-10 h-10 text-sm font-medium rounded-lg',
                'bg-orange-100 text-orange-800 border border-orange-300',
                'hover:bg-orange-200 hover:border-orange-400',
                'transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1',
                disabled && 'opacity-50 cursor-not-allowed'
              )}
            >
              {num}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (mode === 'optionChoice' && options.length > 0) {
    return (
      <div className="mt-3 flex flex-wrap gap-2">
        {options.map((option, idx) => (
          <button
            key={idx}
            onClick={() => !disabled && onPick(option.trim())}
            disabled={disabled}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-lg',
              'bg-orange-100 text-orange-800 border border-orange-300',
              'hover:bg-orange-200 hover:border-orange-400',
              'transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-1',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
            {option.trim()}
          </button>
        ))}
      </div>
    );
  }

  return null;
}

/**
 * 根据消息内容判断应该显示哪种快捷回复模式
 * 返回模式类型和可选的选项列表
 */
export function detectQuickReplyMode(content: string): {
  mode: 'riskChoice' | 'scale0to10' | 'optionChoice' | 'none';
  options?: string[];
} {
  const lowerContent = content.toLowerCase();

  // 检测自伤想法相关关键词
  const riskKeywords = [
    '伤害自己',
    '自伤',
    '不想活',
    '伤害自己想法',
    '伤害自己的想法',
    '自伤想法',
    '自杀',
    '自残',
  ];

  const hasRiskKeyword = riskKeywords.some(keyword => lowerContent.includes(keyword));

  // 检测评分题相关关键词
  const scaleKeywords = [
    '打分 0-10',
    '0-10',
    '0到10',
    '评分',
    '评分 0-10',
    '评分 0 到 10',
    '0到10分',
    '0-10分',
  ];

  const hasScaleKeyword = scaleKeywords.some(keyword => lowerContent.includes(keyword));

  // 检测选项格式：匹配（选项1/选项2/选项3）或（选项1、选项2、选项3）
  const optionPattern = /[（(]([^）)]+)[）)]/;
  const optionMatch = content.match(optionPattern);

  if (hasRiskKeyword) {
    return { mode: 'riskChoice' };
  }

  if (hasScaleKeyword) {
    return { mode: 'scale0to10' };
  }

  // 如果匹配到选项格式，提取选项
  if (optionMatch && optionMatch[1]) {
    // 支持 / 和 、 作为分隔符
    const options = optionMatch[1].split(/[/、]/).map(opt => opt.trim()).filter(opt => opt.length > 0);
    if (options.length >= 2) {
      return { mode: 'optionChoice', options };
    }
  }

  return { mode: 'none' };
}
