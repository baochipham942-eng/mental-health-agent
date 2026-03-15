'use client';

import { KeyboardEvent, useRef, useEffect, useCallback, useState } from 'react';
import { Button, Drawer } from '@arco-design/web-react';
import { IconSend, IconLoading } from '@arco-design/web-react/icon';
import { cn } from '@/lib/utils/cn';
import { VoiceInputButton } from './VoiceInputButton';
import { useChatStore, CHAT_MODELS, type ChatModelId } from '@/store/chatStore';

/** 解压工具箱图标 — 魔法棒风格 */
function ToolboxIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 4V2" />
      <path d="M15 16v-2" />
      <path d="M8 9h2" />
      <path d="M20 9h2" />
      <path d="M17.8 11.8L19 13" />
      <path d="M15 9h.01" />
      <path d="M17.8 6.2L19 5" />
      <path d="M11 6.2L9.7 5" />
      <path d="M2 22l10-10" />
    </svg>
  );
}

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
  const skillPanelRef = useRef<HTMLDivElement>(null);
  const [skillsOpen, setSkillsOpen] = useState(false);
  const [desktopMenuOpen, setDesktopMenuOpen] = useState(false);

  // 点击外部关闭技能面板
  useEffect(() => {
    if (!desktopMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (skillPanelRef.current?.contains(e.target as Node)) return;
      setDesktopMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [desktopMenuOpen]);

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
      {/* 输入框容器 - items-end 让按钮始终贴底，避免多行输入时按钮跳动 */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-glow-card p-1.5 flex gap-2 items-end">
        {/* Tool Kit Trigger - Responsive */}
        {/* Feature Layers:
           Layer 0（默认入口）: 自由聊天、情绪倾诉、日常解压
           Layer 1（自然发现）: 呼吸练习、正念冥想、情绪记录、认知重构
           Layer 2（主动探索）: 对话排练、深度自我了解、成长记录
           Layer 3（专业评估）: 情绪健康度检查(PHQ-9)、压力指数检查(GAD-7) */}
        {/* Desktop: CSS Popover（无 Portal，即时响应） */}
        <div className="hidden md:block relative" ref={skillPanelRef}>
          <Button
            type="text"
            shape="circle"
            onClick={() => setDesktopMenuOpen(v => !v)}
            className="!text-gray-400 hover:!text-purple-600 hover:!bg-purple-50 transition-colors !flex !items-center !justify-center !p-0"
            style={{ width: 44, height: 44, flexShrink: 0 }}
          >
            <ToolboxIcon size={20} />
          </Button>

          {/* 技能面板 — 始终在 DOM 中，CSS 控制显隐 */}
          <div
            className={`absolute bottom-full left-0 mb-2 z-[2000]
              bg-white rounded-xl shadow-lg border border-gray-100 p-3 min-w-[280px]
              transition-all duration-150 origin-bottom-left
              ${desktopMenuOpen
                ? 'opacity-100 scale-100 pointer-events-auto'
                : 'opacity-0 scale-95 pointer-events-none'
              }`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-xs text-gray-400 font-medium mb-2 px-1">解压工具箱</div>
            <div className="grid grid-cols-2 gap-1.5">
              {[
                { key: "4-7-8呼吸法", emoji: "🌬️", label: "呼吸练习", desc: "缓解焦虑" },
                { key: "正念冥想", emoji: "🧘", label: "正念冥想", desc: "放松身心" },
                { key: "空椅子", emoji: "🪑", label: "空椅子", desc: "释放情绪" },
                { key: "着陆技术", emoji: "🦶", label: "五感着陆", desc: "缓解恐慌" },
                { key: "溪流落叶", emoji: "🎈", label: "放飞念头", desc: "改善纠结" },
                { key: "认知重构", emoji: "🧠", label: "认知重构", desc: "转换视角" },
                { key: "行为激活", emoji: "⚡️", label: "行为激活", desc: "提升动力" },
                { key: "情绪记录", emoji: "🌡️", label: "情绪记录", desc: "觉察当下" },
              ].map((skill) => (
                <div
                  key={skill.key}
                  onClick={() => { onSend(`我想试试${skill.key}`); setDesktopMenuOpen(false); }}
                  className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                >
                  <span className="text-xl flex-shrink-0">{skill.emoji}</span>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-700 group-hover:text-indigo-600 transition-colors">{skill.label}</div>
                    <div className="text-[11px] text-gray-400">{skill.desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Mobile: Bottom ActionSheet (Drawer) */}
        <div className="md:hidden">
          <Button
            type="text"
            shape="circle"
            onClick={() => setSkillsOpen(true)}
            className="!text-gray-400 hover:!text-purple-600 hover:!bg-purple-50 transition-colors !flex !items-center !justify-center !p-0"
            style={{ width: 44, height: 44, flexShrink: 0 }}
          >
            <ToolboxIcon size={22} />
          </Button>

          <Drawer
            visible={skillsOpen}
            onCancel={() => setSkillsOpen(false)}
            placement="bottom"
            height="auto"
            footer={null}
            title={
              <div className="text-center w-full relative">
                <span className="text-gray-900 font-semibold">解压工具箱</span>
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-200 rounded-full"></div>
              </div>
            }
            className="rounded-t-2xl [&_.arco-drawer-header]:border-none [&_.arco-drawer-header]:pt-4"
          >
            <div className="grid grid-cols-4 gap-3 pb-6 px-1">
              {[
                { key: "4-7-8呼吸法", emoji: "🌬️", label: "呼吸练习", gradient: "from-blue-50 to-blue-100" },
                { key: "正念冥想", emoji: "🧘", label: "正念冥想", gradient: "from-purple-50 to-purple-100" },
                { key: "空椅子", emoji: "🪑", label: "空椅子", gradient: "from-amber-50 to-amber-100" },
                { key: "着陆技术", emoji: "🦶", label: "五感着陆", gradient: "from-teal-50 to-teal-100" },
                { key: "溪流落叶", emoji: "🎈", label: "放飞念头", gradient: "from-sky-50 to-violet-100" },
                { key: "认知重构", emoji: "🧠", label: "认知重构", gradient: "from-indigo-50 to-indigo-100" },
                { key: "行为激活", emoji: "⚡️", label: "行为激活", gradient: "from-orange-50 to-orange-100" },
                { key: "情绪记录", emoji: "🌡️", label: "情绪记录", gradient: "from-rose-50 to-rose-100" },
              ].map((skill) => (
                <div
                  key={skill.key}
                  onClick={() => {
                    onSend(`我想试试${skill.key}`);
                    setSkillsOpen(false);
                  }}
                  className="flex flex-col items-center gap-2 p-2 active:scale-95 rounded-xl transition-all cursor-pointer"
                >
                  <div className={`w-12 h-12 bg-gradient-to-br ${skill.gradient} rounded-2xl flex items-center justify-center text-2xl shadow-sm border border-white/60`}>
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

        {/* 输入框包装器 */}
        <div className="flex-1 flex items-center min-h-[44px] min-w-0">
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
              paddingLeft: '4px',  // 减少左边距，使工具包左右留白一致
              paddingRight: '12px',
              margin: 0,
              lineHeight: '24px',
            }}
          />
        </div>

        {/* 语音输入按钮 - 会话结束/禁用时隐藏 */}
        {!disabled && (
          <VoiceInputButton
            onTranscript={handleVoiceTranscript}
            disabled={isLoading}
            size={44}
          />
        )}

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

      {/* 免责声明 + 模型切换 */}
      {showDisclaimer && (
        <ModelDisclaimer />
      )}
    </div>
  );
}

/**
 * 底部模型指示器 + 切换器
 */
function ModelDisclaimer() {
  const { currentModel, setCurrentModel } = useChatStore();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const modelIds = Object.keys(CHAT_MODELS) as ChatModelId[];

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  return (
    <div className="mt-2 text-center relative" ref={containerRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="text-[11px] text-gray-400 hover:text-indigo-500 transition-colors cursor-pointer"
      >
        内容由 <span className="font-medium underline decoration-dotted underline-offset-2">{CHAT_MODELS[currentModel]?.label || 'DeepSeek'}</span> 生成，仅供参考
      </button>

      {/* 模型选择面板 */}
      <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50
        bg-white rounded-xl shadow-lg border border-gray-100 py-1.5 min-w-[220px]
        transition-all duration-150 origin-bottom
        ${open
          ? 'opacity-100 scale-100 pointer-events-auto'
          : 'opacity-0 scale-95 pointer-events-none'
        }`}>
        {modelIds.map(id => (
          <div
            key={id}
            onClick={() => { setCurrentModel(id); setOpen(false); }}
            className={cn(
              'flex items-center gap-2 px-4 py-2 mx-1 rounded-lg cursor-pointer transition-colors text-sm',
              id === currentModel ? 'bg-indigo-50 text-indigo-700' : 'hover:bg-gray-50 text-gray-700'
            )}
          >
            <span className="font-medium">{CHAT_MODELS[id].label}</span>
            <span className="text-xs text-gray-400">{CHAT_MODELS[id].modelName}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
