/**
 * GUI 测试: 探索工坊功能
 *
 * 验证场景：
 *   1. 进入探索工坊页面
 *   2. 验证 Tab 切换（镜像回廊、智慧殿堂、圆桌论道）
 *   3. 在圆桌论道中选择大师、输入话题、启动讨论
 *
 * 前置条件:
 *   1. bun dev 启动开发服务器
 *   2. Chrome 浏览器已安装
 *   3. macOS 辅助功能权限已授权给终端
 *
 * 运行: APP_URL=http://localhost:3002 bun tests/gui/test-lab.mjs
 */

import { runGUITestSuite } from './runner.mjs';
import { APP_URL } from './config.mjs';

const tests = [
    {
        name: '探索工坊: Tab 切换 + 镜像回廊随机匹配',
        instruction: [
            `打开 Chrome 浏览器，在地址栏输入 ${APP_URL}/dashboard/lab 并回车。`,
            '如果出现登录页面，点击"一键登录"按钮并等待进入主界面。',
            '等待"探索工坊"页面加载完成。',
            '',
            '【验证页面元素】',
            '确认页面顶部显示"探索工坊"标题。',
            '确认能看到 Tab 导航栏，包含"镜像回廊"、"智慧殿堂"、"圆桌论道"等选项。',
            '',
            '【测试镜像回廊】',
            '点击"镜像回廊"Tab。',
            '等待镜像回廊内容加载，应该能看到"镜像回廊 (Hall of Mirrors)"标题。',
            '找到并点击"随机匹配"按钮。',
            '等待匹配完成，确认出现了一个人格角色卡片和对话窗口。',
            '',
            '确认以上所有操作完成后结束。',
        ].join('\n'),
        options: {
            maxLoopCount: 40,
            timeoutMs: 240_000,
            validate: (steps) => {
                const hasClick = steps.filter(s => s.action === 'click').length >= 2;
                return hasClick;
            },
        },
    },
    {
        name: '探索工坊: 圆桌论道发起讨论',
        instruction: [
            `打开 Chrome 浏览器，在地址栏输入 ${APP_URL}/dashboard/lab 并回车。`,
            '如果出现登录页面，点击"一键登录"按钮并等待进入。',
            '等待"探索工坊"页面加载完成。',
            '',
            '【进入圆桌论道】',
            '点击"圆桌论道"Tab（带有🎭图标）。',
            '等待圆桌论道内容加载，应该能看到"圆桌论道 (Roundtable)"标题和话题输入框。',
            '',
            '【输入话题】',
            '在"讨论话题"输入框中输入"人应该追求自由还是安全"。',
            '',
            '【选择大师】',
            '在大师列表中，点击选中任意 2 个大师头像（依次点击两个不同的大师卡片）。',
            '',
            '【启动讨论】',
            '找到并点击"开始讨论"按钮（或类似的启动按钮）。',
            '等待讨论窗口出现，确认大师们开始发言。',
            '',
            '确认以上操作完成后结束。',
        ].join('\n'),
        options: {
            maxLoopCount: 45,
            timeoutMs: 300_000,
            validate: (steps) => {
                const typeCount = steps.filter(s => s.action === 'type').length;
                const clickCount = steps.filter(s => s.action === 'click').length;
                return typeCount >= 1 && clickCount >= 3;
            },
        },
    },
];

async function main() {
    console.log('\n心理疗愈 Agent - 探索工坊 GUI 测试');
    console.log(`应用地址: ${APP_URL}`);
    console.log(`测试数量: ${tests.length}`);
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
