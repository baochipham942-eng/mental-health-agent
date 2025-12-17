'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { authenticate } from '@/lib/actions/auth';

export default function LoginPage() {
    const [errorMessage, dispatch] = useFormState(authenticate, undefined);

    return (
        <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
            <div className="w-full max-w-sm space-y-8 rounded-2xl bg-white p-8 shadow-lg">
                <div className="text-center">
                    <h1 className="text-2xl font-bold tracking-tight text-slate-900">欢迎回来</h1>
                    <p className="mt-2 text-sm text-slate-600">请使用管理员分配的账号登录</p>
                </div>

                <form action={dispatch} className="space-y-6">
                    <div>
                        <label className="block text-sm font-medium text-slate-700" htmlFor="username">
                            账号
                        </label>
                        <input
                            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            id="username"
                            type="text"
                            name="username"
                            placeholder="例如: demo"
                            required
                        />
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700" htmlFor="password">
                            密码
                        </label>
                        <input
                            className="mt-1 block w-full rounded-md border border-slate-300 px-3 py-2 text-sm placeholder-slate-400 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            id="password"
                            type="password"
                            name="password"
                            placeholder="••••••"
                            required
                            minLength={6}
                        />
                    </div>

                    <div className="flex items-center" aria-live="polite" aria-atomic="true">
                        {errorMessage && (
                            <p className="text-sm text-red-500">❌ {errorMessage}</p>
                        )}
                    </div>

                    <LoginButton />
                </form>
            </div>
        </div>
    );
}

function LoginButton() {
    const { pending } = useFormStatus();

    return (
        <button
            className="flex w-full justify-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
            aria-disabled={pending}
        >
            {pending ? '登录中...' : '登录'}
        </button>
    );
}
