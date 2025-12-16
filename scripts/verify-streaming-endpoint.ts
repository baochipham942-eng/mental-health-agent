// import fetch from 'node-fetch'; // using native fetch

async function verifyStreaming() {
    console.log('Sending request to /api/chat...');
    const res = await fetch('http://localhost:3000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            message: '压力好大',
            history: []
        })
    });

    if (!res.ok) {
        console.error('Request failed:', res.status, await res.text());
        process.exit(1);
    }

    if (!res.body) {
        console.error('No response body');
        process.exit(1);
    }

    console.log('Response received. Reading stream...');

    // Use async iterator
    const stream = res.body as any; // cast to avoid type issues if types are missing

    let chunkCount = 0;
    let hasTextProtocol = false;
    let hasDataProtocol = false;

    for await (const chunk of stream) {
        chunkCount++;
        const str = Buffer.from(chunk).toString();
        console.log(`Chunk ${chunkCount}:`, str.slice(0, 50) + (str.length > 50 ? '...' : ''));

        if (str.includes('0:')) hasTextProtocol = true;
        if (str.includes('d:')) hasDataProtocol = true;
    }

    console.log('Stream finished.');
    console.log('Total chunks:', chunkCount);
    console.log('Has text protocol (0:):', hasTextProtocol);
    console.log('Has data protocol (d:):', hasDataProtocol);

    if (chunkCount > 1 && hasTextProtocol) {
        console.log('SUCCESS: Streaming verified.');
    } else {
        console.error('FAILURE: Streaming not detected or protocol mismatch.');
        process.exit(1);
    }
}

verifyStreaming().catch(console.error);
