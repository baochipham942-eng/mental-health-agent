import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatInput } from '../ChatInput';

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

// Mock next/link
vi.mock('next/link', () => ({
    default: ({ children, href, ...props }: any) => <a href={href} {...props}>{children}</a>,
}));

// Mock Arco UI
vi.mock('@arco-design/web-react', () => ({
    Button: ({ children, icon, onClick, disabled, className, ...props }: any) => (
        <button onClick={onClick} disabled={disabled} className={className} data-testid="arco-button" {...props}>
            {icon}
            {children}
        </button>
    ),
    Drawer: ({ children, visible }: any) => visible ? <div data-testid="drawer">{children}</div> : null,
}));

vi.mock('@arco-design/web-react/icon', () => ({
    IconSend: () => <span data-testid="icon-send">Send</span>,
    IconLoading: () => <span data-testid="icon-loading">Loading</span>,
}));

// Mock VoiceInputButton
vi.mock('../VoiceInputButton', () => ({
    VoiceInputButton: ({ disabled }: any) => (
        <button data-testid="voice-btn" disabled={disabled}>Voice</button>
    ),
}));

// Mock chatStore
vi.mock('@/store/chatStore', () => ({
    useChatStore: () => ({
        currentModel: 'deepseek',
        setCurrentModel: vi.fn(),
    }),
    CHAT_MODELS: {
        deepseek: { label: 'DeepSeek R3', modelName: 'deepseek-chat' },
        kimi: { label: 'Kimi K2.5', modelName: 'kimi-k2.5' },
        openrouter: { label: 'GPT 5.4', modelName: 'openai/gpt-5.4' },
    },
}));

describe('ChatInput', () => {
    const defaultProps = {
        value: '',
        onChange: vi.fn(),
        onSend: vi.fn(),
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // ====== 渲染 ======

    describe('基础渲染', () => {
        it('渲染 textarea', () => {
            render(<ChatInput {...defaultProps} />);
            const textarea = screen.getByPlaceholderText('说说你现在的感受...');
            expect(textarea).toBeInTheDocument();
        });

        it('自定义 placeholder', () => {
            render(<ChatInput {...defaultProps} placeholder="自定义提示..." />);
            expect(screen.getByPlaceholderText('自定义提示...')).toBeInTheDocument();
        });

        it('渲染发送按钮', () => {
            render(<ChatInput {...defaultProps} />);
            expect(screen.getByTestId('icon-send')).toBeInTheDocument();
        });

        it('渲染语音按钮（非 disabled）', () => {
            render(<ChatInput {...defaultProps} />);
            expect(screen.getByTestId('voice-btn')).toBeInTheDocument();
        });

        it('disabled 时隐藏语音按钮', () => {
            render(<ChatInput {...defaultProps} disabled />);
            expect(screen.queryByTestId('voice-btn')).not.toBeInTheDocument();
        });
    });

    // ====== 输入交互 ======

    describe('输入交互', () => {
        it('onChange 在输入时触发', () => {
            const onChange = vi.fn();
            render(<ChatInput {...defaultProps} onChange={onChange} />);
            const textarea = screen.getByPlaceholderText('说说你现在的感受...');
            fireEvent.change(textarea, { target: { value: '你好' } });
            expect(onChange).toHaveBeenCalledWith('你好');
        });

        it('显示当前 value', () => {
            render(<ChatInput {...defaultProps} value="已有内容" />);
            const textarea = screen.getByPlaceholderText('说说你现在的感受...') as HTMLTextAreaElement;
            expect(textarea.value).toBe('已有内容');
        });
    });

    // ====== 发送逻辑 ======

    describe('发送逻辑', () => {
        it('点击发送按钮触发 onSend', () => {
            const onSend = vi.fn();
            render(<ChatInput {...defaultProps} value="测试消息" onSend={onSend} />);
            // 找到发送按钮（最后一个 arco-button）
            const buttons = screen.getAllByTestId('arco-button');
            const sendBtn = buttons[buttons.length - 1];
            fireEvent.click(sendBtn);
            expect(onSend).toHaveBeenCalledWith('测试消息');
        });

        it('空内容时不触发 onSend', () => {
            const onSend = vi.fn();
            render(<ChatInput {...defaultProps} value="" onSend={onSend} />);
            const buttons = screen.getAllByTestId('arco-button');
            const sendBtn = buttons[buttons.length - 1];
            fireEvent.click(sendBtn);
            expect(onSend).not.toHaveBeenCalled();
        });

        it('纯空格时不触发 onSend', () => {
            const onSend = vi.fn();
            render(<ChatInput {...defaultProps} value="   " onSend={onSend} />);
            const buttons = screen.getAllByTestId('arco-button');
            const sendBtn = buttons[buttons.length - 1];
            fireEvent.click(sendBtn);
            expect(onSend).not.toHaveBeenCalled();
        });

        it('isLoading 时不触发 onSend', () => {
            const onSend = vi.fn();
            render(<ChatInput {...defaultProps} value="内容" isLoading onSend={onSend} />);
            const buttons = screen.getAllByTestId('arco-button');
            const sendBtn = buttons[buttons.length - 1];
            fireEvent.click(sendBtn);
            expect(onSend).not.toHaveBeenCalled();
        });

        it('disabled 时不触发 onSend', () => {
            const onSend = vi.fn();
            render(<ChatInput {...defaultProps} value="内容" disabled onSend={onSend} />);
            const buttons = screen.getAllByTestId('arco-button');
            const sendBtn = buttons[buttons.length - 1];
            fireEvent.click(sendBtn);
            expect(onSend).not.toHaveBeenCalled();
        });
    });

    // ====== 键盘快捷键 ======

    describe('键盘快捷键', () => {
        it('Enter 发送消息', () => {
            const onSend = vi.fn();
            render(<ChatInput {...defaultProps} value="你好" onSend={onSend} />);
            const textarea = screen.getByPlaceholderText('说说你现在的感受...');
            fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: false });
            expect(onSend).toHaveBeenCalledWith('你好');
        });

        it('Shift+Enter 不发送（换行）', () => {
            const onSend = vi.fn();
            render(<ChatInput {...defaultProps} value="你好" onSend={onSend} />);
            const textarea = screen.getByPlaceholderText('说说你现在的感受...');
            fireEvent.keyDown(textarea, { key: 'Enter', shiftKey: true });
            expect(onSend).not.toHaveBeenCalled();
        });

        it('IME 输入时 Enter 不发送', () => {
            const onSend = vi.fn();
            render(<ChatInput {...defaultProps} value="你好" onSend={onSend} />);
            const textarea = screen.getByPlaceholderText('说说你现在的感受...');
            // keyCode 229 是 IME 组合键
            fireEvent.keyDown(textarea, { key: 'Enter', keyCode: 229 });
            expect(onSend).not.toHaveBeenCalled();
        });
    });

    // ====== Loading 状态 ======

    describe('Loading 状态', () => {
        it('isLoading 时显示 Loading 图标', () => {
            render(<ChatInput {...defaultProps} isLoading />);
            expect(screen.getByTestId('icon-loading')).toBeInTheDocument();
        });

        it('非 loading 时显示 Send 图标', () => {
            render(<ChatInput {...defaultProps} />);
            expect(screen.getByTestId('icon-send')).toBeInTheDocument();
        });
    });

    // ====== Disclaimer ======

    describe('免责声明', () => {
        it('默认显示模型名称', () => {
            render(<ChatInput {...defaultProps} />);
            // 模型名称同时出现在 disclaimer 和下拉面板中，用 getAllByText
            expect(screen.getAllByText(/DeepSeek/).length).toBeGreaterThan(0);
        });

        it('showDisclaimer=false 时不显示', () => {
            render(<ChatInput {...defaultProps} showDisclaimer={false} />);
            expect(screen.queryByText(/DeepSeek/)).not.toBeInTheDocument();
        });
    });
});
