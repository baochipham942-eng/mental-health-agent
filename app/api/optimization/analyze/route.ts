import { NextRequest, NextResponse } from 'next/server';
import { runPromptOptimization } from '@/lib/actions/optimization';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    try {
        console.log('[API] Running prompt optimization analysis...');
        const { result, log } = await runPromptOptimization(7);

        return NextResponse.json({
            success: true,
            result,
            logId: log?.id,
        });
    } catch (error) {
        console.error('[API] Failed to run optimization:', error);
        return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
    }
}
