'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal, Message as ArcoMessage, Avatar } from '@arco-design/web-react';
import { IconDelete } from '@arco-design/web-react/icon';
import { useChatStore } from '@/store/chatStore';
import { completeSession } from '@/lib/actions/chat';
import { generateSummaryForSession } from '@/lib/actions/summary';
import { Logo } from '@/components/logo/Logo';
import { SettingsPanel } from './SettingsPanel';

interface Session {
  id: string;
  title: string | null;
  status: string;
  createdAt: string;
  relativeDate: string;
}

interface SessionListPageProps {
  sessions: Session[];
  hideSessionAction: (id: string) => Promise<void>;
  userName: string;
  nickname?: string | null;
  avatar?: string | null;
  isAdmin?: boolean;
}

// 快捷功能列表
const QUICK_ACTIONS = [
  {
    key: 'progress',
    label: '情绪趋势',
    desc: '查看心理变化',
    path: '/dashboard/progress',
    iconBg: 'bg-emerald-50',
    iconColor: 'text-emerald-600',
    hoverBorder: 'hover:border-emerald-200',
    icon: <span className="text-xl leading-none">📈</span>,
  },
  {
    key: 'memory',
    label: '我的记忆',
    desc: '对话记忆管理',
    path: '/dashboard/memory',
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    hoverBorder: 'hover:border-violet-200',
    icon: <span className="text-xl leading-none">🧠</span>,
  },
  {
    key: 'lab',
    label: '探索工坊',
    desc: '大师对话 · MBTI · 圆桌',
    path: '/dashboard/lab',
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    hoverBorder: 'hover:border-cyan-200',
    icon: <span className="text-xl leading-none">🏛️</span>,
  },
];

function getTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 9) return '早上好';
  if (hour < 12) return '上午好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  if (hour < 22) return '晚上好';
  return '夜深了';
}

export function SessionListPage({
  sessions,
  hideSessionAction,
  userName,
  nickname,
  avatar,
  isAdmin,
}: SessionListPageProps) {
  const router = useRouter();
  const { isConsulting, currentSessionId, resetConversation } = useChatStore();
  const [settingsVisible, setSettingsVisible] = useState(false);

  const handleNewChat = () => {
    if (isConsulting && currentSessionId) {
      Modal.confirm({
        title: <div className="text-center w-full font-semibold text-gray-800">正在聊天中</div>,
        content: (
          <div className="text-center w-full pb-2 text-gray-500 text-sm">
            开始新对话将结束当前聊天并保存记录。
          </div>
        ),
        okText: '结束对话',
        cancelText: '取消',
        icon: null,
        style: { width: 340, borderRadius: 12 },
        onOk: async () => {
          try {
            await completeSession(currentSessionId);
            generateSummaryForSession(currentSessionId).catch(() => {});
            resetConversation();
          } catch {
            resetConversation();
          }
          router.push('/c/new');
        },
      });
      return;
    }
    resetConversation();
    router.push('/c/new');
  };

  const displayName = nickname || userName;
  const greeting = getTimeGreeting();

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      {/* 顶部栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 md:px-10 py-4 bg-white border-b border-gray-100">
        <Logo />
        <div className="flex items-center gap-3">
          <span className="text-sm text-gray-500 hidden md:inline">
            {greeting}
          </span>
          {/* 头像+昵称整体，点击打开设置 */}
          <button
            onClick={() => setSettingsVisible(true)}
            className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl hover:bg-gray-50 transition-colors"
          >
            <Avatar size={32} className="bg-indigo-100 text-indigo-600 ring-2 ring-white shadow-sm">
              {avatar ? (
                <img src={avatar} alt={displayName} />
              ) : (
                displayName[0]?.toUpperCase() || 'U'
              )}
            </Avatar>
            <span className="text-sm font-medium text-gray-800 hidden md:inline">{displayName}</span>
          </button>
        </div>
      </div>

      {/* 设置面板 */}
      <SettingsPanel
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        nickname={nickname || ''}
        avatar={avatar || ''}
        isAdmin={isAdmin}
      />

      {/* 主内容 — 双栏 */}
      <div className="flex-1 overflow-hidden flex justify-center px-6 md:px-10 py-6 md:py-8 gap-6 md:gap-8">
        {/* 左栏：新对话 + 快捷功能 */}
        <div className="w-[300px] flex-shrink-0 flex-col gap-3 hidden md:flex">
          {/* 新对话卡片 */}
          <div
            onClick={handleNewChat}
            className="relative bg-gradient-to-br from-indigo-500 via-purple-500 to-purple-600 rounded-2xl p-6 cursor-pointer transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl hover:shadow-indigo-500/25 active:scale-[0.97] overflow-hidden aspect-square flex flex-col justify-end group"
          >
            {/* 光晕背景 */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-white/5" />
            {/* 装饰元素 */}
            <div className="absolute -top-12 -right-12 w-40 h-40 rounded-full bg-white/[0.07] blur-sm" />
            <div className="absolute top-1/3 -right-6 w-20 h-20 rounded-full bg-purple-400/20 blur-md" />
            <div className="absolute -bottom-10 -left-10 w-28 h-28 rounded-full bg-indigo-400/10 blur-sm" />
            {/* 微光扫过动画 */}
            <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-700 bg-gradient-to-r from-transparent via-white/[0.08] to-transparent translate-x-[-100%] group-hover:translate-x-[100%]" style={{ transition: 'opacity 0.7s, transform 1s' }} />
            {/* 内容 */}
            <div className="relative z-10">
              <div className="w-[52px] h-[52px] rounded-2xl bg-white/15 backdrop-blur-md border border-white/20 flex items-center justify-center text-white mb-5 group-hover:bg-white/20 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-white mb-1.5">开始新对话</h3>
              <p className="text-sm text-white/60 font-light">说说你现在的感受，我在听</p>
            </div>
          </div>

          {/* 快捷功能 */}
          <div className="flex flex-col gap-1 flex-1">
            {QUICK_ACTIONS.map((action) => (
              <Link
                key={action.key}
                href={action.path}
                className={`flex items-center gap-3.5 px-4 py-3 bg-white rounded-2xl cursor-pointer transition-all hover:shadow-md hover:translate-x-0.5 active:scale-[0.98] border border-transparent ${action.hoverBorder} flex-1 min-h-0`}
              >
                <div className={`w-[38px] h-[38px] rounded-xl ${action.iconBg} ${action.iconColor} flex items-center justify-center flex-shrink-0`}>
                  {action.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">{action.label}</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">{action.desc}</div>
                </div>
                <span className="text-gray-300 text-base flex-shrink-0 transition-transform group-hover:translate-x-1">›</span>
              </Link>
            ))}

            {/* 设置入口 */}
            <button
              onClick={() => setSettingsVisible(true)}
              className="flex items-center gap-3.5 px-4 py-3 bg-white rounded-2xl cursor-pointer transition-all hover:shadow-md border border-transparent hover:border-gray-200 flex-1 min-h-0 w-full text-left"
            >
              <div className="w-[38px] h-[38px] rounded-xl bg-gray-50 text-gray-500 flex items-center justify-center flex-shrink-0">
                <span className="text-xl leading-none">⚙️</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-800">设置</div>
                <div className="text-[11px] text-gray-400 mt-0.5">个人偏好与管理</div>
              </div>
              <span className="text-gray-300 text-base flex-shrink-0">›</span>
            </button>
          </div>
        </div>

        {/* 右栏：历史对话 */}
        <div className="flex-1 max-w-[580px] min-w-0 flex flex-col">
          {/* 移动端新对话按钮 */}
          <div className="md:hidden mb-4">
            <button
              onClick={handleNewChat}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white rounded-2xl py-4 text-base font-medium shadow-lg active:scale-[0.98] transition-transform"
            >
              + 开始新对话
            </button>
          </div>

          <div className="flex items-center justify-between mb-3.5">
            <span className="text-sm font-medium text-gray-400">历史对话</span>
            <span className="text-xs bg-gray-100 text-gray-400 px-2 py-0.5 rounded-lg">
              {sessions.length} 条
            </span>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden bg-white rounded-xl scrollbar-hide">
            {sessions.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <div className="text-4xl mb-3">💭</div>
                <p className="text-sm">还没有对话记录</p>
                <p className="text-xs mt-1">开始第一次对话吧</p>
              </div>
            ) : (
              sessions.map((session) => (
                <SessionItem
                  key={session.id}
                  session={session}
                  hideSessionAction={hideSessionAction}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* 移动端快捷入口 */}
      <div className="md:hidden flex-shrink-0 px-4 pb-4">
        <div className="flex gap-2 overflow-x-auto scrollbar-hide">
          {QUICK_ACTIONS.map((action) => (
            <Link
              key={action.key}
              href={action.path}
              className="flex items-center gap-2 px-3 py-2 bg-white rounded-xl border border-gray-100 text-sm text-gray-600 whitespace-nowrap flex-shrink-0"
            >
              <span className={action.iconColor}>{action.icon}</span>
              {action.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

/** 单个会话项 */
function SessionItem({
  session,
  hideSessionAction,
}: {
  session: Session;
  hideSessionAction: (id: string) => Promise<void>;
}) {
  const [isHiding, setIsHiding] = useState(false);
  const { isConsulting, currentSessionId, resetConversation } = useChatStore();
  const router = useRouter();

  const handleClick = (e: React.MouseEvent) => {
    if (isConsulting && currentSessionId && currentSessionId !== session.id) {
      e.preventDefault();
      Modal.confirm({
        title: <div className="text-center w-full font-semibold text-gray-800">正在聊天中</div>,
        content: (
          <div className="text-center w-full pb-2 text-gray-500 text-sm">
            离开当前页面将结束本次对话并保存记录。
          </div>
        ),
        okText: '结束对话',
        cancelText: '继续聊天',
        icon: null,
        style: { width: 340, borderRadius: 12 },
        onOk: async () => {
          try {
            await completeSession(currentSessionId);
            generateSummaryForSession(currentSessionId).catch(() => {});
            resetConversation();
            router.push(`/c/${session.id}`);
          } catch {
            router.push(`/c/${session.id}`);
          }
        },
      });
      return;
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    Modal.confirm({
      title: <div className="text-center w-full">删除会话</div>,
      content: <div className="text-center w-full pb-2">确定要从列表中移除此会话吗？</div>,
      okText: '确定删除',
      cancelText: '取消',
      icon: null,
      style: { width: 320, borderRadius: 12 },
      onOk: async () => {
        setIsHiding(true);
        try {
          await hideSessionAction(session.id);
          ArcoMessage.success('已删除');
        } catch {
          ArcoMessage.error('操作失败');
        } finally {
          setIsHiding(false);
        }
      },
    });
  };

  return (
    <Link
      href={`/c/${session.id}`}
      prefetch={false}
      onClick={handleClick}
      className="group flex items-center gap-3.5 px-4 py-3.5 cursor-pointer transition-all hover:bg-[#fafbff] border-b border-gray-50 last:border-b-0"
    >
      {/* 情绪色圆点 */}
      <div className="w-[38px] h-[38px] rounded-full bg-gradient-to-br from-indigo-100 to-purple-100 flex items-center justify-center flex-shrink-0">
        <span className="text-base">💬</span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate mb-0.5">
          {session.title || '未命名对话'}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span>{session.relativeDate}</span>
          {session.status === 'COMPLETED' && (
            <span className="text-gray-400">已结束</span>
          )}
        </div>
      </div>

      {/* 删除按钮 */}
      <button
        onClick={handleDelete}
        disabled={isHiding}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-red-50 text-gray-300 hover:text-red-400 flex-shrink-0"
      >
        <IconDelete style={{ fontSize: 14 }} />
      </button>

      <span className="text-gray-300 text-base flex-shrink-0 group-hover:translate-x-0.5 transition-transform">›</span>
    </Link>
  );
}
