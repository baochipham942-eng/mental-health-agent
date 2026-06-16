import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { isAdminSession } from '@/lib/auth/admin';
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

    return (
        <div className="min-h-screen bg-gray-50 p-6">
            <div className="max-w-7xl mx-auto">
                <div className="mb-6">
                    <h1 className="text-2xl font-bold text-gray-900">危机管理</h1>
                    <p className="mt-1 text-sm text-gray-500">
                        查看和处理用户危机升级记录
                    </p>
                </div>

                {/* 危机记录表格 */}
                <CrisisTable />
            </div>
        </div>
    );
}
