
import { auth, signOut } from '@/auth';
import Link from 'next/link';
import { getSessionHistory, createNewSession } from '@/lib/actions/chat';

export const dynamic = 'force-dynamic';

// Helper function to format date as relative time
function formatRelativeDate(date: Date): string {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    const inputDate = new Date(date);
    const inputDateOnly = new Date(inputDate.getFullYear(), inputDate.getMonth(), inputDate.getDate());

    if (inputDateOnly.getTime() === today.getTime()) {
        return '今天';
    } else if (inputDateOnly.getTime() === yesterday.getTime()) {
        return '昨天';
    } else {
        return `${inputDate.getMonth() + 1}月${inputDate.getDate()}日`;
    }
}

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const session = await auth();

    return (
        <div className="flex h-screen flex-col md:flex-row md:overflow-hidden bg-slate-50">
            <div className="w-full flex-none md:w-64 bg-white border-r border-slate-200">
                <div className="flex h-full flex-col px-3 py-4 md:px-2">
                    {/* Sidebar Header - Clean Design */}
                    <div className="mb-4 px-2">
                        <div className="flex items-center gap-2 py-3">
                            <span
                                className="text-2xl animate-pulse"
                                style={{ animation: 'float 3s ease-in-out infinite' }}
                            >🌳</span>
                            <div>
                                <h1 className="font-bold text-lg text-gray-800">心理树洞</h1>
                                <p className="text-xs text-gray-500">倾诉你的心声</p>
                            </div>
                        </div>
                        <div className="border-b border-slate-200"></div>
                    </div>

                    <div className="flex grow flex-col min-h-0 space-y-2 overflow-hidden">
                        <div className="flex flex-col min-h-0 mt-4 grow">
                            <form action={createNewSession}>
                                <button className="flex w-full h-[48px] items-center justify-center gap-2 rounded-md bg-slate-100 p-3 text-sm font-medium hover:bg-sky-100 hover:text-indigo-600 md:flex-none md:justify-start md:p-2 md:px-3 flex-shrink-0">
                                    ➕ 新咨询
                                </button>
                            </form>

                            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mt-6 mb-2 px-2 flex-shrink-0">
                                历史记录
                            </div>

                            <div className="flex-1 overflow-y-auto min-h-0 pr-1">
                                <SidebarList />
                            </div>
                        </div>

                        {/* Separator */}
                        <div className="border-t border-slate-200 my-2"></div>

                        <form
                            className="flex-shrink-0 mt-auto pt-2"
                            action={async () => {
                                'use server';
                                await signOut();
                            }}
                        >
                            <button className="flex h-[48px] w-full grow items-center justify-center gap-2 rounded-md bg-slate-50 p-3 text-sm font-medium hover:bg-red-50 hover:text-red-600 md:flex-none md:justify-start md:p-2 md:px-3">
                                🚪 退出登录
                            </button>
                        </form>
                    </div>
                </div>
            </div>
            <div className="flex-grow p-6 md:overflow-y-auto md:p-12">{children}</div>
        </div>
    );
}

async function SidebarList() {
    const sessions = await getSessionHistory();

    if (sessions.length === 0) {
        return (
            <div className="px-3 py-6 text-center">
                <div className="text-2xl mb-2">💭</div>
                <p className="text-sm text-slate-500">还没有对话记录</p>
                <p className="text-xs text-slate-400 mt-1">点击上方“新咨询”开始</p>
            </div>
        );
    }

    return (
        <ul className="space-y-1">
            {sessions.map((session: { id: string; title: string | null; createdAt: Date }) => (
                <li key={session.id}>
                    <Link
                        href={`/dashboard/${session.id}`}
                        className="flex items-center gap-2 rounded-md p-2.5 text-sm font-medium hover:bg-sky-50 hover:text-indigo-600 transition-colors group"
                    >
                        <span className="flex-1 truncate">💬 {session.title || '未命名对话'}</span>
                        <span className="text-xs text-slate-400 group-hover:text-indigo-400 flex-shrink-0">
                            {formatRelativeDate(session.createdAt)}
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
