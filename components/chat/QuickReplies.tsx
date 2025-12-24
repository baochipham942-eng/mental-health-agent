'use client';

import { cn } from '@/lib/utils/cn';

interface QuickRepliesProps {
  mode: 'riskChoice' | 'scale0to10' | 'optionChoice' | 'none';
  onPick: (text: string) => void;
  options?: string[]; // 用于 optionChoice 模式的选项列表
  scaleContext?: string; // 0-10 量表正在测量什么
  disabled?: boolean;  // 新增：是否禁用（发送中）
}

export function QuickReplies({ mode, onPick, options = [], scaleContext, disabled = false }: QuickRepliesProps) {
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
      <div className="mt-3 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {choices.map((choice) => (
          <button
            key={choice.value}
            onClick={() => !disabled && onPick(choice.value)}
            disabled={disabled}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-full shadow-sm',
              'bg-white text-indigo-600 border border-indigo-200',
              'hover:bg-indigo-50 hover:border-indigo-300 hover:shadow-md',
              'active:scale-95 transform transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
              disabled && 'opacity-50 cursor-not-allowed grayscale'
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
      <div className="mt-3 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-100">
        <p className="text-xs text-gray-500 mb-2 font-medium ml-1">
          {scaleContext ? `请评估你的${scaleContext}: ` : ''}
          <span className="text-slate-400 font-normal">(0 = 最低, 10 = 最高)</span>
        </p>
        <div className="flex flex-wrap gap-1.5">
          {Array.from({ length: 11 }, (_, i) => i).map((num) => (
            <button
              key={num}
              onClick={() => !disabled && onPick(num.toString())}
              disabled={disabled}
              className={cn(
                'w-9 h-9 text-sm font-medium rounded-full shadow-sm',
                'bg-white text-gray-700 border border-gray-200',
                'hover:bg-indigo-50 hover:text-indigo-600 hover:border-indigo-200',
                // Highlight ends
                (num === 0 || num === 10) && 'border-indigo-100 bg-slate-50',
                'transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
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
      <div className="mt-3 flex flex-wrap gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300">
        {options.map((option, idx) => (
          <button
            key={idx}
            onClick={() => !disabled && onPick(option.trim())}
            disabled={disabled}
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-full shadow-sm',
              'bg-white text-indigo-600 border border-indigo-200',
              'hover:bg-indigo-50 hover:border-indigo-300 hover:shadow-md',
              'transition-all duration-200',
              'focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-1',
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
  scaleContext?: string;
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
    // 提取量表上下文：找到 0-10 关键词前后的文本
    let scaleContext: string | undefined;

    // 尝试匹配常见模式："你的XXX大概是"、"评估一下你的XXX"、"XXX程度"等
    const contextPatterns = [
      /你的([\u4e00-\u9fa5]{2,8})(?:大概|大约|有多|程度)?/,
      /评(?:估|价)[\u4e00-\u9fa5·]{0,4}你的([\u4e00-\u9fa5]{2,8})/,
      /([\u4e00-\u9fa5]{2,6})程度/,
      /([\u4e00-\u9fa5]{2,6})质量/,
      /([\u4e00-\u9fa5]{2,6})情况/,
      /([\u4e00-\u9fa5]{2,6})强度/,
    ];

    for (const pattern of contextPatterns) {
      const match = content.match(pattern);
      if (match && match[1]) {
        scaleContext = match[1];
        break;
      }
    }

    return { mode: 'scale0to10', scaleContext };
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
