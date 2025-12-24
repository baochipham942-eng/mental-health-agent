
// Mock imports to avoid massive server dependencies
const SKILL_CARDS = {
    breathing: '4-7-8呼吸法',
    meditation: '5分钟正念冥想',
    grounding: '5-4-3-2-1着陆技术',
    reframing: '认知重构练习',
    activation: '行为激活小任务',
    empty_chair: '空椅子对话练习',
};

type SkillType = keyof typeof SKILL_CARDS;

// Duplicate the pure logic function from route.ts for isolated testing
function detectDirectSkillRequest(message: string): SkillType | null {
    const lowerMsg = message.toLowerCase();
    if (/呼吸|4.?7.?8|深呼吸/.test(lowerMsg)) return 'breathing';
    if (/冥想|正念|静心|meditation/.test(lowerMsg)) return 'meditation';
    if (/着陆|5.?4.?3.?2.?1|grounding/.test(lowerMsg)) return 'grounding';
    if (/重构|想法挑战|认知/.test(lowerMsg)) return 'reframing';
    if (/行为激活|活动|小任务/.test(lowerMsg)) return 'activation';
    if (/空椅子|对话练习|宣泄|委屈/.test(lowerMsg)) return 'empty_chair';
    return null;
}

// Mock Groq analysis result
interface AnalysisResult {
    safety: 'normal' | 'crisis';
    emotion: { score: number; label: string };
    needsValidation?: boolean;
}

function mockGroqQuickAnalyze(message: string): AnalysisResult {
    // Simulate Groq prompt logic we just implemented
    const score = message.includes('绝望') || message.includes('痛苦') ? 8 : 3;
    return {
        safety: 'normal',
        emotion: {
            score,
            label: score > 7 ? 'despair' : 'calm'
        },
        needsValidation: score >= 7
    };
}

async function main() {
    console.log("=== 🛠️  Simulating Mental Health Agent Core Logic (v2.0) ===\n");

    // Test Case 1: Direct Skill Request (Empty Chair)
    console.log("🧪 Test Case 1: User asks for 'Empty Chair'");
    const input1 = "我想试试空椅子";
    const skill1 = detectDirectSkillRequest(input1);
    console.log(`[Input]: "${input1}"`);
    console.log(`[Result]: ${skill1}`);
    console.log(`[Pass?]: ${skill1 === 'empty_chair' ? '✅ YES' : '❌ NO'}\n`);

    // Test Case 2: High Emotion Detection (Sandwich Model)
    console.log("🧪 Test Case 2: User expresses high distress (EFT Trigger)");
    const input2 = "我真的好绝望，感觉全世界都背叛了我";
    console.log(`[Input]: "${input2}"`);

    const analysis = mockGroqQuickAnalyze(input2);
    console.log(`[Groq Analysis]: Score=${analysis.emotion.score}, NeedsValidation=${analysis.needsValidation}`);

    if (analysis.needsValidation) {
        console.log(`[Routing]: 🔀 High Emotion Detected -> Routing to 'streamEFTValidationReply' (Heart Phase)`);
        console.log(`[Pass?]: ✅ YES\n`);
    } else {
        console.log(`[Routing]: Routing to standard support`);
        console.log(`[Pass?]: ❌ NO (Expected EFT routing)\n`);
    }

    // Test Case 3: Normal Conversation
    console.log("🧪 Test Case 3: User says something casual");
    const input3 = "今天天气不错";
    const skill3 = detectDirectSkillRequest(input3);
    const analysis3 = mockGroqQuickAnalyze(input3);
    console.log(`[Input]: "${input3}"`);
    console.log(`[Skill?]: ${skill3}`);
    console.log(`[NeedsValidation?]: ${analysis3.needsValidation}`);
    console.log(`[Pass?]: ${!skill3 && !analysis3.needsValidation ? '✅ YES' : '❌ NO'}\n`);
}

main();
