import { NextRequest, NextResponse } from 'next/server';
import { runPromptOptimization } from '@/lib/actions/optimization';
import { isAdmin } from '@/lib/auth/admin';
import { runWithTrace, getCurrentTrace } from '@/lib/observability/trace-context';
import { updateTrace } from '@/lib/observability/langfuse';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
    return runWithTrace('optimization-analyze', {}, async () => {
    try {
        const { admin } = await isAdmin();
        if (!admin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.log('[API] Running prompt optimization analysis...');
        const { result, log } = await runPromptOptimization(7);

        // Langfuse trace metadata
        const reqTrace = getCurrentTrace()?.trace;
        if (reqTrace) {
            updateTrace(reqTrace, {
                metadata: {
                    logId: log?.id,
                    hasResult: !!result,
                },
            });
        }

        return NextResponse.json({
            success: true,
            result,
            logId: log?.id,
        });
    } catch (error) {
        console.error('[API] Failed to run optimization:', error);
        return NextResponse.json({ error: 'Analysis failed' }, { status: 500 });
    }
    }); // end runWithTrace
}
