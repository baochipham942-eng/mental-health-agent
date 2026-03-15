'use client';

import React, { useState } from 'react';
import { Modal, Message } from '@arco-design/web-react';
import { IconCheck, IconUser } from '@arco-design/web-react/icon';
import { signOut } from 'next-auth/react';
import { THERAPIST_PROFILES } from '@/lib/ai/persona/therapist-profiles';
import { USER_PROFILES } from '@/lib/constants/userProfiles';

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  nickname?: string;
  avatar?: string;
  isAdmin?: boolean;
  onProfileUpdate?: (nickname: string, avatar: string) => void;
}

type SettingsTab = 'profile' | 'chat-style' | 'privacy' | 'admin';

export function SettingsPanel({
  visible,
  onClose,
  nickname = '',
  avatar = '',
  isAdmin = false,
  onProfileUpdate,
}: SettingsPanelProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  // Profile state
  const [editNickname, setEditNickname] = useState(nickname);
  const [editAvatar, setEditAvatar] = useState(avatar);
  const [saving, setSaving] = useState(false);

  // Chat style state
  const [selectedTherapist, setSelectedTherapist] = useState<string>('');

  // Reset on open
  React.useEffect(() => {
    if (visible) {
      setEditNickname(nickname);
      setEditAvatar(avatar);
    }
  }, [visible, nickname, avatar]);

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    {
      key: 'profile',
      label: '个人资料',
      icon: <IconUser style={{ fontSize: 18 }} />,
    },
    {
      key: 'chat-style',
      label: '聊天风格',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      ),
    },
    {
      key: 'privacy',
      label: '隐私与数据',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'admin' as SettingsTab,
            label: '管理员',
            icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            ),
            adminOnly: true,
          },
        ]
      : []),
  ];

  const handleSaveProfile = async () => {
    const trimmed = editNickname.trim();
    if (!trimmed) return;
    if (trimmed === nickname && editAvatar === avatar) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, string> = {};
      if (trimmed !== nickname) body.nickname = trimmed;
      if (editAvatar !== avatar) body.avatar = editAvatar;

      const res = await fetch('/api/user/profile', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        const data = await res.json();
        Message.success('资料已更新');
        onProfileUpdate?.(data.user.nickname, data.user.avatar);
        window.location.reload();
      } else {
        Message.error('更新失败');
      }
    } catch {
      Message.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const profileHasChanges = editNickname.trim() !== nickname || editAvatar !== avatar;

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      title={null}
      footer={null}
      closable={false}
      style={{ width: 680, maxWidth: '95vw', top: 60 }}
      unmountOnExit
      wrapClassName="settings-panel-modal"
    >
      <div className="flex h-[520px]">
        {/* 左侧标签栏 */}
        <div className="w-[180px] border-r border-gray-100 pr-2 py-4 flex-shrink-0 flex flex-col">
          <h2 className="text-lg font-bold text-gray-900 px-3 mb-4">设置</h2>
          <nav className="space-y-0.5 flex-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors
                  ${activeTab === tab.key
                    ? 'bg-indigo-50 text-indigo-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
              >
                <span className={activeTab === tab.key ? 'text-indigo-500' : 'text-gray-400'}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
          {/* 退出登录 */}
          <button
            onClick={() => {
              Modal.confirm({
                title: <div className="text-center w-full font-semibold text-gray-800">退出登录</div>,
                content: <div className="text-center w-full pb-2 text-gray-500 text-sm">确定要退出当前账号吗？</div>,
                okText: '确定退出',
                cancelText: '取消',
                icon: null,
                style: { width: 320, borderRadius: 12 },
                onOk: () => signOut(),
              });
            }}
            className="flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-red-500 hover:bg-red-50 transition-colors mt-2"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            退出登录
          </button>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 pl-6 py-4 pr-2 overflow-y-auto relative scrollbar-hide">
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* 个人资料 */}
          {activeTab === 'profile' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">个人资料</h3>
                <p className="text-xs text-gray-400">修改你的头像和昵称</p>
              </div>

              {/* 头像选择 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-3">头像</label>
                <div className="grid grid-cols-4 gap-3">
                  {USER_PROFILES.map((profile) => (
                    <button
                      key={profile.id}
                      onClick={() => setEditAvatar(profile.avatar)}
                      className={`relative p-1 rounded-xl transition-all duration-200
                        ${editAvatar === profile.avatar
                          ? 'ring-2 ring-indigo-500 ring-offset-2 bg-indigo-50'
                          : 'hover:bg-gray-50 hover:ring-2 hover:ring-gray-200'
                        }`}
                    >
                      <div className="aspect-square rounded-lg overflow-hidden bg-white shadow-sm">
                        <img src={profile.avatar} alt={profile.trait} className="w-full h-full object-cover" />
                      </div>
                      {editAvatar === profile.avatar && (
                        <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center shadow-md">
                          <IconCheck style={{ fontSize: 12, color: 'white' }} />
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* 昵称 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">昵称</label>
                <input
                  type="text"
                  value={editNickname}
                  onChange={(e) => setEditNickname(e.target.value)}
                  maxLength={20}
                  placeholder="请输入昵称"
                  className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm
                    focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                />
              </div>

              <button
                onClick={handleSaveProfile}
                disabled={saving || !profileHasChanges}
                className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${profileHasChanges
                    ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-sm'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
              >
                {saving ? '保存中...' : '保存修改'}
              </button>
            </div>
          )}

          {/* 聊天风格 */}
          {activeTab === 'chat-style' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">聊天风格</h3>
                <p className="text-xs text-gray-400">选择你喜欢的对话风格，下次新对话生效</p>
              </div>

              <div className="space-y-3">
                {THERAPIST_PROFILES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setSelectedTherapist(t.id)}
                    className={`w-full text-left p-4 rounded-xl border transition-all
                      ${selectedTherapist === t.id
                        ? 'border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200'
                        : 'border-gray-150 bg-white hover:border-gray-300 hover:shadow-sm'
                      }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{t.avatar}</span>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-gray-900">{t.name}</span>
                          {selectedTherapist === t.id && (
                            <span className="text-xs text-indigo-600 bg-indigo-100 px-2 py-0.5 rounded-full">当前</span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">{t.description}</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* 隐私与数据 */}
          {activeTab === 'privacy' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">隐私与数据</h3>
                <p className="text-xs text-gray-400">管理你的数据和隐私偏好</p>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="text-sm font-medium text-gray-800">对话记录</div>
                    <div className="text-xs text-gray-400 mt-0.5">你的所有对话内容仅你可见</div>
                  </div>
                  <span className="text-xs text-green-600 bg-green-50 px-2 py-1 rounded-full">已加密</span>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="text-sm font-medium text-gray-800">记忆数据</div>
                    <div className="text-xs text-gray-400 mt-0.5">AI 从对话中提取的关键信息</div>
                  </div>
                  <a href="/dashboard/memory" onClick={onClose} className="text-xs text-indigo-600 hover:text-indigo-700">管理</a>
                </div>

                <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                  <div>
                    <div className="text-sm font-medium text-gray-800">情绪数据</div>
                    <div className="text-xs text-gray-400 mt-0.5">你的情绪变化趋势记录</div>
                  </div>
                  <a href="/dashboard/progress" onClick={onClose} className="text-xs text-indigo-600 hover:text-indigo-700">查看</a>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <p className="text-xs text-gray-400 leading-relaxed">
                    我们非常重视你的隐私。对话内容不会用于模型训练，你可以随时在「我的记忆」中查看和删除 AI 记住的信息。
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* 管理员区域 */}
          {activeTab === 'admin' && isAdmin && (
            <div className="space-y-6">
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-1">管理员</h3>
                <p className="text-xs text-gray-400">系统管理功能</p>
              </div>

              <div className="space-y-2">
                {[
                  { label: '评测中心', desc: '查看和管理评测实验', href: '/dashboard/optimization', icon: '🚀' },
                  { label: '系统 Prompts', desc: '编辑系统提示词', href: '/dashboard/prompts', icon: '📝' },
                  { label: '用户管理', desc: '管理注册用户', href: '/dashboard/users', icon: '👥' },
                  { label: '邀请码管理', desc: '生成和管理邀请码', href: '/dashboard/invites', icon: '🎟️' },
                ].map((item) => (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={onClose}
                    className="flex items-center gap-3 p-3.5 rounded-xl hover:bg-gray-50 transition-colors group"
                  >
                    <span className="text-xl w-9 h-9 flex items-center justify-center bg-gray-50 rounded-lg group-hover:bg-white">{item.icon}</span>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-800">{item.label}</div>
                      <div className="text-xs text-gray-400 mt-0.5">{item.desc}</div>
                    </div>
                    <span className="text-gray-300 group-hover:text-gray-400 transition-colors">›</span>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
