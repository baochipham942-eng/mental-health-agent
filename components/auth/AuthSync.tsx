'use client';

import { useEffect } from 'react';

type AuthSyncUser = {
    name?: string | null;
    nickname?: string | null;
    avatar?: string | null;
    phone?: string | null;
    quickLoginToken?: string | null;
};

export function AuthSync({ user }: { user?: AuthSyncUser | null }) {
    useEffect(() => {
        if (user?.quickLoginToken) {
            const quickLoginInfo = {
                nickname: user.nickname,
                avatar: user.avatar,
                phone: user.phone || user.name,
                token: user.quickLoginToken
            };
            localStorage.setItem('quick_login_info', JSON.stringify(quickLoginInfo));
        }
    }, [user]);

    return null; // This component does not render anything
}
