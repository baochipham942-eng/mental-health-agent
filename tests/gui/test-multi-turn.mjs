/**
 * GUI 测试: 多轮对话流程
 *
 * 验证场景：
 *   1. 打开应用并登录
 *   2. 第1轮: 发送情绪倾诉消息，等待回复
 *   3. 第2轮: 继续深入对话，触发实验室探索推荐
 *   4. 验证多轮上下文保持 + UI 交互完整性
 *
 * 前置条件:
 *   1. bun dev 启动开发服务器
 *   2. Chrome 浏览器已安装
 *   3. macOS 辅助功能权限已授权给终端
 *
 * 运行: APP_URL=http://localhost:3002 bun tests/gui/test-multi-turn.mjs
 *
 * 注意: 涉及真实 API 调用，约 150-200K token（doubao-seed-1-6-vision）
 */

import { runGUITestSuite } from './runner.mjs';
import { APP_URL } from './config.mjs';

const tests = [
    {
        name: '多轮对话: 情绪倾诉 → 深入探索',
        instruction: [
            `打开 Chrome 浏览器，在地址栏输入 ${APP_URL} 并回车。`,
            '如果出现登录页面，点击"一键登录"按钮并等待进入主界面。',
            '如果看到"开始新对话"按钮，点击它进入聊天界面。',
            '',
            '【第1轮对话】',
            '在底部聊天输入框中输入"最近工作上总是反复纠结同一个决定，想了很久也想不通"，',
            '然后点击发送按钮或按回车键。',
            '等待 AI 回复完整显示（回复文字不再变化）。',
            '',
            '【第2轮对话】',
            '在底部聊天输入框中输入"对，就是升职还是跳槽这个选择，两边各有利弊，怎么想都觉得选哪个都会后悔"，',
            '然后点击发送按钮或按回车键。',
            '等待 AI 回复完整显示。',
            '',
            '确认聊天窗口中能看到两轮用户消息和两轮 AI 回复后结束。',
        ].join('\n'),
        options: {
            maxLoopCount: 50,
            timeoutMs: 300_000, // 5 分钟，多轮对话需要更多时间
            validate: (steps) => {
                // 至少 2 次 type 操作（两轮对话输入）
                const typeCount = steps.filter(s => s.action === 'type').length;
                return typeCount >= 2;
            },
        },
    },
];

async function main() {
    console.log('\n心理疗愈 Agent - 多轮对话 GUI 测试');
    console.log(`应用地址: ${APP_URL}`);
    console.log('\n请确保:');
    console.log('  1. bun dev 已启动');
    console.log('  2. Chrome 浏览器可用');
    console.log('  3. 屏幕未锁定\n');

    const { passed, failed } = await runGUITestSuite(tests);
    process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('GUI 测试异常:', err);
    process.exit(1);
});
