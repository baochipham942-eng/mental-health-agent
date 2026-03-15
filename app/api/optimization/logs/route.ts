import { NextRequest, NextResponse } from 'next/server';
import { getOptimizationLogs } from '@/lib/actions/optimization';
import { isAdmin } from '@/lib/auth/admin';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const { admin } = await isAdmin();
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const logs = await getOptimizationLogs(20);
        return NextResponse.json({ logs });
    } catch (error) {
        console.error('[API] Failed to get optimization logs:', error);
        return NextResponse.json({ error: 'Failed to load logs' }, { status: 500 });
    }
}
