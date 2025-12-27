'use client';

import { KeyboardEvent, useRef, useEffect, useCallback, useState } from 'react';
import { Button, Dropdown, Menu, Drawer } from '@arco-design/web-react';
import { IconSend, IconLoading, IconApps } from '@arco-design/web-react/icon';
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
  const [skillsOpen, setSkillsOpen] = useState(false);

  // 自适应高度：1-6行，超出内部滚动
  // 修复：避免设置 height=auto 导致的视觉跳变
  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const minHeight = 24;  // 单行最小高度 (line-height)
    const maxHeight = 144; // 6行最大高度

    // 保存当前 overflow 状态
    const prevOverflow = textarea.style.overflow;

    // 临时隐藏溢出，避免滚动条跳动
    textarea.style.overflow = 'hidden';

    // 临时设置 auto 来测量 scrollHeight
    const prevHeight = textarea.style.height;
    textarea.style.height = 'auto';
    const scrollHeight = textarea.scrollHeight;

    // 计算目标高度
    const targetHeight = Math.min(Math.max(scrollHeight, minHeight), maxHeight);

    // 立即设置目标高度
    textarea.style.height = `${targetHeight}px`;

    // 恢复 overflow（如果超过最大高度，需要显示滚动条）
    textarea.style.overflow = targetHeight >= maxHeight ? 'auto' : 'hidden';
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
      {/* 输入框容器 - items-center 让所有元素垂直居中 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-glow-card p-1.5 flex gap-2 items-center">
        {/* Tool Kit Trigger - Responsive */}
        {/* Desktop: Dropdown Menu */}
        <div className="hidden md:block">
          <Dropdown
            position="tl"
            triggerProps={{
              popupStyle: { zIndex: 2000 },
            }}
            droplist={
              <Menu onClickMenuItem={(key) => onSend(`我想试试${key}`)}>
                <Menu.Item key="4-7-8呼吸法">🌬️ 呼吸练习 (缓解焦虑)</Menu.Item>
                <Menu.Item key="正念冥想">🧘 正念冥想 (放松身心)</Menu.Item>
                <Menu.Item key="空椅子">🪑 空椅子 (释放情绪)</Menu.Item>
                <Menu.Item key="着陆技术">🦶 五感着陆 (缓解恐慌)</Menu.Item>
                <Menu.Item key="溪流落叶">🍃 溪流落叶 (改善纠结)</Menu.Item>
                <Menu.Item key="认知重构">🧠 认知重构 (转换视角)</Menu.Item>
                <Menu.Item key="行为激活">⚡️ 行为激活 (提升动力)</Menu.Item>
                <Menu.Item key="情绪记录">🌡️ 情绪记录 (觉察当下)</Menu.Item>
              </Menu>
            }
          >
            <Button
              type="text"
              shape="circle"
              className="!text-gray-400 hover:!text-purple-600 hover:!bg-purple-50 transition-colors !flex !items-center !justify-center !p-0"
              style={{ width: 44, height: 44, flexShrink: 0, marginBottom: '4px' }}
            >
              <IconApps style={{ fontSize: 20 }} />
            </Button>
          </Dropdown>
        </div>

        {/* Mobile: Bottom ActionSheet (Drawer) */}
        <div className="md:hidden">
          <Button
            type="text"
            shape="circle"
            onClick={() => setSkillsOpen(true)}
            className="!text-gray-400 hover:!text-purple-600 hover:!bg-purple-50 transition-colors !flex !items-center !justify-center !p-0"
            style={{ width: 44, height: 44, flexShrink: 0, marginBottom: '4px' }}
          >
            <IconApps style={{ fontSize: 22 }} />
          </Button>

          <Drawer
            visible={skillsOpen}
            onCancel={() => setSkillsOpen(false)}
            placement="bottom"
            height="auto"
            footer={null}
            title={
              <div className="text-center w-full relative">
                <span className="text-gray-900 font-semibold">心理技能工具箱</span>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-200 rounded-full"></div>
              </div>
            }
            className="rounded-t-2xl [&_.arco-drawer-header]:border-none [&_.arco-drawer-header]:pt-4"
          >
            <div className="grid grid-cols-4 gap-3 pb-6 px-1">
              {[
                { key: "4-7-8呼吸法", emoji: "🌬️", label: "呼吸练习" },
                { key: "正念冥想", emoji: "🧘", label: "正念冥想" },
                { key: "空椅子", emoji: "🪑", label: "空椅子" },
                { key: "着陆技术", emoji: "🦶", label: "五感着陆" },
                { key: "溪流落叶", emoji: "🍃", label: "溪流落叶" },
                { key: "认知重构", emoji: "🧠", label: "认知重构" },
                { key: "行为激活", emoji: "⚡️", label: "行为激活" },
                { key: "情绪记录", emoji: "🌡️", label: "情绪记录" },
              ].map((skill) => (
                <div
                  key={skill.key}
                  onClick={() => {
                    onSend(`我想试试${skill.key}`);
                    setSkillsOpen(false);
                  }}
                  className="flex flex-col items-center gap-2 p-2 active:bg-gray-50 rounded-xl transition-colors cursor-pointer"
                >
                  <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-gray-100">
                    {skill.emoji}
                  </div>
                  <span className="text-[11px] font-medium text-gray-600 text-center leading-tight">
                    {skill.label}
                  </span>
                </div>
              ))}
            </div>
          </Drawer>
        </div>

        {/* 输入框包装器 - self-center 使输入框在 items-end 容器中居中 */}
        <div className="flex-1 flex items-center min-h-[44px] min-w-0 self-center">
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
              'flex-1 resize-none rounded-xl px-3',
              'text-gray-900 placeholder:text-gray-400',
              'bg-transparent border-none outline-none ring-0',
              'focus:outline-none focus:ring-0 focus:border-none shadow-none',
              'overflow-y-auto transition-all duration-200',
              'text-[15px]',
              disabled && !isLoading && 'cursor-not-allowed opacity-60'
            )}
            style={{
              minHeight: '24px',
              maxHeight: '144px',
              padding: '0 12px',
              margin: 0,
              lineHeight: '24px',
            }}
          />
        </div>

        {/* 语音输入按钮 */}
        <VoiceInputButton
          onTranscript={handleVoiceTranscript}
          disabled={disabled || isLoading}
          size={44}
        />

        {/* 发送按钮 - 不使用loading属性以避免布局抖动 */}
        <Button
          type="primary"
          size="large"
          shape="circle"
          disabled={!canSend || disabled}
          icon={
            isLoading ? (
              <IconLoading style={{ fontSize: 18 }} />
            ) : (
              <IconSend style={{ fontSize: 18, transform: 'translateX(1px)' }} />
            )
          }
          onClick={doSend}
          className={cn(
            'transition-all duration-200 !w-[44px] !h-[44px] !min-w-[44px] !min-h-[44px] !p-0',
            canSend && !isLoading && !disabled && 'shadow-md hover:shadow-lg',
            // 强制禁用状态样式
            disabled && '!bg-gray-200 !text-gray-400 !cursor-not-allowed !border-gray-200'
          )}
          style={{
            fontSize: 18,
            flexShrink: 0,
            // 移除 alignSelf: center，让 items-end 生效，确保多行时与底部对齐
            marginBottom: '0px',
          }}
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
