'use client';

import { useState, useEffect } from 'react';
import { useFormState } from 'react-dom';
import { authenticate } from '@/lib/actions/auth';
import { registerUser } from '@/lib/actions/register';
import { Button, Input, Checkbox, Message, Avatar } from '@arco-design/web-react';
import { IconUser, IconLock, IconPhone, IconSafe } from '@arco-design/web-react/icon';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
    const router = useRouter();
    const [view, setView] = useState<'LOGIN' | 'REGISTER' | 'QUICK'>('LOGIN');

    // Quick Login State
    const [quickUser, setQuickUser] = useState<{ nickname: string; avatar: string; phone: string; token: string } | null>(null);

    // Form States
    const [loginError, dispatchLogin] = useFormState(authenticate, undefined);

    // Registration State
    const [isRegistering, setIsRegistering] = useState(false);

    // Load Quick Login Info on Mount
    useEffect(() => {
        const stored = localStorage.getItem('quick_login_info');
        if (stored) {
            try {
                const info = JSON.parse(stored);
                if (info && info.token) {
                    setQuickUser(info);
                    setView('QUICK');
                }
            } catch (e) {
                localStorage.removeItem('quick_login_info');
            }
        }
    }, []);

    // Effect to handle server-side login error
    useEffect(() => {
        if (loginError) {
            Message.error(loginError);
        }
    }, [loginError]);

    const handleQuickLogin = async () => {
        if (!quickUser) return;
        try {
            // Using the existing authenticate action but we need to pass token.
            // But authenticate checks form data. 
            // We need to inject the token into a FormData to reuse the action?
            // Auth.ts authorize handles credentials.
            // So we can use signIn('credentials', { quickLoginToken: ... }) via server action?
            // Actually `authenticate` action just calls `signIn`.

            const formData = new FormData();
            formData.append('quickLoginToken', quickUser.token);
            // We need a separate server action that calls signIn with token? 
            // Or just update `authenticate` to handle token if present in FormData.
            // Let's assume we updated `authenticate` or `lib/actions/auth.ts` to forward all data.
            // Wait, existing `authenticate` takes `formData`. 
            // `signIn` will take `Object.fromEntries(formData)`.
            // So if we append `quickLoginToken`, it should work if we update `authenticate` slightly or verify it passes everything.
            // Checked `lib/actions/auth.ts`: `await signIn('credentials', formData);` 
            // Yes, next-auth v5 signIn(..., formData) passes it through.

            await authenticate(undefined, formData);
        } catch (e) {
            console.error(e);
            Message.error('快捷登录已过期，请重新登录');
            setQuickUser(null);
            localStorage.removeItem('quick_login_info');
            setView('LOGIN');
        }
    };

    const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        setIsRegistering(true);
        const formData = new FormData(e.currentTarget);

        try {
            const result: any = await registerUser(undefined, formData);
            if (result.success && result.user) {
                Message.success('注册成功！');

                // Save to LocalStorage
                const userInfo = {
                    nickname: result.user.nickname,
                    avatar: result.user.avatar,
                    phone: result.user.username, // phone is username
                    token: result.user.quickLoginToken
                };
                localStorage.setItem('quick_login_info', JSON.stringify(userInfo));

                // Auto Login
                const loginData = new FormData();
                loginData.append('quickLoginToken', result.user.quickLoginToken);
                await authenticate(undefined, loginData);
            } else {
                Message.error(result.error || '注册失败');
            }
        } catch (error) {
            Message.error('注册发生错误');
        } finally {
            setIsRegistering(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-50 to-indigo-50 p-4">
            <div className="w-full max-w-sm bg-white rounded-2xl shadow-xl overflow-hidden">
                {/* Header Image/Logo Area */}
                <div className="bg-indigo-600 px-8 py-10 text-center relative overflow-hidden">
                    <div className="relative z-10">
                        <h1 className="text-2xl font-bold text-white tracking-wider">心灵树洞</h1>
                        <p className="text-indigo-100 text-sm mt-2 font-light">倾诉 · 疗愈 · 成长</p>
                    </div>
                </div>

                <div className="p-8">
                    {/* QUICK LOGIN VIEW */}
                    {view === 'QUICK' && quickUser && (
                        <div className="space-y-6 text-center animate-fade-in">
                            <div className="flex flex-col items-center">
                                <Avatar size={80} className="mb-3 text-3xl shadow-md border-4 border-indigo-50">
                                    {quickUser.avatar && (quickUser.avatar.startsWith('/') || quickUser.avatar.startsWith('http')) ? (
                                        <img src={quickUser.avatar} alt="Avatar" />
                                    ) : (
                                        quickUser.avatar
                                    )}
                                </Avatar>
                                <h3 className="text-xl font-bold text-gray-800">{quickUser.nickname}</h3>
                                <p className="text-gray-500 text-sm mt-1">{maskPhone(quickUser.phone)}</p>
                            </div>

                            <Button type="primary" long size="large" onClick={handleQuickLogin} className="rounded-xl h-12 text-base">
                                一键登录
                            </Button>

                            <div className="pt-2">
                                <Button type="text" size="small" className="text-gray-400 hover:text-gray-600" onClick={() => setView('LOGIN')}>
                                    切换账号
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* LOGIN VIEW */}
                    {view === 'LOGIN' && (
                        <div className="animate-fade-in">
                            <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">账号登录</h2>
                            <form action={dispatchLogin} className="space-y-4" id="loginForm">
                                <Input
                                    name="username"
                                    prefix={<IconUser />}
                                    placeholder="手机号 / 账号"
                                    className="h-12 rounded-xl bg-gray-50 border-gray-200"
                                    onPressEnter={() => {
                                        const form = document.getElementById('loginForm') as HTMLFormElement;
                                        form?.requestSubmit();
                                    }}
                                />
                                <Input.Password
                                    name="password"
                                    prefix={<IconLock />}
                                    placeholder="密码"
                                    className="h-12 rounded-xl bg-gray-50 border-gray-200"
                                    onPressEnter={() => {
                                        const form = document.getElementById('loginForm') as HTMLFormElement;
                                        form?.requestSubmit();
                                    }}
                                />

                                <Button type="primary" long size="large" htmlType="submit" className="rounded-xl h-12 text-base mt-2">
                                    登录
                                </Button>
                            </form>

                            <div className="mt-6 flex items-center justify-between text-sm">
                                <span className="text-gray-400">还没有账号？</span>
                                <Button type="text" className="px-0 text-indigo-600 font-medium" onClick={() => setView('REGISTER')}>
                                    立即注册
                                </Button>
                            </div>
                        </div>
                    )}

                    {/* REGISTER VIEW */}
                    {view === 'REGISTER' && (
                        <div className="animate-fade-in">
                            <h2 className="text-xl font-bold text-gray-900 mb-6 text-center">新用户注册</h2>
                            <form onSubmit={handleRegister} className="space-y-4" id="registerForm">
                                <Input
                                    name="phone"
                                    prefix={<IconPhone />}
                                    placeholder="手机号"
                                    className="h-12 rounded-xl bg-gray-50 border-gray-200"
                                    maxLength={11}
                                    onPressEnter={() => {
                                        // 聚焦到下一个输入框
                                        const passwordInput = document.querySelector('input[name="password"]') as HTMLInputElement;
                                        passwordInput?.focus();
                                    }}
                                />
                                <Input.Password
                                    name="password"
                                    prefix={<IconLock />}
                                    placeholder="设置密码 (6位以上)"
                                    className="h-12 rounded-xl bg-gray-50 border-gray-200"
                                    minLength={6}
                                    onPressEnter={() => {
                                        // 聚焦到邀请码输入框
                                        const inviteInput = document.querySelector('input[name="inviteCode"]') as HTMLInputElement;
                                        inviteInput?.focus();
                                    }}
                                />
                                <Input
                                    name="inviteCode"
                                    prefix={<IconSafe />}
                                    placeholder="邀请码"
                                    className="h-12 rounded-xl bg-gray-50 border-gray-200"
                                    maxLength={8}
                                    style={{ textTransform: 'uppercase' }}
                                    onPressEnter={() => {
                                        const form = document.getElementById('registerForm') as HTMLFormElement;
                                        form?.requestSubmit();
                                    }}
                                />

                                <Button
                                    type="primary"
                                    long
                                    size="large"
                                    htmlType="submit"
                                    loading={isRegistering}
                                    className="rounded-xl h-12 text-base mt-2"
                                >
                                    注册并登录
                                </Button>
                            </form>
                            <div className="mt-6 text-center">
                                <Button type="text" className="text-gray-500" onClick={() => setView('LOGIN')}>
                                    返回登录
                                </Button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function maskPhone(phone: string) {
    if (!phone || phone.length < 7) return phone;
    return phone.replace(/(\d{3})\d{4}(\d{4})/, '$1****$2');
}
