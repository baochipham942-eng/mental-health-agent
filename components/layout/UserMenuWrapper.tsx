'use client';

import { UserMenu } from './UserMenu';
import { ProfileEditModal } from './ProfileEditModal';
import { useState, useTransition } from 'react';

interface UserMenuWrapperProps {
    userName?: string;
    nickname?: string;
    avatar?: string;
    isAdmin?: boolean;
    signOutAction: () => Promise<void>;
}

/**
 * UserMenu 包装器
 * 处理客户端调用 server action 的 signOut
 * 以及资料编辑弹窗的状态管理
 */
export function UserMenuWrapper({ userName, nickname, avatar, isAdmin, signOutAction }: UserMenuWrapperProps) {
    const [isPending, startTransition] = useTransition();
    const [showProfileModal, setShowProfileModal] = useState(false);

    const handleSignOut = () => {
        startTransition(async () => {
            await signOutAction();
        });
    };

    const handleEditProfile = () => {
        setShowProfileModal(true);
    };

    const handleProfileSuccess = (newNickname: string, newAvatar: string) => {
        // Profile updated, modal will trigger page reload
    };

    return (
        <>
            <UserMenu
                userName={userName}
                nickname={nickname}
                avatar={avatar}
                isAdmin={isAdmin}
                onSignOut={handleSignOut}
                onEditProfile={handleEditProfile}
            />
            <ProfileEditModal
                visible={showProfileModal}
                onClose={() => setShowProfileModal(false)}
                currentNickname={nickname}
                currentAvatar={avatar}
                onSuccess={handleProfileSuccess}
            />
        </>
    );
}
