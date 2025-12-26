
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { PromptViewer } from './PromptViewer';
import { SUPPORT_PROMPT } from '@/lib/ai/support';
import { CRISIS_PROMPT } from '@/lib/ai/crisis';
import { QUICK_ANALYSIS_PROMPT } from '@/lib/ai/groq';
import { ASSESSMENT_CONCLUSION_PROMPT } from '@/lib/ai/prompts';

export const dynamic = 'force-dynamic';

export default async function PromptsDashboardPage() {
    const session = await auth();
    const isAdmin = session?.user?.name === 'demo';

    if (!isAdmin) {
        redirect('/dashboard');
    }

    const promptsData = {
        support: SUPPORT_PROMPT,
        crisis: CRISIS_PROMPT,
        groq: QUICK_ANALYSIS_PROMPT,
        assessment: ASSESSMENT_CONCLUSION_PROMPT
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <header className="flex-none px-6 py-4 bg-white border-b border-slate-200">
                <div className="flex items-center justify-between max-w-5xl mx-auto">
                    <div>
                        <h1 className="text-xl font-bold text-slate-800">系统 Prompt 看板</h1>
                        <p className="text-sm text-slate-500 mt-1">
                            实时查看系统核心提示词配置 (仅管理员可见)
                        </p>
                    </div>
                </div>
            </header>

            <main className="flex-1 overflow-hidden">
                <div className="h-full max-w-5xl mx-auto p-6">
                    <PromptViewer data={promptsData} />
                </div>
            </main>
        </div>
    );
}
