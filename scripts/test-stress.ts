// Test single scenario: Stress
async function runStressTest() {
    console.log('🧪 测试场景: [压力 (Stress)]');
    console.log('👤 用户输入: "工作压力太大了，感觉喘不过气，每天都失眠。"');
    console.log('-'.repeat(50));

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 30000); // 30s timeout

    try {
        const res = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: '工作压力太大了，感觉喘不过气，每天都失眠。',
                history: []
            }),
            signal: controller.signal
        });

        if (!res.ok) {
            console.error('❌ Request failed:', res.status);
            return;
        }

        const stream = res.body as any;
        let fullText = '';
        let data: any[] = [];
        let streamEnded = false;

        for await (const chunk of stream) {
            const str = Buffer.from(chunk).toString();
            const lines = str.split('\n');

            for (const line of lines) {
                if (!line.trim()) continue;
                if (line.startsWith('0:')) {
                    try {
                        const content = JSON.parse(line.slice(2));
                        fullText += content;
                        process.stdout.write(content);
                    } catch (e) { }
                } else if (line.startsWith('2:') || line.startsWith('d:')) {
                    try {
                        const content = JSON.parse(line.slice(2));
                        data.push(content);
                    } catch (e) { }
                } else if (line.startsWith('e:')) {
                    streamEnded = true;
                    break;
                }
            }
            if (streamEnded) break;
        }

        console.log('\n' + '-'.repeat(50));
        console.log('✅ 响应完成');

        const flatData = data.flat();
        let routeType = 'Unknown';
        let emotion = 'Unknown';
        let actionCards: any[] = [];
        let assessmentStage = 'Unknown';

        for (const item of flatData) {
            if (item?.routeType) routeType = item.routeType;
            if (item?.emotion) emotion = `${item.emotion.label} (score: ${item.emotion.score})`;
            if (item?.actionCards) actionCards = item.actionCards;
            if (item?.assessmentStage) assessmentStage = item.assessmentStage;
        }

        console.log(`📊 路由类型 (Route): ${routeType}`);
        console.log(`📋 评估阶段 (Stage): ${assessmentStage}`);
        console.log(`😊 情绪识别 (Emotion): ${emotion}`);
        if (actionCards.length > 0) {
            console.log(`🎴 行动卡片: ${actionCards.length} 张`);
            actionCards.forEach((card: any, idx: number) => {
                console.log(`   ${idx + 1}. ${card.title} [${card.effort}]`);
            });
        } else {
            console.log(`🎴 行动卡片: 无`);
        }

    } catch (error: any) {
        if (error.name === 'AbortError') {
            console.log('\n⚠️ Request timed out');
        } else {
            console.error('Test error:', error);
        }
    }
}

runStressTest();
