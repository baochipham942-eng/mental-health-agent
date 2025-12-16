'use client';

import { KeyboardEvent, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils/cn';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  isLoading?: boolean;
}

export function ChatInput({ value = '', onChange, onSend, isLoading = false }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自适应高度：1-6行，超出内部滚动
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    // 重置高度以获取正确的 scrollHeight
    textarea.style.height = 'auto';

    // 计算行高（约等于 line-height，假设为 1.5，font-size 为 16px，padding 为 8px*2 = 16px）
    const lineHeight = 24; // 约 1.5 * 16px
    const padding = 16; // py-2 = 8px top + 8px bottom
    const minHeight = lineHeight + padding; // 1行高度
    const maxHeight = lineHeight * 6 + padding; // 6行高度

    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      const newValue = e.target.value;
      // 确保onChange总是被调用，即使值相同
      onChange(newValue);
    } catch (error) {
      // 捕获浏览器扩展可能导致的错误，但不影响正常功能
      console.warn('Input change error (likely from browser extension):', error);
    }
  };

  // 修复C: 确保value是字符串类型，并计算是否可以发送
  // 按钮逻辑必须只依赖 value.trim()，不依赖isLoading（允许发送中继续发送，进入队列）
  const valueStr = typeof value === 'string' ? value : '';
  const trimmedValue = valueStr.trim();
  const canSend = trimmedValue.length > 0; // 移除!isLoading限制，允许队列化发送

  // 添加全局错误处理，捕获浏览器扩展的错误
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      // 如果是浏览器扩展的错误，静默处理
      if (event.filename && event.filename.includes('content_script')) {
        event.preventDefault();
        return false;
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      // 如果是浏览器扩展的错误，静默处理
      if (event.reason && typeof event.reason === 'string' && event.reason.includes('control')) {
        event.preventDefault();
        return false;
      }
    };

    window.addEventListener('error', handleError, true);
    window.addEventListener('unhandledrejection', handleUnhandledRejection, true);

    return () => {
      window.removeEventListener('error', handleError, true);
      window.removeEventListener('unhandledrejection', handleUnhandledRejection, true);
    };
  }, []);

  const handleSubmit = (e?: React.MouseEvent<HTMLButtonElement> | React.KeyboardEvent) => {
    // 阻止事件冒泡，防止浏览器扩展干扰
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }

    if (!canSend) {
      return;
    }

    try {
      onSend();
      // 重置高度
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    } catch (error) {
      console.error('Submit error:', error);
    }
  };

  // 添加点击事件处理（使用捕获阶段，优先于扩展脚本）
  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    // 立即阻止事件传播，防止浏览器扩展干扰
    e.preventDefault();
    e.stopPropagation();

    if (!canSend) {
      return;
    }

    // 使用 requestAnimationFrame 确保在下一帧执行，避免扩展干扰
    requestAnimationFrame(() => {
      try {
        handleSubmit(e);
      } catch (error) {
        console.error('Click handler error:', error);
      }
    });
  };

  // 添加触摸事件支持（移动端）
  const handleTouchEnd = (e: React.TouchEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();

    if (!canSend) {
      return;
    }

    requestAnimationFrame(() => {
      try {
        handleSubmit(e as any);
      } catch (error) {
        console.error('Touch handler error:', error);
      }
    });
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    try {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        if (canSend) {
          handleSubmit(e);
        }
      }
    } catch (error) {
      // 捕获可能的扩展错误
      console.warn('KeyDown error (likely from browser extension):', error);
    }
  };

  // 处理焦点事件，捕获可能的扩展错误
  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    try {
      // 正常处理焦点
    } catch (error) {
      // 静默捕获浏览器扩展的错误，不影响正常功能
      console.warn('Focus error (likely from browser extension):', error);
    }
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    try {
      // 正常处理失焦
    } catch (error) {
      console.warn('Blur error (likely from browser extension):', error);
    }
  };

  return (
    <div className="w-full">
      <div className="flex gap-2 items-end w-full">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={handleFocus}
          onBlur={handleBlur}
          placeholder="输入你的问题或感受..."
          // 修复C: 发送中不锁定输入框，允许继续输入
          disabled={false}
          readOnly={false}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          data-lpignore="true"
          data-form-type="other"
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-lg border border-gray-300 px-4 py-2',
            'text-gray-900 placeholder:text-gray-500',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
            'overflow-y-auto transition-colors duration-200',
            'leading-6', // line-height: 1.5 (24px for 16px base)
            'bg-white'
            // 修复C: 移除disabled样式，允许发送中继续输入
          )}
          style={{
            minHeight: '44px',
            maxHeight: '152px', // 6行高度：24px * 6 + 16px padding = 160px，稍微小一点
            pointerEvents: 'auto',
          }}
        />
        <button
          type="button"
          disabled={!canSend}
          onClick={handleClick}
          onTouchEnd={handleTouchEnd}
          aria-disabled={!canSend}
          data-lpignore="true"
          data-testid="send-button"
          className={cn(
            'px-6 py-2 rounded-lg font-medium transition-colors',
            canSend
              ? 'bg-blue-500 text-white hover:bg-blue-600 cursor-pointer active:bg-blue-700'
              : 'bg-gray-300 text-gray-500 cursor-not-allowed',
            'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
            'min-w-[80px] flex items-center justify-center',
            'select-none' // 防止文本选择
          )}
          style={{
            pointerEvents: canSend ? 'auto' : 'none',
            userSelect: 'none',
            WebkitUserSelect: 'none',
            touchAction: 'manipulation', // 优化移动端触摸
            WebkitTapHighlightColor: 'transparent', // 移除移动端点击高亮
          }}
        >
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>等待中</span>
            </span>
          ) : (
            '发送'
          )}
        </button>
      </div>
      <p className="text-xs text-gray-600 mt-2 font-medium">
        按 Enter 发送，Shift + Enter 换行
      </p>
    </div>
  );
}




