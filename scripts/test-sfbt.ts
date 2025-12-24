import { generateSFBTQuery, simulateSFBTResponse } from '../lib/ai/sfbt';

console.log('🧪 Testing SFBT Logic (CLI Mode)\n');

const testCases = [
    { name: 'Significant Improvement', pre: 4, post: 7, exercise: '五感着陆' },
    { name: 'Small Improvement', pre: 5, post: 6, exercise: '呼吸练习' },
    { name: 'No Change', pre: 4, post: 4, exercise: '情绪记录' },
    { name: 'Decline', pre: 6, post: 5, exercise: '空椅子对话' }
];

testCases.forEach(test => {
    console.log(`\n----------------------------------------`);
    console.log(`📋 Case: ${test.name} (${test.pre} -> ${test.post})`);

    // 1. Generate System Prompt
    const systemPrompt = generateSFBTQuery({
        preScore: test.pre,
        postScore: test.post,
        exerciseName: test.exercise
    });
    console.log(`🤖 System Prompt (Internal):`);
    console.log(`   "${systemPrompt}"`);

    // 2. Simulate AI Reply
    const reply = simulateSFBTResponse(systemPrompt);
    console.log(`💬 AI Reply (Simulated):`);
    console.log(`   "${reply}"`);
});
