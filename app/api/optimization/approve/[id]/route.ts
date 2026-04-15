import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { isAdmin as checkAdmin } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest, props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    try {
        // 验证是否是管理员
        const { admin: isAdmin, session } = await checkAdmin();

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const logId = params.id;

        // 更新日志为已应用
        await prisma.promptOptimizationLog.update({
            where: { id: logId },
            data: {
                appliedAt: new Date(),
                appliedBy: session?.user?.name || 'admin',
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Failed to approve optimization:', error);
        return NextResponse.json({ error: 'Failed to approve' }, { status: 500 });
    }
}
