
import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { isAdminSession } from '@/lib/auth/admin';
import { PromptViewer } from './PromptViewer';
import { SUPPORT_PROMPT } from '@/lib/ai/support';
import { CRISIS_PROMPT } from '@/lib/ai/crisis';
import { QUICK_ANALYSIS_PROMPT } from '@/lib/ai/groq';
import {
    IDENTITY_PROMPT,
    CBT_PROTOCOL_PROMPT,
    INTERACTIVE_RULES_PROMPT,
    SAFETY_PROMPT,
    RAG_FORMATTING_PROMPT,
    EMOTION_ANALYSIS_PROMPT,
    ASSESSMENT_CONCLUSION_PROMPT,
    ASSESSMENT_CONCLUSION_STREAMING_PROMPT,
    ASSESSMENT_CONCLUSION_FIXER_PROMPT,
    SESSION_SUMMARY_PROMPT,
    EVALUATION_PROMPT,
} from '@/lib/ai/prompts';
import { PERSONA_MODIFIERS } from '@/lib/ai/persona-manager';
import { MEMORY_EXTRACTION_PROMPT, CONVERSATION_SUMMARIZATION_PROMPT } from '@/lib/memory/prompts';
import { EFT_VALIDATION_PROMPT } from '@/lib/ai/prompts-eft';
import { MENTORS } from '@/lib/ai/mentors/personas';
import { MBTI_PERSONAS } from '@/lib/ai/mbti/personas';
import { QUALITY_PROMPT } from '@/lib/ai/agents/quality-agent';
import { STATE_CLASSIFIER_PROMPT } from '@/lib/ai/agents/state-classifier';
import { SAFETY_AGENT_PROMPT } from '@/lib/ai/agents/safety-agent';
import { SAFETY_OBSERVER_PROMPT } from '@/lib/ai/agents/safety-observer';
import { WEAK_TRIAGE_PROMPT } from '@/lib/ai/agents/triage-agent';
import { CRISIS_FEW_SHOT_PROMPT, DEESCALATION_FEW_SHOT_PROMPT } from '@/lib/ai/crisis-classifier';
import { ASSESSMENT_LOOP_PROMPT } from '@/lib/ai/assessment';

import { Metadata } from 'next';

export const metadata: Metadata = {
    title: '系统 Prompt 看板',
};

export const dynamic = 'force-dynamic';

export default async function PromptsDashboardPage() {
    const session = await auth();
    const isAdmin = isAdminSession(session);

    if (!isAdmin) {
        redirect('/dashboard');
    }

    const promptsData = {
        // ① 路由层
        groq: QUICK_ANALYSIS_PROMPT,
        weakTriage: WEAK_TRIAGE_PROMPT,
        crisisFewShot: CRISIS_FEW_SHOT_PROMPT,
        // ② 核心对话
        support: SUPPORT_PROMPT,
        crisis: CRISIS_PROMPT,
        assessmentLoop: ASSESSMENT_LOOP_PROMPT,
        assessmentConclusion: ASSESSMENT_CONCLUSION_PROMPT,
        assessmentStreaming: ASSESSMENT_CONCLUSION_STREAMING_PROMPT,
        assessmentFixer: ASSESSMENT_CONCLUSION_FIXER_PROMPT,
        // ③ 基础组件
        identity: IDENTITY_PROMPT,
        cbtProtocol: CBT_PROTOCOL_PROMPT,
        interactiveRules: INTERACTIVE_RULES_PROMPT,
        safetyRules: SAFETY_PROMPT,
        ragFormatting: RAG_FORMATTING_PROMPT,
        // ④ 动态叠加
        persona: Object.entries(PERSONA_MODIFIERS).map(([mode, content]) => `### [${mode.toUpperCase()} MODE]\n${content}`).join('\n\n'),
        eft: EFT_VALIDATION_PROMPT,
        emotionAnalysis: EMOTION_ANALYSIS_PROMPT,
        // ⑤ Agent 层
        stateClassifier: STATE_CLASSIFIER_PROMPT,
        safetyAgent: SAFETY_AGENT_PROMPT,
        safetyObserver: SAFETY_OBSERVER_PROMPT,
        qualityCheck: QUALITY_PROMPT,
        deescalation: DEESCALATION_FEW_SHOT_PROMPT,
        // ⑥ 后台任务
        memory: MEMORY_EXTRACTION_PROMPT,
        summary: CONVERSATION_SUMMARIZATION_PROMPT,
        sessionSummary: SESSION_SUMMARY_PROMPT,
        evaluation: EVALUATION_PROMPT,
        // ⑦ 实验室
        mentors: MENTORS.map(m => `### ${m.name} (${m.title})\n\n**开场白**：${m.openingMessage}\n\n**系统提示词**：\n${m.systemPrompt}`).join('\n\n---\n\n'),
        mbti: MBTI_PERSONAS.map(p => `### ${p.name} (${p.type})\n\n**开场白**：${p.probing_question}\n\n**系统提示词**：\n${p.systemPrompt}`).join('\n\n---\n\n'),
    };

    return (
        <div className="flex flex-col h-full">
            <div className="max-w-5xl mx-auto w-full p-6 flex flex-col h-full gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">系统 Prompt 看板</h1>
                    <p className="text-sm text-gray-500 mt-0.5">
                        实时查看系统核心提示词配置（共 {Object.keys(promptsData).length} 项）
                    </p>
                </div>
                <div className="flex-1 min-h-0">
                    <PromptViewer data={promptsData} />
                </div>
            </div>
        </div>
    );
}
