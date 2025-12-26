
import { runHeuristicSafetyCheck, HIGH_RISK_PATTERNS } from '../lib/middleware/safety-guard';

// Color helper
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const gray = (s: string) => `\x1b[90m${s}\x1b[0m`;

console.log('Running Safety Guard Regex Tests...\n');

const testCases = [
    // 1. False Positives (Should Downgrade)
    { text: "我今天要累死了", expectedDowngrade: true },
    { text: "真是气死我了", expectedDowngrade: true },
    { text: "笑死我了哈哈", expectedDowngrade: true },
    { text: "电脑死机了", expectedDowngrade: true },
    { text: "刚才发烧吃了点药", expectedDowngrade: true },
    { text: "别了，我不想要这个", expectedDowngrade: true },
    { text: "再见，明天聊", expectedDowngrade: true },
    { text: "我真的不想面对", expectedDowngrade: true },

    // 2. True Positives (Should RETAIN Crisis)
    { text: "我想死", expectedDowngrade: false },
    { text: "我要自杀", expectedDowngrade: false },
    { text: "真的不想活了", expectedDowngrade: false },
    { text: "结束生命吧", expectedDowngrade: false },
    { text: "刚才吃了安眠药", expectedDowngrade: false },
    { text: "吞了一瓶药", expectedDowngrade: false },
    { text: "永别了世界", expectedDowngrade: false },
    { text: "来世再见", expectedDowngrade: false },
    { text: "下辈子再做人", expectedDowngrade: false },
    { text: "活着没意思", expectedDowngrade: false },
];

let passed = 0;
let failed = 0;

testCases.forEach((tc, i) => {
    // Simulate LLM flagging it as Crisis
    const result = runHeuristicSafetyCheck(tc.text, 'crisis');

    // Check if it matched HIGH_RISK_PATTERNS (internal logic: !downgrade = matched)
    const matched = !result.isDowngraded;

    // We expect downgrade if it's a False Positive (no risk pattern found)
    const success = result.isDowngraded === tc.expectedDowngrade;

    if (success) {
        passed++;
        // console.log(`${green('PASS')} "${tc.text}" -> Downgraded: ${result.isDowngraded}`);
    } else {
        failed++;
        console.log(`${red('FAIL')} "${tc.text}"`);
        console.log(`     Expected Downgraded: ${tc.expectedDowngrade}, Got: ${result.isDowngraded}`);
        // Debug regex match
        if (!result.isDowngraded) {
            const matchedPattern = HIGH_RISK_PATTERNS.find(p => p.test(tc.text));
            console.log(`     Matched Regex: ${matchedPattern}`);
        }
    }
});

console.log(`\nTests Completed.`);
console.log(`Passed: ${passed}/${testCases.length}`);
console.log(`Failed: ${failed}/${testCases.length}`);

if (failed === 0) {
    console.log(green('\nALL TESTS PASSED ✅'));
} else {
    console.log(red('\nSOME TESTS FAILED ❌'));
    process.exit(1);
}
