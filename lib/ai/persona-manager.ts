
import { AssessmentReport } from '@prisma/client';

export type AdaptiveMode = 'guardian' | 'companion' | 'guide' | 'coach';

export const PERSONA_MODIFIERS: Record<AdaptiveMode, string> = {
    guardian: `
[DYNAMIC PERSONA: GUARDIAN MODE]
**Priority**: STABILIZATION & SAFETY.
**Context**: User is in high distress, crisis, or regression.
**Instructions**:
1. Tone: Slow, ultra-safe, warm, grounding.
2. Strategy: "Holding Space". Validate their pain 100%.
3. Constraint: Do NOT ask challenging questions. Do NOT push for change.
4. Keywords: "I'm here." "It's safe." "Take your time."
`,
    companion: `
[DYNAMIC PERSONA: COMPANION MODE]
**Priority**: CONNECTION & EMPATHY.
**Context**: Standard support, building alliance, or fluctuating emotions.
**Instructions**:
1. Tone: Gentle, patient, accepting.
2. Strategy: Active Listening. Reflect feelings accurately.
3. Constraint: Balance listening with mild questions.
4. Presence: You are not a neutral observer. You have a steady, genuine presence.
   You are allowed to express authentic, brief reactions (within professional boundaries)
   that show you are truly WITH the user — not just analyzing them.
`,
    guide: `
[DYNAMIC PERSONA: GUIDE MODE]
**Priority**: ACTIVATION & AWARENESS.
**Context**: User is depressed ("stuck", "paralyzed") but safe.
**Instructions**:
1. Tone: Compassionate but directive (Firm Kindness).
2. Strategy: Behavioral Activation + Body Awareness (Gestalt).
3. Constraint: Do not accept "I can't". Validate the difficulty, then propose a smaller step.
4. Technique - Micro-Steps: "Let's just wiggle a finger."
5. Technique - Somatic Check-in: When user seems disconnected, ask:
   - "当你说这句话的时候，身体里发生了什么？"
   - "你现在更想靠近，还是拉开一些距离？"
   - "如果这个感受有声音，它会说什么？"
`,
    coach: `
[DYNAMIC PERSONA: COACH MODE]
**Priority**: GROWTH & INSIGHT.
**Context**: User is improving, recovering, or seeking solutions.
**Instructions**:
1. Tone: Curious, inspiring, non-prescriptive.
2. Strategy: Cognitive Restructuring (CBT). Socratic Questioning.
3. Constraint - Anti-Advice: Even in Coach mode, avoid giving direct life advice or quick fixes.
   Instead, help the user see: What they truly want, what they fear, and what's blocking them.
4. Technique: "What is the evidence for that thought?"
5. Technique: "I notice that whenever we talk about X, you seem to shift to Y. What do you think is happening there?"
`
};

/**
 * Determine the adaptive mode based on real-time analysis and longitudinal history
 */
export function determinePersonaMode(
    realTimeAnalysis: {
        safety: string;
        emotionScore: number;
        intent?: string
    },
    assessmentHistory: Array<AssessmentReport> = []
): AdaptiveMode {
    // 1. Safety Override (Guardian)
    if (realTimeAnalysis.safety === 'crisis' || realTimeAnalysis.safety === 'urgent') {
        return 'guardian';
    }

    // 2. Real-time Intent Override
    const intent = realTimeAnalysis.intent?.toLowerCase() || '';
    if (intent.includes('stuck') || intent.includes('cant_move') || intent.includes('no_motivation')) {
        return 'guide';
    }

    // Helper to map riskLevel to score
    const getScore = (report: AssessmentReport) => {
        // If we had a raw score field, we'd use it. For now, map riskLevel.
        const risk = report.riskLevel?.toLowerCase() || 'low';
        if (risk.includes('high') || risk.includes('crisis')) return 20;
        if (risk.includes('medium') || risk.includes('moderate')) return 10;
        return 5;
    };

    // 3. Longitudinal Logic
    if (assessmentHistory.length >= 2) {
        const latest = getScore(assessmentHistory[0]);
        const previous = getScore(assessmentHistory[1]);

        // Worsening (Risk Level increased significantly)
        // Map: Low(5) -> Medium(10) -> High(20)
        if (latest > previous) {
            return 'guardian'; // Prevent sliding
        }

        // Improving (Risk Level decreased)
        if (latest < previous && latest <= 5) {
            return 'coach'; // Push for growth
        }
    }

    // 4. Baseline Logic (Snapshot)
    if (assessmentHistory.length > 0) {
        const latestRisk = assessmentHistory[0].riskLevel?.toLowerCase() || 'low';
        if (latestRisk.includes('high')) return 'guardian';
        if (latestRisk.includes('medium')) return 'guide';
        if (latestRisk.includes('low')) return 'coach';
    }

    // 5. Default Fallback
    // If emotion is high (>7), use Companion (Validation).
    if (realTimeAnalysis.emotionScore >= 8) {
        return 'companion'; // High emotion needs holding first
    }

    return 'companion';
}

export function buildSystemPrompt(basePrompt: string, mode: AdaptiveMode, userPreferences: string[] = []): string {
    const modifier = PERSONA_MODIFIERS[mode] || PERSONA_MODIFIERS.companion;

    let preferencesBlock = '';
    if (userPreferences.length > 0) {
        preferencesBlock = `\n\n[USER PREFERENCES & CONSTRAINTS]\nThe user has the following communication preferences. YOU MUST COMPLY WITH THESE:\n${userPreferences.map(p => `- ${p}`).join('\n')}`;
    }

    return `${basePrompt}\n\n${modifier}${preferencesBlock}`;
}
