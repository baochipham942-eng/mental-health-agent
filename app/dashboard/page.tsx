import { getExerciseStats } from '@/lib/actions/exercise';
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { createNewSession } from '@/lib/actions/chat';

export default async function DashboardPage() {
    const session = await auth();
    if (!session?.user) {
        redirect('/login');
    }

    const stats = await getExerciseStats();

    // Server Action Wrapper for Button
    async function startNewChat() {
        'use server';
        await createNewSession();
    }

    return (
        <div className="space-y-6">
            <header>
                <h1 className="text-2xl font-bold text-gray-900">你好，{session.user.name || session.user.email?.split('@')[0]}！</h1>
                <p className="text-gray-600 mt-1">今天感觉怎么样？</p>
            </header>

            {/* Quick Actions */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <form action={startNewChat} className="h-full">
                    <button className="w-full h-full p-6 bg-gradient-to-br from-indigo-500 to-purple-600 text-white rounded-xl shadow-lg hover:shadow-xl transition-all flex flex-col items-start justify-between min-h-[140px]">
                        <span className="text-3xl bg-white/20 p-2 rounded-lg mb-2">💭</span>
                        <div>
                            <h3 className="text-lg font-bold">开始一次新的咨询</h3>
                            <p className="text-indigo-100 text-sm mt-1">随时倾诉，获得支持</p>
                        </div>
                    </button>
                </form>

                <div className="p-6 bg-white border border-gray-200 rounded-xl shadow-sm flex flex-col justify-between min-h-[140px]">
                    <div className="flex justify-between items-start">
                        <div>
                            <h3 className="font-bold text-gray-900">练习成就</h3>
                            <p className="text-sm text-gray-500 mt-1">你的自我疗愈之旅</p>
                        </div>
                        <span className="text-2xl">🌱</span>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <div className="text-2xl font-bold text-gray-900">{stats?.totalLogs || 0}</div>
                            <div className="text-xs text-gray-500">完成练习</div>
                        </div>
                        <div>
                            <div className="text-2xl font-bold text-green-600">+{stats?.avgImprovement || '0.0'}</div>
                            <div className="text-xs text-gray-500">平均情绪提升</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            {stats && stats.recentLogs.length > 0 && (
                <section className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
                    <h3 className="font-bold text-gray-900 mb-4">最近练习记录</h3>
                    <div className="space-y-4">
                        {stats.recentLogs.map((log: any, i: number) => (
                            <div key={i} className="flex items-center justify-between border-b last:border-0 border-gray-50 pb-4 last:pb-0">
                                <div>
                                    <p className="text-sm font-medium text-gray-900">完成练习</p>
                                    <p className="text-xs text-gray-500">{new Date(log.completedAt).toLocaleDateString()}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">心情改善</span>
                                    <span className={`text-sm font-bold ${(log.postMood - log.preMood) > 0 ? 'text-green-600' : 'text-gray-600'}`}>
                                        {(log.postMood - log.preMood) > 0 ? '+' : ''}{log.postMood - log.preMood}
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
            )}
        </div>
    );
}
