import { consolidateMemory } from '../lib/memory/consolidator';
import { Memory, ExtractedMemory } from '../lib/memory/types';

async function testConsolidation() {
    console.log('--- Testing Memory Consolidation ---');

    const existingMemories: Memory[] = [
        {
            id: 'mem-1',
            userId: 'user-1',
            topic: 'emotional_pattern',
            content: '用户对未来可能发生的事情感到不安。',
            confidence: 0.9,
            createdAt: new Date(),
            updatedAt: new Date(),
            accessedAt: new Date(),
        }
    ];

    const newMemory: ExtractedMemory = {
        topic: 'emotional_pattern',
        content: '面临未来不确定性时触发忧虑和焦虑感。',
        confidence: 0.8,
    };

    console.log('Existing:', existingMemories[0].content);
    console.log('New:', newMemory.content);

    const result = await consolidateMemory(newMemory, existingMemories);
    console.log('Result Action:', result.action);
    console.log('Reason:', result.reason);
    if (result.mergedContent) {
        console.log('Merged Content:', result.mergedContent);
    }
}

testConsolidation().catch(console.error);
