
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { PromptViewer } from './PromptViewer';
import { SUPPORT_PROMPT } from '@/lib/ai/support';
import { CRISIS_PROMPT } from '@/lib/ai/crisis';
import { QUICK_ANALYSIS_PROMPT } from '@/lib/ai/groq';
import { ASSESSMENT_CONCLUSION_PROMPT } from '@/lib/ai/prompts';
import { PERSONA_MODIFIERS } from '@/lib/ai/persona-manager';
import { MEMORY_EXTRACTION_PROMPT, CONVERSATION_SUMMARIZATION_PROMPT } from '@/lib/memory/prompts';
import { EFT_VALIDATION_PROMPT } from '@/lib/ai/prompts-eft';
import { MENTORS } from '@/lib/ai/mentors/personas';
import { MBTI_PERSONAS } from '@/lib/ai/mbti/personas';

import { Metadata } from 'next';

export const metadata: Metadata = {
    title: '系统 Prompt 看板',
};

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
        assessment: ASSESSMENT_CONCLUSION_PROMPT,
        persona: Object.entries(PERSONA_MODIFIERS).map(([mode, content]) => `### [${mode.toUpperCase()} MODE]\n${content}`).join('\n\n'),
        memory: MEMORY_EXTRACTION_PROMPT,
        eft: EFT_VALIDATION_PROMPT,
        summary: CONVERSATION_SUMMARIZATION_PROMPT,
        mentors: MENTORS.map(m => `### ${m.name} (${m.title})\n\n**开场白**：${m.openingMessage}\n\n**系统提示词**：\n${m.systemPrompt}`).join('\n\n---\n\n'),
        mbti: MBTI_PERSONAS.map(p => `### ${p.name} (${p.type})\n\n**开场白**：${p.probing_question}\n\n**系统提示词**：\n${p.systemPrompt}`).join('\n\n---\n\n'),
    };

    return (
        <div className="flex flex-col h-full bg-slate-50">
            <header className="flex-none px-6 py-4 bg-white border-b border-slate-200 hidden md:block">
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
