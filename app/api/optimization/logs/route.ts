import { NextRequest, NextResponse } from 'next/server';
import { getOptimizationLogs } from '@/lib/actions/optimization';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
    try {
        const logs = await getOptimizationLogs(20);
        return NextResponse.json({ logs });
    } catch (error) {
        console.error('[API] Failed to get optimization logs:', error);
        return NextResponse.json({ error: 'Failed to load logs' }, { status: 500 });
    }
}
