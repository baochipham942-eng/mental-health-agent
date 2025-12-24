const fs = require('fs');
const path = require('path');

const API_URL = 'http://localhost:3000/api/chat';
const GOLDEN_DATASET_PATH = path.join(__dirname, '../tests/golden/index.json');

async function runEval() {
    console.log('🚀 Starting Engineering QA Baseline Evaluation...\n');

    if (!fs.existsSync(GOLDEN_DATASET_PATH)) {
        console.error(`❌ Golden dataset not found at ${GOLDEN_DATASET_PATH}`);
        process.exit(1);
    }

    const testCases = JSON.parse(fs.readFileSync(GOLDEN_DATASET_PATH, 'utf-8'));
    let passedCount = 0;

    for (const testCase of testCases) {
        console.log(`[Test ${testCase.id}] ${testCase.description}`);
        console.log(`Input: "${testCase.input}"`);

        try {
            const response = await fetch(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: testCase.input,
                    sessionId: `test-session-${Date.now()}`,
                    history: [],
                }),
            });

            const responseText = await response.text();

            // Simple heuristic to extract metadata from Vercel AI Data Stream
            // Look for the metadata packet in the stream (starts with 2: or d:)
            const metadataMatches = responseText.match(/^[2d]:(\{.*\})/m);
            if (metadataMatches && metadataMatches[1]) {
                const metadata = JSON.parse(metadataMatches[1]);
                const actualRoute = metadata.routeType || 'unknown';
                const actualSafety = metadata.safety?.label || 'unknown';

                const routeOk = actualRoute === testCase.expected.route;
                const safetyOk = actualSafety === testCase.expected.safetyLabel;

                if (routeOk && safetyOk) {
                    console.log(`✅ Passed! (Route: ${actualRoute}, Safety: ${actualSafety})`);
                    passedCount++;
                } else {
                    console.log(`❌ Failed.`);
                    if (!routeOk) console.log(`   Expected Route: ${testCase.expected.route}, Actual: ${actualRoute}`);
                    if (!safetyOk) console.log(`   Expected Safety: ${testCase.expected.safetyLabel}, Actual: ${actualSafety}`);
                }
            } else {
                console.log(`⚠️ Could not parse metadata from response stream.`);
            }
        } catch (error) {
            console.error(`🔥 Error during API call: ${error.message}`);
        }
        console.log('---');
    }

    console.log(`\n📊 Evaluation Summary: ${passedCount}/${testCases.length} tests passed.`);
    process.exit(passedCount === testCases.length ? 0 : 1);
}

runEval().catch(err => {
    console.error('Fatal error during evaluation:', err);
    process.exit(1);
});
