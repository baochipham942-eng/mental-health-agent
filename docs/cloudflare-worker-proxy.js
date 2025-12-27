/**
 * Groq API Proxy Worker
 * 部署到 Cloudflare Workers 用于代理 Groq API 请求
 * 
 * 部署步骤：
 * 1. 登录 https://dash.cloudflare.com
 * 2. 左侧菜单 → Workers & Pages → Create → Create Worker
 * 3. 粘贴这段代码，点击 Deploy
 * 4. Settings → Variables → 添加环境变量 GROQ_API_KEY
 * 5. 复制 Worker URL (如: https://xxx.xxx.workers.dev)
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
                    "Access-Control-Max-Age": "86400",
                },
            });
        }

        // 只允许 POST 请求
        if (request.method !== "POST") {
            return new Response("Method not allowed", { status: 405 });
        }

        try {
            // 获取请求体（音频文件）
            const formData = await request.formData();

            // 转发到 Groq API
            const groqResponse = await fetch(
                "https://api.groq.com/openai/v1/audio/transcriptions",
                {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${env.GROQ_API_KEY}`,
                    },
                    body: formData,
                }
            );

            // 返回响应
            const responseBody = await groqResponse.text();
            return new Response(responseBody, {
                status: groqResponse.status,
                headers: {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
            });
        } catch (error) {
            return new Response(
                JSON.stringify({ error: error.message }),
                {
                    status: 500,
                    headers: {
                        "Content-Type": "application/json",
                        "Access-Control-Allow-Origin": "*",
                    },
                }
            );
        }
    },
};
