import 'dotenv/config';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, '');
}

async function main() {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const baseUrl = normalizeBaseUrl(
    process.env.OPENAI_API_BASE_URL || 'https://api.openai.com/v1'
  );
  const model = process.env.OPENAI_CHAT_MODEL || 'gpt-5.5';

  console.log('== OpenAI Responses Smoke ==');
  console.log(`model=${model}`);
  console.log(`baseURL=${baseUrl}`);
  console.log('api=openai-responses');
  console.log('authHeader=true');

  const response = await fetch(`${baseUrl}/responses`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      stream: true,
      input: [
        {
          role: 'system',
          content: [
            {
              type: 'input_text',
              text: '你是一个简洁的测试助手。请只返回一句中文短句。',
            },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: '回复“5.5 可用”或说明不可用原因。',
            },
          ],
        },
      ],
      max_output_tokens: 80,
    }),
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new Error(`OpenAI Responses API error: ${response.status} - ${raw}`);
  }

  if (!response.body) {
    throw new Error('OpenAI Responses API returned an empty stream body');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let outputText = '';
  let completedResponse: any = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop() || '';

    for (const event of events) {
      const dataLines = event
        .split('\n')
        .filter(line => line.startsWith('data: '))
        .map(line => line.slice(6).trim());

      for (const line of dataLines) {
        if (!line || line === '[DONE]') {
          continue;
        }

        let payload: any;
        try {
          payload = JSON.parse(line);
        } catch {
          continue;
        }

        if (payload.type === 'response.output_text.delta' && payload.delta) {
          outputText += payload.delta;
        }

        if (payload.type === 'response.completed') {
          completedResponse = payload.response;
        }
      }
    }
  }

  if (!outputText && completedResponse) {
    outputText =
      completedResponse.output_text
      || completedResponse.output?.flatMap((item: any) => item.content || [])
        .map((content: any) => content.text)
        .filter(Boolean)
        .join('\n')
      || '';
  }

  console.log('\n[response]');
  console.log(outputText || JSON.stringify(completedResponse, null, 2));
  console.log('\nOpenAI Responses smoke passed');
}

main().catch((error) => {
  console.error('\nOpenAI Responses smoke failed');
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
