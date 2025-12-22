'use client';

import { UserMenu } from './UserMenu';
import { useTransition } from 'react';

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
 */
export function UserMenuWrapper({ userName, nickname, avatar, isAdmin, signOutAction }: UserMenuWrapperProps) {
    const [isPending, startTransition] = useTransition();

    const handleSignOut = () => {
        startTransition(async () => {
            await signOutAction();
        });
    };

    return (
        <UserMenu
            userName={userName}
            nickname={nickname}
            avatar={avatar}
            isAdmin={isAdmin}
            onSignOut={handleSignOut}
        />
    );
}
