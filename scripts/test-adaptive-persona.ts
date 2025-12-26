
import { PrismaClient } from '@prisma/client';
import { determinePersonaMode } from '../lib/ai/persona-manager';

const prisma = new PrismaClient();

async function main() {
    console.log('🧪 Starting Adaptive Persona Verification...');

    // 1. Setup Test Users
    const wUserEmail = 'test_worsening_v1@example.com';
    const iUserEmail = 'test_improving_v1@example.com';

    // Cleanup prev runs
    await prisma.assessmentReport.deleteMany({ where: { user: { username: { in: [wUserEmail, iUserEmail] } } } });
    await prisma.user.deleteMany({ where: { username: { in: [wUserEmail, iUserEmail] } } });

    // Create Users
    const userWorsening = await prisma.user.create({
        data: { username: wUserEmail, passwordHash: 'test', nickname: 'WorseningUser' }
    });
    const userImproving = await prisma.user.create({
        data: { username: iUserEmail, passwordHash: 'test', nickname: 'ImprovingUser' }
    });

    // 2. Seed Assessment History (Worsening: Low -> High Risk)
    console.log('📉 Seeding Worsening History...');
    await prisma.assessmentReport.create({
        data: { userId: userWorsening.id, conversationId: 'c1', summary: 'ok', riskLevel: 'low', createdAt: new Date(Date.now() - 86400000 * 5) }
    });
    await prisma.assessmentReport.create({
        data: { userId: userWorsening.id, conversationId: 'c2', summary: 'bad', riskLevel: 'high', createdAt: new Date(Date.now()) } // Latest
    });

    // 3. Seed Assessment History (Improving: High -> Low Risk)
    console.log('📈 Seeding Improving History...');
    await prisma.assessmentReport.create({
        data: { userId: userImproving.id, conversationId: 'c3', summary: 'bad', riskLevel: 'high', createdAt: new Date(Date.now() - 86400000 * 5) }
    });
    await prisma.assessmentReport.create({
        data: { userId: userImproving.id, conversationId: 'c4', summary: 'ok', riskLevel: 'low', createdAt: new Date(Date.now()) } // Latest
    });

    // 4. Test Logic: Worsening User + Neutral Intent
    const historyW = await prisma.assessmentReport.findMany({
        where: { userId: userWorsening.id }, orderBy: { createdAt: 'desc' }, take: 5
    });
    const modeW = determinePersonaMode({ safety: 'normal', emotionScore: 5 }, historyW);
    console.log(`\n[Test 1] User: Worsening | Intent: Neutral`);
    console.log(`Expected: guardian (Prevention)`);
    console.log(`Actual:   ${modeW}`);
    console.log(`Result:   ${modeW === 'guardian' ? '✅ PASS' : '❌ FAIL'}`);

    // 5. Test Logic: Improving User + Neutral Intent
    const historyI = await prisma.assessmentReport.findMany({
        where: { userId: userImproving.id }, orderBy: { createdAt: 'desc' }, take: 5
    });
    // Note: Improving needs score < 5. 'low' maps to 5. So it should be 'coach'?
    // Let's check logic: if (prev - latest >= 5 && latest < 10) -> coach.
    // Previous (High=20), Latest (Low=5). Diff=15. Latest < 10. Should be coach.
    const modeI = determinePersonaMode({ safety: 'normal', emotionScore: 5 }, historyI);
    console.log(`\n[Test 2] User: Improving | Intent: Neutral`);
    console.log(`Expected: coach (Growth)`);
    console.log(`Actual:   ${modeI}`);
    console.log(`Result:   ${modeI === 'coach' ? '✅ PASS' : '❌ FAIL'}`);

    // 6. Test Logic: Any User + "Stuck" Intent (Real-time Override)
    const modeOverride = determinePersonaMode({
        safety: 'normal',
        emotionScore: 5,
        intent: 'i am stuck, cant move'
    }, historyW);
    console.log(`\n[Test 3] User: Worsening | Intent: "Stuck"`);
    console.log(`Expected: guide (Real-time override)`);
    console.log(`Actual:   ${modeOverride}`);
    console.log(`Result:   ${modeOverride === 'guide' ? '✅ PASS' : '❌ FAIL'}`);

    console.log('\n✨ Verification Completed');
}

main()
    .catch(e => console.error(e))
    .finally(async () => await prisma.$disconnect());
