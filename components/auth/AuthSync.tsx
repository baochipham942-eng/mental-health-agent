'use client';

import { useSession } from 'next-auth/react';
import { useEffect } from 'react';

export function AuthSync() {
    const { data: session } = useSession();

    useEffect(() => {
        if (session?.user) {
            const user = session.user as any;
            if (user.quickLoginToken) {
                const quickLoginInfo = {
                    nickname: user.nickname,
                    avatar: user.avatar,
                    phone: user.phone || user.name, // Fallback to name if phone is missing, though phone should be there
                    token: user.quickLoginToken
                };
                localStorage.setItem('quick_login_info', JSON.stringify(quickLoginInfo));
                console.log('AuthSync: Synced user info to localStorage', quickLoginInfo.nickname);
            }
        }
    }, [session]);

    return null; // This component does not render anything
}
