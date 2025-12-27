/**
 * Groq API Proxy Worker
 * 
 * 部署到 Cloudflare Workers 用于代理 Groq API 请求
 * 
 * 部署步骤：
 * 1. 登录 https://dash.cloudflare.com
 * 2. 左侧菜单 → Workers & Pages → Create → Create Worker
 * 3. 粘贴这段代码，点击 Deploy
 * 4. Settings → Variables → 添加环境变量 GROQ_API_KEY (设为你的密钥)
 * 5. 复制 Worker URL
 * 
 * 注意：目前 Groq 似乎封禁了 Cloudflare Workers 的 IP，此方案暂不可用
 */

export default {
    async fetch(request, env) {
        // CORS 预检请求
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: {
                    "Access-Control-Allow-Origin": "*",
                    "Access-Control-Allow-Methods": "POST, OPTIONS",
                    "Access-Control-Allow-Headers": "Content-Type",
                },
            });
        }

        // 只允许 POST 请求
        if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405 });
        }

        try {
            // 检查 API Key
            if (!env.GROQ_API_KEY) {
                return jsonResponse({ error: "GROQ_API_KEY not configured" }, 500);
            }

            const incomingFormData = await request.formData();

            const file = incomingFormData.get("file");
            if (!file || !(file instanceof File)) {
                return jsonResponse({ error: "No file provided" }, 400);
            }

            // 读取并重建文件
            const arrayBuffer = await file.arrayBuffer();
            const newFile = new File([arrayBuffer], file.name || "audio.webm", {
                type: file.type || "audio/webm"
            });

            const groqFormData = new FormData();
            groqFormData.append("file", newFile);
            groqFormData.append("model", incomingFormData.get("model") || "whisper-large-v3");
            groqFormData.append("language", incomingFormData.get("language") || "zh");
            groqFormData.append("response_format", "json");

            // 调用 Groq
            const response = await fetch(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${env.GROQ_API_KEY}`,
                        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
                    },
                    body: groqFormData,
                }
            );

            const body = await response.text();
            return new Response(body, {
                status: response.status,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            });
        } catch (error) {
            return jsonResponse({ error: error.message }, 500);
        }
    },
};

function jsonResponse(data, status) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    });
}
