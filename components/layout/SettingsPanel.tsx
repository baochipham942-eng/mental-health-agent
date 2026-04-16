'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Modal, Message } from '@arco-design/web-react';
import { IconCheck } from '@arco-design/web-react/icon';
import { signOut } from 'next-auth/react';
import { THERAPIST_PROFILES } from '@/lib/ai/persona/therapist-profiles';
import { USER_PROFILES } from '@/lib/constants/userProfiles';
import { MOOD_THEMES, applyMoodColor } from '@/lib/mood-theme';

interface SettingsPanelProps {
  visible: boolean;
  onClose: () => void;
  nickname?: string;
  avatar?: string;
  isAdmin?: boolean;
  onProfileUpdate?: (nickname: string, avatar: string) => void;
}

type SettingsTab = 'profile' | 'theme' | 'chat-style' | 'privacy' | 'admin';

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

  // Theme state
  const [selectedTheme, setSelectedTheme] = useState<string>('');
  const [originalTheme, setOriginalTheme] = useState<string>('');

  // Reset on open
  React.useEffect(() => {
    if (visible) {
      setEditNickname(nickname);
      setEditAvatar(avatar);
      // 读取当前主题
      const savedMood = localStorage.getItem('onboardingMood') || 'default';
      setSelectedTheme(savedMood);
      setOriginalTheme(savedMood);
    }
  }, [visible, nickname, avatar]);

  const tabs: { key: SettingsTab; label: string; icon: React.ReactNode; adminOnly?: boolean }[] = [
    {
      key: 'profile',
      label: '个人资料',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4" />
          <path d="M20 21a8 8 0 1 0-16 0" />
        </svg>
      ),
    },
    {
      key: 'theme',
      label: '主题色',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 2a7 7 0 0 0 0 14 3.5 3.5 0 0 1 0 7 10 10 0 0 0 0-20z" fill="currentColor" opacity="0.15" />
          <circle cx="8" cy="9" r="1.5" fill="currentColor" />
          <circle cx="15" cy="8" r="1.5" fill="currentColor" />
          <circle cx="16" cy="13" r="1.5" fill="currentColor" />
          <circle cx="10" cy="15" r="1.5" fill="currentColor" />
        </svg>
      ),
    },
    {
      key: 'chat-style',
      label: '聊天风格',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21a9 9 0 1 0-9-9c0 1.5.4 2.9 1 4.2L3 21l4.8-1a9 9 0 0 0 4.2 1z" />
          <path d="M8 12h.01" /><path d="M12 12h.01" /><path d="M16 12h.01" />
        </svg>
      ),
    },
    {
      key: 'privacy',
      label: '隐私与数据',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 2l7 4v6c0 5.25-3.5 8.75-7 10-3.5-1.25-7-4.75-7-10V6l7-4z" />
          <path d="M9 12l2 2 4-4" />
        </svg>
      ),
    },
    ...(isAdmin
      ? [
          {
            key: 'admin' as SettingsTab,
            label: '管理员',
            icon: (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
                <circle cx="12" cy="12" r="3" />
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

  const handleSaveTheme = () => {
    if (selectedTheme && selectedTheme !== originalTheme) {
      localStorage.setItem('onboardingMood', selectedTheme);
      const theme = MOOD_THEMES[selectedTheme];
      if (theme) applyMoodColor(theme.color);
      setOriginalTheme(selectedTheme);
      Message.success('主题已更新');
    }
  };

  const profileHasChanges = editNickname.trim() !== nickname || editAvatar !== avatar;
  const themeHasChanges = selectedTheme !== originalTheme;

  // 当前 tab 是否有保存按钮 + 对应的 handler 和状态
  const getSaveAction = () => {
    switch (activeTab) {
      case 'profile':
        return profileHasChanges
          ? { label: saving ? '保存中...' : '保存修改', onClick: handleSaveProfile, disabled: saving }
          : { label: '保存修改', onClick: () => {}, disabled: true };
      case 'theme':
        return themeHasChanges
          ? { label: '保存主题', onClick: handleSaveTheme, disabled: false }
          : { label: '保存主题', onClick: () => {}, disabled: true };
      default:
        return null;
    }
  };

  const saveAction = getSaveAction();

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      title={null}
      footer={null}
      closable={false}
      style={{ width: 680, maxWidth: '95vw' }}
      alignCenter
      unmountOnExit
      wrapClassName="settings-panel-modal"
    >
      <div className="flex h-[min(580px,75vh)]">
        {/* 左侧标签栏 */}
        <div className="w-[180px] border-r border-gray-100 pr-2 py-4 shrink-0 flex flex-col">
          <h2 className="text-lg font-bold text-gray-900 px-3 mb-4">设置</h2>
          <nav aria-label="设置导航" className="space-y-0.5 flex-1">
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
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            退出登录
          </button>
        </div>

        {/* 右侧内容区 */}
        <div className="flex-1 pl-6 py-4 pr-2 flex flex-col relative">
          {/* 关闭按钮 */}
          <button
            onClick={onClose}
            aria-label="关闭设置"
            className="absolute top-4 right-4 p-1.5 rounded-lg text-gray-300 hover:text-gray-500 hover:bg-gray-100 transition-colors z-10"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>

          {/* 可滚动内容区域 */}
          <div className="flex-1 overflow-y-auto scrollbar-hide pr-2">
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
                  <div className="grid grid-cols-4 gap-3 p-1">
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
                        <div className="aspect-square rounded-lg overflow-hidden bg-white shadow-xs">
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
                    aria-label="昵称"
                    className="w-full px-4 py-2.5 rounded-xl border border-gray-200 bg-gray-50 text-gray-900 text-sm
                      focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors"
                  />
                </div>
              </div>
            )}

            {/* 主题色 */}
            {activeTab === 'theme' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-semibold text-gray-900 mb-1">主题色</h3>
                  <p className="text-xs text-gray-400">选择你喜欢的色调氛围，页面配色会随之变化</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {([
                    { key: 'rain', label: '心情不太好', hint: '沉静蓝灰' },
                    { key: 'ocean', label: '压力有点大', hint: '深海蔚蓝' },
                    { key: 'autumn', label: '想理清思路', hint: '暖秋琥珀' },
                    { key: 'spring', label: '随便聊聊', hint: '柔粉暖阳' },
                  ] as const).map((card) => {
                    const theme = MOOD_THEMES[card.key];
                    const isSelected = selectedTheme === card.key;
                    return (
                      <button
                        key={card.key}
                        onClick={() => setSelectedTheme(card.key)}
                        className={`relative text-left p-4 rounded-xl border transition-all duration-200
                          ${isSelected
                            ? 'border-indigo-300 ring-1 ring-indigo-200'
                            : 'border-gray-150 hover:border-gray-300'
                          }`}
                        style={{
                          background: isSelected ? theme.bgPage : undefined,
                        }}
                      >
                        <div className="flex items-center gap-2.5 mb-1.5">
                          <div
                            className="w-5 h-5 rounded-full shrink-0"
                            style={{ backgroundColor: `rgb(${theme.color})` }}
                          />
                          <span className="text-sm font-medium text-gray-800">{card.hint}</span>
                        </div>
                        <span className="text-xs text-gray-400">{card.label}</span>
                        {isSelected && (
                          <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center shadow-md">
                            <IconCheck style={{ fontSize: 12, color: 'white' }} />
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
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
                          : 'border-gray-150 bg-white hover:border-gray-300 hover:shadow-xs'
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
                    <Link href="/dashboard/memory" onClick={onClose} className="text-xs text-indigo-600 hover:text-indigo-700">管理</Link>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div>
                      <div className="text-sm font-medium text-gray-800">情绪数据</div>
                      <div className="text-xs text-gray-400 mt-0.5">你的情绪变化趋势记录</div>
                    </div>
                    <Link href="/dashboard/progress" onClick={onClose} className="text-xs text-indigo-600 hover:text-indigo-700">查看</Link>
                  </div>

                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl">
                    <div>
                      <div className="text-sm font-medium text-gray-800">压力自评</div>
                      <div className="text-xs text-gray-400 mt-0.5">快速了解你当前的情绪和压力状态</div>
                    </div>
                    <Link
                      href="/?trigger=压力自评"
                      onClick={onClose}
                      className="text-xs text-indigo-600 hover:text-indigo-700"
                    >
                      开始
                    </Link>
                  </div>

                  <div className="border-t border-gray-100 pt-4">
                    <p className="text-xs text-gray-400 leading-relaxed">
                      我们非常重视你的隐私。对话内容不会用于模型训练，你可以随时在「我的记忆」中查看和删除 AI 记住的信息。
                    </p>
                  </div>

                  {/* 安全资源 */}
                  <div className="border-t border-gray-100 pt-4 mt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2">安全资源</h4>
                    <div className="p-3 bg-blue-50 rounded-xl">
                      <p className="text-xs text-gray-600 leading-relaxed">
                        如果你或身边的人正在经历困难，可以拨打以下热线获得支持：
                      </p>
                      <div className="mt-2 space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-blue-600 font-medium">📞 全国心理援助热线</span>
                          <a href="tel:400-161-9995" className="text-xs text-blue-700 font-bold hover:underline">400-161-9995</a>
                          <span className="text-xs text-gray-400">（24小时）</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-blue-600 font-medium">📞 生命热线</span>
                          <a href="tel:400-821-1215" className="text-xs text-blue-700 font-bold hover:underline">400-821-1215</a>
                          <span className="text-xs text-gray-400">（24小时）</span>
                        </div>
                      </div>
                    </div>
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
                    <Link
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
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 底部保存按钮 — 固定在底部，与左侧退出登录对齐 */}
          {saveAction && (
            <div className="shrink-0 pt-3 border-t border-gray-100 mt-2">
              <button
                onClick={saveAction.onClick}
                disabled={saveAction.disabled}
                className={`px-6 py-2.5 rounded-xl text-sm font-medium transition-all
                  ${!saveAction.disabled
                    ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-xs'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
              >
                {saveAction.label}
              </button>
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
