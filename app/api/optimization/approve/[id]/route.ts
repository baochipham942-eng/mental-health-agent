import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db/prisma';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        // 验证是否是管理员
        const session = await auth();
        const isAdmin = session?.user?.name === 'demo' || (session?.user as any)?.phone === '15110203706' || session?.user?.name === '15110203706';

        if (!isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const logId = params.id;

        // 更新日志为已应用
        await prisma.promptOptimizationLog.update({
            where: { id: logId },
            data: {
                appliedAt: new Date(),
                appliedBy: session.user?.name || 'admin',
            },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('[API] Failed to approve optimization:', error);
        return NextResponse.json({ error: 'Failed to approve' }, { status: 500 });
    }
}
