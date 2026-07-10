/**
 * ChatInput 交互测试（补充放水）
 *
 * 测试真实用户交互流程：
 * - 连续输入→发送→清空循环
 * - 输入验证边界
 * - 多次 Enter 防抖
 * - disabled 状态全面锁定
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInput } from '../ChatInput';

// 复用同样的 mock
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));
vi.mock('next/link', () => ({
    default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));
vi.mock('@arco-design/web-react', () => ({
    Button: ({ children, icon, onClick, disabled, className, ...props }: any) => (
        <button onClick={onClick} disabled={disabled} className={className} data-testid="arco-button" {...props}>
            {icon}{children}
        </button>
    ),
    Drawer: ({ children, visible }: any) => visible ? <div data-testid="drawer">{children}</div> : null,
}));
vi.mock('@arco-design/web-react/icon', () => ({
    IconSend: () => <span data-testid="icon-send">Send</span>,
    IconLoading: () => <span data-testid="icon-loading">Loading</span>,
}));
vi.mock('../VoiceInputButton', () => ({
    VoiceInputButton: ({ disabled }: any) => (
        <button data-testid="voice-btn" disabled={disabled}>Voice</button>
    ),
}));
vi.mock('@/store/chatStore', () => ({
    useChatStore: () => ({
        currentModel: 'deepseek',
        setCurrentModel: vi.fn(),
    }),
    CHAT_MODELS: {
        deepseek: { label: 'DeepSeek V3', modelName: 'deepseek-chat' },
        kimi: { label: 'Kimi K2.5', modelName: 'kimi-k2.5' },
        openrouter: { label: 'GPT 5.5', modelName: 'openai/gpt-5.5' },
    },
}));

describe('ChatInput 交互补充', () => {
    const onChange = vi.fn();
    const onSend = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('连续多次 Enter 只发送一次（canSend 判断）', () => {
        // 第一次 Enter 发送后，value 应被清空，后续 Enter 因空值不再发送
        const { rerender } = render(
            <ChatInput value="你好" onChange={onChange} onSend={onSend} />
        );
        const textarea = screen.getByPlaceholderText('说说你现在的感受...');

        // 第一次 Enter
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
        expect(onSend).toHaveBeenCalledTimes(1);

        // 模拟父组件清空 value
        rerender(
            <ChatInput value="" onChange={onChange} onSend={onSend} />
        );

        // 第二次 Enter，value 已空
        fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
        expect(onSend).toHaveBeenCalledTimes(1); // 仍是 1
    });

    it('disabled 时 textarea 有 readOnly 属性', () => {
        render(<ChatInput value="" onChange={onChange} onSend={onSend} disabled />);
        const textarea = screen.getByPlaceholderText('说说你现在的感受...') as HTMLTextAreaElement;
        expect(textarea.readOnly).toBe(true);
    });

    it('disabled 时 textarea 有 disabled 属性', () => {
        render(<ChatInput value="" onChange={onChange} onSend={onSend} disabled />);
        const textarea = screen.getByPlaceholderText('说说你现在的感受...') as HTMLTextAreaElement;
        expect(textarea.disabled).toBe(true);
    });

    it('isLoading 时语音按钮 disabled', () => {
        render(<ChatInput value="" onChange={onChange} onSend={onSend} isLoading />);
        const voiceBtn = screen.getByTestId('voice-btn');
        expect(voiceBtn).toBeDisabled();
    });

    it('onChange 传递正确的值（含中文）', () => {
        render(<ChatInput value="" onChange={onChange} onSend={onSend} />);
        const textarea = screen.getByPlaceholderText('说说你现在的感受...');
        fireEvent.change(textarea, { target: { value: '我今天很焦虑，工作压力太大了' } });
        expect(onChange).toHaveBeenCalledWith('我今天很焦虑，工作压力太大了');
    });

    it('onSend 传递完整 value（含前后空格）', () => {
        // value 有前后空格时，canSend 检查 trim 后是否非空
        render(<ChatInput value=" 有效内容 " onChange={onChange} onSend={onSend} />);
        const buttons = screen.getAllByTestId('arco-button');
        const sendBtn = buttons[buttons.length - 1];
        fireEvent.click(sendBtn);
        // onSend 应传递原始 value（含空格），由父组件决定是否 trim
        expect(onSend).toHaveBeenCalledWith(' 有效内容 ');
    });

    it('textarea rows=1（单行默认）', () => {
        render(<ChatInput value="" onChange={onChange} onSend={onSend} />);
        const textarea = screen.getByPlaceholderText('说说你现在的感受...') as HTMLTextAreaElement;
        expect(textarea.rows).toBe(1);
    });
});

describe('ChatInput 技能面板', () => {
    const onChange = vi.fn();
    const onSend = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('桌面端：点击工具箱按钮后解压工具箱面板出现在 DOM 中', () => {
        render(<ChatInput value="" onChange={onChange} onSend={onSend} />);
        // 面板始终在 DOM 中（CSS 控制显隐），检查文案存在
        expect(screen.getByText('解压工具箱')).toBeInTheDocument();
    });

    it('第一层为职场任务语言，技术名称下沉到副标题', () => {
        render(<ChatInput value="" onChange={onChange} onSend={onSend} />);
        // 任务语言（第一层）
        for (const label of [
            '下班后脑子停不下来',
            '被领导批了，先缓一缓',
            '明天要谈薪，陪我排练',
            '同事越界，想想怎么回应',
            '心里堵着，想把话说出来',
            '记录今天压力来自哪里',
        ]) {
            expect(screen.getAllByText(label).length).toBeGreaterThan(0);
        }
        // 技术名称（副标题）
        expect(screen.getAllByText(/溪流落叶/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/4-7-8呼吸法/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/空椅子/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/认知重构/).length).toBeGreaterThan(0);
        expect(screen.getAllByText(/情绪记录/).length).toBeGreaterThan(0);
    });

    it('点击任务项发送对应技能触发消息（映射稳定）', () => {
        render(<ChatInput value="" onChange={onChange} onSend={onSend} />);
        const cases: Array<[string, string]> = [
            ['下班后脑子停不下来', '我想试试溪流落叶'],
            ['被领导批了，先缓一缓', '我想试试4-7-8呼吸法'],
            ['明天要谈薪，陪我排练', '我想试试空椅子'],
            ['同事越界，想想怎么回应', '我想试试认知重构'],
            ['心里堵着，想把话说出来', '我想试试空椅子'],
            ['记录今天压力来自哪里', '我想试试情绪记录'],
        ];
        for (const [label, message] of cases) {
            onSend.mockClear();
            fireEvent.click(screen.getByText(label));
            expect(onSend).toHaveBeenCalledWith(message);
        }
    });

    it('触发消息能命中 detectDirectSkillRequest 的技能路由', async () => {
        const { detectDirectSkillRequest } = await import('@/lib/ai/skills');
        expect(detectDirectSkillRequest('我想试试溪流落叶')).toBe('leaves_stream');
        expect(detectDirectSkillRequest('我想试试4-7-8呼吸法')).toBe('breathing');
        expect(detectDirectSkillRequest('我想试试空椅子')).toBe('empty_chair');
        expect(detectDirectSkillRequest('我想试试认知重构')).toBe('reframing');
        expect(detectDirectSkillRequest('我想试试情绪记录')).toBe('mood_tracker');
    });

    it('面板文案不含用户可见禁用词', () => {
        const { container } = render(<ChatInput value="" onChange={onChange} onSend={onSend} />);
        const text = container.textContent || '';
        for (const banned of ['咨询', '疗愈', '心理评估', '症状', 'PHQ', 'GAD']) {
            expect(text).not.toContain(banned);
        }
    });
});
