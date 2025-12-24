'use client';

import { KeyboardEvent, useRef, useEffect, useCallback } from 'react';
import { Button } from '@arco-design/web-react';
import { IconSend } from '@arco-design/web-react/icon';
import { cn } from '@/lib/utils/cn';
import { VoiceInputButton } from './VoiceInputButton';

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSend: (value: string) => void;
  isLoading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  showDisclaimer?: boolean;
  autoFocus?: boolean;
}

export function ChatInput({
  value = '',
  onChange,
  onSend,
  isLoading = false,
  disabled = false,
  placeholder = "输入你的问题或感受...",
  showDisclaimer = true,
  autoFocus = true,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 自适应高度：1-6行，超出内部滚动
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = 'auto';
    const lineHeight = 24;
    const padding = 16;
    const minHeight = lineHeight + padding;
    const maxHeight = lineHeight * 6 + padding;

    const newHeight = Math.min(Math.max(textarea.scrollHeight, minHeight), maxHeight);
    textarea.style.height = `${newHeight}px`;
  };

  useEffect(() => {
    adjustHeight();
    // 修复：当值通过 draft 恢复时，将光标移动到末尾 (仅在有值且当前未聚焦或聚焦位置为0时)
    const textarea = textareaRef.current;
    if (textarea && value && document.activeElement !== textarea) {
      // 使用 requestAnimationFrame 确保在渲染后执行
      requestAnimationFrame(() => {
        textarea.setSelectionRange(value.length, value.length);
      });
    }
  }, [value]);

  // 自动聚焦
  useEffect(() => {
    if (autoFocus && textareaRef.current && !disabled) {
      const timer = setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [autoFocus, disabled]);

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    try {
      const newValue = e.target.value;
      onChange(newValue);
    } catch (error) {
      console.warn('Input change error:', error);
    }
  };

  // 语音输入回调
  const handleVoiceTranscript = useCallback((text: string) => {
    if (text.trim()) {
      // 追加到现有文本（如果有的话）
      const newValue = value.trim() ? `${value} ${text}` : text;
      onChange(newValue);
      // 聚焦到输入框
      textareaRef.current?.focus();
    }
  }, [value, onChange]);

  const valueStr = typeof value === 'string' ? value : '';
  const trimmedValue = valueStr.trim();
  const canSend = trimmedValue.length > 0;

  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (event.filename && event.filename.includes('content_script')) {
        event.preventDefault();
        return false;
      }
    };

    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
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

  const doSend = () => {
    if (!canSend || isLoading || disabled) {
      return;
    }

    try {
      onSend(value);
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
        requestAnimationFrame(() => {
          textareaRef.current?.focus();
        });
      }
    } catch (error) {
      console.error('Send error:', error);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    try {
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }

      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        doSend();
      }
    } catch (error) {
      console.warn('KeyDown error:', error);
    }
  };

  return (
    <div className="w-full">
      {/* 输入框容器 */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-1.5 flex gap-2 items-end">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          readOnly={disabled && !isLoading}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck="false"
          data-lpignore="true"
          data-form-type="other"
          rows={1}
          className={cn(
            'flex-1 resize-none rounded-xl px-3 py-3',
            'text-gray-900 placeholder:text-gray-400',
            'bg-transparent border-none',
            'focus:outline-none focus:ring-0',
            'overflow-y-auto transition-all duration-200',
            'leading-6 text-[15px]',
            disabled && !isLoading && 'cursor-not-allowed opacity-60'
          )}
          style={{
            minHeight: '44px',
            maxHeight: '160px',
          }}
        />

        {/* 语音输入按钮 */}
        <VoiceInputButton
          onTranscript={handleVoiceTranscript}
          disabled={disabled || isLoading}
          size={40}
        />

        {/* 发送按钮 */}
        <Button
          type="primary"
          size="large"
          shape="circle"
          disabled={!canSend || disabled || isLoading}
          loading={isLoading}
          icon={<IconSend />}
          onClick={doSend}
          style={{
            width: 44,
            height: 44,
            flexShrink: 0,
          }}
          className={cn(
            'transition-all duration-200',
            canSend && !isLoading && 'shadow-md hover:shadow-lg'
          )}
        />
      </div>

      {/* 免责声明 */}
      {showDisclaimer && (
        <p className="text-[11px] text-gray-400 mt-2 text-center">
          内容由 AI 生成，不能替代专业心理咨询服务
        </p>
      )}
    </div>
  );
}
