/**
 * GUI 测试: 核心对话流程
 *
 * 前置条件:
 *   1. bun dev 启动开发服务器 (localhost:3000)
 *   2. Chrome 浏览器已安装
 *   3. macOS 辅助功能权限已授权给终端
 *
 * 运行: node tests/gui/test-chat.js
 */

import { runGUITestSuite } from './runner.mjs';
import { APP_URL } from './config.mjs';

const tests = [
    {
        name: '打开应用并发送消息',
        instruction: [
            `打开 Chrome 浏览器，在地址栏输入 ${APP_URL} 并回车。`,
            '等待页面加载完成后，在底部的聊天输入框中输入"你好，我今天心情不太好"，',
            '然后点击发送按钮（或按回车键）。',
            '等待 AI 回复出现在聊天窗口中，确认回复内容显示完整后结束。',
        ].join(''),
        options: {
            maxLoopCount: 35,
            timeoutMs: 180_000,
            validate: (steps) => {
                // 至少要有 type 操作（输入消息）和 finished 结束
                const hasType = steps.some(s => s.action === 'type');
                const hasClick = steps.some(s => s.action === 'click');
                return hasType && hasClick;
            },
        },
    },
];

async function main() {
    console.log(`\n应用地址: ${APP_URL}`);
    console.log('请确保 bun dev 已启动并且 Chrome 可用\n');

    const { passed, failed } = await runGUITestSuite(tests);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('GUI 测试异常:', err);
    process.exit(1);
});
