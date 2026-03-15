import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { isAdminSession } from '@/lib/auth/admin';
import { prisma } from '@/lib/db/prisma';
import { CrisisTable } from './CrisisTable';

export const dynamic = 'force-dynamic';

/**
 * 危机管理仪表盘 - 查看和处理危机升级记录
 */
export default async function CrisisDashboardPage() {
    const session = await auth();

    if (!session?.user) {
        redirect('/login');
    }

    // 管理员权限检查
    const isAdmin = isAdminSession(session);

    if (!isAdmin) {
        redirect('/dashboard');
    }

    const escalations = await prisma.crisisEscalation.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
            user: {
                select: { id: true, username: true, nickname: true },
            },
        },
        take: 100,
    });

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">危机管理</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        查看和处理用户危机升级记录
                    </p>
                </div>

                {/* 统计卡片 */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                    <StatCard
                        label="待处理"
                        count={escalations.filter(e => e.status === 'PENDING').length}
                        color="red"
                    />
                    <StatCard
                        label="已确认"
                        count={escalations.filter(e => e.status === 'ACKNOWLEDGED').length}
                        color="yellow"
                    />
                    <StatCard
                        label="已解决"
                        count={escalations.filter(e => e.status === 'RESOLVED').length}
                        color="green"
                    />
                    <StatCard
                        label="总计"
                        count={escalations.length}
                        color="gray"
                    />
                </div>

                {/* 危机记录表格 */}
                <CrisisTable escalations={JSON.parse(JSON.stringify(escalations))} />
            </div>
        </div>
    );
}

function StatCard({ label, count, color }: { label: string; count: number; color: string }) {
    const colorMap: Record<string, string> = {
        red: 'bg-red-50 text-red-700 border-red-200',
        yellow: 'bg-yellow-50 text-yellow-700 border-yellow-200',
        green: 'bg-green-50 text-green-700 border-green-200',
        gray: 'bg-gray-50 text-gray-700 border-gray-200',
    };

    return (
        <div className={`rounded-lg border p-4 ${colorMap[color]}`}>
            <p className="text-sm font-medium">{label}</p>
            <p className="text-3xl font-bold mt-1">{count}</p>
        </div>
    );
}
