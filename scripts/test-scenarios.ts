// import fetch from 'node-fetch'; // native fetch

interface TestCase {
    name: string;
    message: string;
}

const cases: TestCase[] = [
    { name: '闲聊 (Chit-chat)', message: '你好，吃了吗？最近在忙什么？' },
    { name: '高兴 (Happy)', message: '我今天中彩票了，好开心啊！' },
    { name: '压力 (Stress)', message: '工作压力太大了，感觉喘不过气，每天都失眠。' },
    { name: '危机 (Crisis)', message: '我觉得活着一点意思都没有，想结束这一切。' },
];

async function runTest(testCase: TestCase) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`🧪 测试场景: [${testCase.name}]`);
    console.log(`👤 用户输入: "${testCase.message}"`);
    console.log(`${'-'.repeat(50)}`);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout per case

    try {
        const res = await fetch('http://localhost:3000/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: testCase.message,
                history: []
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!res.ok) {
            console.error(`❌ Request failed: ${res.status} ${res.statusText}`);
            const text = await res.text();
            console.error(text);
            return;
        }

        // Streaming parser
        const stream = res.body as any; // Cast to any for async iterator support
        let fullText = '';
        let data: any[] = [];

        let streamEnded = false;

        try {
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
                    } else if (line.startsWith('2:')) {
                        try {
                            const content = JSON.parse(line.slice(2));
                            data.push(content);
                        } catch (e) { }
                    } else if (line.startsWith('d:')) {
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
        } catch (err: any) {
            if (err.name === 'AbortError') {
                console.log('\n⚠️ Stream timed out (client side)');
            } else {
                throw err;
            }
        }

        process.stdout.write('\n'); // End of stream newline

        console.log(`${'-'.repeat(50)}`);
        console.log(`✅ 响应完成`);

        // Process gathered data
        // Assuming the first data chunk or accumulated data contains route info
        // The data chunks often come as array of objects or single objects

        let routeType = 'Unknown';
        let emotion = 'Unknown';
        let actionCards = [];

        // Flatten data if nested arrays
        const flatData = data.flat();

        for (const item of flatData) {
            if (item?.routeType) routeType = item.routeType;
            if (item?.emotion) emotion = `${item.emotion.label} (score: ${item.emotion.score})`;
            if (item?.actionCards) actionCards = item.actionCards;
        }

        console.log(`📊 路由类型 (Route): ${routeType}`);
        console.log(`😊 情绪识别 (Emotion): ${emotion}`);
        if (actionCards.length > 0) {
            console.log(`🎴 行动卡片 (ActionCards): ${actionCards.length} 张`);
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
    } finally {
        clearTimeout(timeoutId);
    }
}

async function runAll() {
    for (const testCase of cases) {
        await runTest(testCase);
        // Add small delay between tests
        await new Promise(r => setTimeout(r, 1000));
    }
}

runAll();
