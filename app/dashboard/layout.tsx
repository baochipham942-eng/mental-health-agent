
import { auth, signOut } from '@/auth';
import Link from 'next/link';
import { getSessionHistory, createNewSession } from '@/lib/actions/chat';

export const dynamic = 'force-dynamic';

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
                    <div className="mb-2 flex h-20 items-end justify-start rounded-md bg-indigo-600 p-4 md:h-20">
                        <div className="w-32 text-white md:w-40 font-bold text-xl">
                            心理树洞
                        </div>
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

                            <div className="flex-1 overflow-y-auto min-h-0">
                                <SidebarList />
                            </div>
                        </div>

                        <form
                            className="flex-shrink-0 mt-auto pt-2"
                            action={async () => {
                                'use server';
                                await signOut();
                            }}
                        >
                            <button className="flex h-[48px] w-full grow items-center justify-center gap-2 rounded-md bg-slate-50 p-3 text-sm font-medium hover:bg-red-50 hover:text-red-600 md:flex-none md:justify-start md:p-2 md:px-3">
                                🚪 退出登录 ({session?.user?.name || (session?.user as any)?.username})
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
            <div className="px-2 text-sm text-slate-500 italic text-center py-4">
                暂无历史会话
            </div>
        );
    }

    return (
        <ul className="space-y-1">
            {sessions.map((session: { id: string; title: string | null; createdAt: Date }) => (
                <li key={session.id}>
                    <Link
                        href={`/dashboard/${session.id}`}
                        className="flex h-[48px] grow items-center justify-start gap-2 rounded-md p-3 text-sm font-medium hover:bg-sky-50 hover:text-indigo-600 md:flex-none md:justify-start md:p-2 md:px-3 truncate"
                    >
                        💬 {session.title || '未命名对话'}
                        <span className="ml-auto text-xs text-slate-400">
                            {new Date(session.createdAt).toLocaleDateString()}
                        </span>
                    </Link>
                </li>
            ))}
        </ul>
    );
}
