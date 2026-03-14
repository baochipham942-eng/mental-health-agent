'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Modal, Message as ArcoMessage, Avatar } from '@arco-design/web-react';
import { IconDelete, IconBulb } from '@arco-design/web-react/icon';
import { useChatStore } from '@/store/chatStore';
import { completeSession } from '@/lib/actions/chat';
import { generateSummaryForSession } from '@/lib/actions/summary';
import { Logo } from '@/components/logo/Logo';
import { signOut } from 'next-auth/react';

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
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
        <polyline points="17 6 23 6 23 12" />
      </svg>
    ),
  },
  {
    key: 'memory',
    label: '我的记忆',
    desc: '对话记忆管理',
    path: '/dashboard/memory',
    iconBg: 'bg-violet-50',
    iconColor: 'text-violet-600',
    hoverBorder: 'hover:border-violet-200',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2a10 10 0 1 0 10 10H12V2z" />
        <path d="M20.5 7.5L12 12" />
      </svg>
    ),
  },
  {
    key: 'lab',
    label: '探索工坊',
    desc: '更多成长工具',
    path: '/dashboard/lab',
    iconBg: 'bg-cyan-50',
    iconColor: 'text-cyan-600',
    hoverBorder: 'hover:border-cyan-200',
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 3h6v7l4 8H5l4-8V3z" />
        <path d="M10 3h4" />
      </svg>
    ),
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
  const { isConsulting, currentSessionId, resetConversation } = useChatStore();

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
          window.location.href = '/c/new';
        },
      });
      return;
    }
    resetConversation();
    window.location.href = '/c/new';
  };

  const displayName = nickname || userName;
  const greeting = getTimeGreeting();

  return (
    <div className="h-full flex flex-col bg-[#F7F8FA]">
      {/* 顶部栏 */}
      <div className="flex-shrink-0 flex items-center justify-between px-6 md:px-10 py-5 bg-white border-b border-gray-100">
        <Logo />
        <div className="flex items-center gap-5">
          <span className="text-sm text-gray-500 hidden md:inline">
            {greeting}，<strong className="text-gray-800">{displayName}</strong>
          </span>
          {/* 用户头像 + 退出 */}
          <div className="relative group cursor-pointer">
            <Avatar size={34} className="bg-indigo-100 text-indigo-600 ring-2 ring-white shadow-sm">
              {avatar ? (
                <img src={avatar} alt={displayName} />
              ) : (
                displayName[0]?.toUpperCase() || 'U'
              )}
            </Avatar>
            <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-lg border border-gray-100 py-1 min-w-[120px] opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition-all z-50">
              <div className="absolute -top-1.5 right-4 w-3 h-3 bg-white border-l border-t border-gray-100 rotate-45" />
              <button
                onClick={() => signOut()}
                className="flex items-center gap-2 w-full px-4 py-2 text-sm text-gray-600 hover:text-red-500 hover:bg-red-50 transition-colors"
              >
                退出登录
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 主内容 — 双栏 */}
      <div className="flex-1 overflow-hidden flex justify-center px-6 md:px-10 py-6 md:py-8 gap-6 md:gap-8">
        {/* 左栏：新对话 + 快捷功能 */}
        <div className="w-[300px] flex-shrink-0 flex-col gap-3 hidden md:flex">
          {/* 新对话卡片 */}
          <div
            onClick={handleNewChat}
            className="relative bg-gradient-to-br from-indigo-500 to-purple-600 rounded-2xl p-6 cursor-pointer transition-all hover:-translate-y-0.5 hover:shadow-xl active:scale-[0.98] overflow-hidden aspect-square flex flex-col justify-end"
          >
            {/* 装饰圆 */}
            <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-white/[0.08]" />
            <div className="absolute -bottom-8 -left-8 w-24 h-24 rounded-full bg-white/[0.05]" />
            <div className="w-[52px] h-[52px] rounded-2xl bg-white/20 backdrop-blur-sm flex items-center justify-center text-2xl text-white mb-5">
              +
            </div>
            <h3 className="text-lg font-semibold text-white mb-1.5">开始新对话</h3>
            <p className="text-sm text-white/70 font-light">说说你现在的感受，我在听</p>
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

            {/* 管理员入口 */}
            {isAdmin && (
              <Link
                href="/dashboard/optimization"
                className="flex items-center gap-3.5 px-4 py-3 bg-white rounded-2xl cursor-pointer transition-all hover:shadow-md border border-transparent hover:border-amber-200 flex-1 min-h-0"
              >
                <div className="w-[38px] h-[38px] rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center flex-shrink-0">
                  <IconBulb style={{ fontSize: 20 }} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800">评测中心</div>
                  <div className="text-[11px] text-gray-400 mt-0.5">管理员</div>
                </div>
              </Link>
            )}
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
            <span className="text-emerald-500">已完成</span>
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
