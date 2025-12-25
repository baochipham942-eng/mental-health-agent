'use client';

import { useState, useEffect } from 'react';
import { Modal, Message, Spin } from '@arco-design/web-react';
import { IconCheck } from '@arco-design/web-react/icon';
import { USER_PROFILES } from '@/lib/constants/userProfiles';

interface ProfileEditModalProps {
    visible: boolean;
    onClose: () => void;
    currentNickname?: string;
    currentAvatar?: string;
    onSuccess?: (nickname: string, avatar: string) => void;
}

/**
 * 用户资料编辑弹窗
 * 支持头像选择和昵称修改
 */
export function ProfileEditModal({
    visible,
    onClose,
    currentNickname = '',
    currentAvatar = '',
    onSuccess
}: ProfileEditModalProps) {
    const [selectedAvatar, setSelectedAvatar] = useState(currentAvatar);
    const [nickname, setNickname] = useState(currentNickname);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // 当弹窗打开时，重置为当前值
    useEffect(() => {
        if (visible) {
            setSelectedAvatar(currentAvatar);
            setNickname(currentNickname);
            setError(null);
        }
    }, [visible, currentAvatar, currentNickname]);

    const handleSave = async () => {
        // 检查是否有修改
        if (selectedAvatar === currentAvatar && nickname === currentNickname) {
            onClose();
            return;
        }

        // 基础验证
        const trimmedNickname = nickname.trim();
        if (!trimmedNickname) {
            setError('昵称不能为空');
            return;
        }
        if (trimmedNickname.length > 20) {
            setError('昵称不能超过20个字符');
            return;
        }

        setLoading(true);
        setError(null);

        try {
            const updateData: { nickname?: string; avatar?: string } = {};

            if (nickname !== currentNickname) {
                updateData.nickname = trimmedNickname;
            }
            if (selectedAvatar !== currentAvatar) {
                updateData.avatar = selectedAvatar;
            }

            const response = await fetch('/api/user/profile', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(updateData)
            });

            const data = await response.json();

            if (!response.ok) {
                setError(data.error || '更新失败');
                return;
            }

            Message.success('资料更新成功');
            onSuccess?.(data.user.nickname, data.user.avatar);
            onClose();

            // 刷新页面以更新 session
            window.location.reload();
        } catch (err) {
            console.error('Failed to update profile:', err);
            setError('网络错误，请稍后重试');
        } finally {
            setLoading(false);
        }
    };

    const hasChanges = selectedAvatar !== currentAvatar || nickname !== currentNickname;

    return (
        <Modal
            visible={visible}
            onCancel={onClose}
            title={null}
            footer={null}
            closable={!loading}
            maskClosable={!loading}
            style={{ maxWidth: 420 }}
            wrapClassName="profile-edit-modal"
        >
            <div className="py-2">
                {/* 标题 */}
                <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">
                    编辑个人资料
                </h2>

                {/* 头像选择区 */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                        选择头像
                    </label>
                    <div className="grid grid-cols-4 gap-3">
                        {USER_PROFILES.map((profile) => (
                            <button
                                key={profile.id}
                                onClick={() => setSelectedAvatar(profile.avatar)}
                                disabled={loading}
                                className={`
                                    relative p-1 rounded-xl transition-all duration-200
                                    ${selectedAvatar === profile.avatar
                                        ? 'ring-2 ring-indigo-500 ring-offset-2 bg-indigo-50'
                                        : 'hover:bg-gray-50 hover:ring-2 hover:ring-gray-200'
                                    }
                                    ${loading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
                                `}
                                title={profile.trait}
                            >
                                <div className="aspect-square rounded-lg overflow-hidden bg-white shadow-sm">
                                    <img
                                        src={profile.avatar}
                                        alt={profile.trait}
                                        className="w-full h-full object-cover"
                                    />
                                </div>
                                {selectedAvatar === profile.avatar && (
                                    <div className="absolute -top-1 -right-1 w-5 h-5 bg-indigo-500 rounded-full flex items-center justify-center shadow-md">
                                        <IconCheck style={{ fontSize: 12, color: 'white' }} />
                                    </div>
                                )}
                                <p className="text-xs text-gray-500 text-center mt-1 truncate">
                                    {profile.trait}
                                </p>
                            </button>
                        ))}
                    </div>
                </div>

                {/* 昵称输入区 */}
                <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                        昵称
                    </label>
                    <div className="relative">
                        <input
                            type="text"
                            value={nickname}
                            onChange={(e) => {
                                setNickname(e.target.value);
                                setError(null);
                            }}
                            disabled={loading}
                            maxLength={20}
                            placeholder="请输入昵称"
                            className={`
                                w-full px-4 py-3 rounded-xl border text-gray-900
                                transition-colors duration-200
                                focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent
                                ${error ? 'border-red-300 bg-red-50' : 'border-gray-200 bg-gray-50'}
                                ${loading ? 'opacity-50 cursor-not-allowed' : ''}
                            `}
                        />
                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-gray-400">
                            {nickname.length}/20
                        </span>
                    </div>
                    {error && (
                        <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
                            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                            </svg>
                            {error}
                        </p>
                    )}
                </div>

                {/* 操作按钮 */}
                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 px-4 py-3 rounded-xl border border-gray-200 text-gray-700 font-medium
                            hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        取消
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={loading || !hasChanges}
                        className={`
                            flex-1 px-4 py-3 rounded-xl font-medium transition-all duration-200
                            flex items-center justify-center gap-2
                            ${hasChanges
                                ? 'bg-indigo-500 text-white hover:bg-indigo-600 shadow-md hover:shadow-lg'
                                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            }
                            disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                    >
                        {loading ? (
                            <>
                                <Spin size={16} />
                                <span>保存中...</span>
                            </>
                        ) : (
                            '保存'
                        )}
                    </button>
                </div>
            </div>
        </Modal>
    );
}
