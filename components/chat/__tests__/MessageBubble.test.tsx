import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageBubble } from '../MessageBubble';
import type { Message } from '@/types/chat';

// Mock next/navigation
vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: vi.fn() }),
}));

// Mock react-markdown
vi.mock('react-markdown', () => ({
    default: ({ children }: any) => <div data-testid="markdown">{children}</div>,
}));

// Mock remark-breaks
vi.mock('remark-breaks', () => ({
    default: () => {},
}));

// Mock Arco UI
vi.mock('@arco-design/web-react', () => ({
    Message: { error: vi.fn() },
}));

vi.mock('@arco-design/web-react/icon', () => ({
    IconThumbUp: () => <span>👍</span>,
    IconThumbDown: () => <span>👎</span>,
    IconThumbUpFill: () => <span>👍✓</span>,
    IconThumbDownFill: () => <span>👎✓</span>,
}));

// Mock format utils
vi.mock('@/lib/utils/format', () => ({
    formatTime: () => '12:00',
}));

// Mock cn
vi.mock('@/lib/utils/cn', () => ({
    cn: (...args: any[]) => args.filter(Boolean).join(' '),
}));

// Mock chatStore
vi.mock('@/store/chatStore', () => ({
    useChatStore: () => ({
        currentState: undefined,
        isLoading: false,
    }),
}));

// Mock sub-components
vi.mock('../ConclusionSections', () => ({
    ConclusionSections: (props: any) => <div data-testid="conclusion-sections">{props.reply}</div>,
}));

vi.mock('../QuickReplies', () => ({
    QuickReplies: ({ mode }: any) => <div data-testid="quick-replies">{mode}</div>,
    detectQuickReplyMode: () => ({ mode: 'none', options: undefined, scaleContext: undefined }),
}));

vi.mock('../ResourceCard', () => ({
    ResourceCard: ({ resource }: any) => <div data-testid="resource-card">{resource.title}</div>,
}));

vi.mock('../ActionCardGrid', () => ({
    ActionCardGrid: ({ cards }: any) => <div data-testid="action-card-grid">{cards.length} cards</div>,
}));

function makeMsg(overrides: Partial<Message> = {}): Message {
    return {
        id: 'msg-1',
        role: 'assistant',
        content: '我理解你的感受',
        timestamp: new Date().toISOString(),
        ...overrides,
    };
}

describe('MessageBubble', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Mock fetch for feedback
        global.fetch = vi.fn().mockResolvedValue({ ok: true });
    });

    // ====== 基础渲染 ======

    describe('用户消息渲染', () => {
        it('渲染用户消息内容', () => {
            render(
                <MessageBubble
                    message={makeMsg({ role: 'user', content: '我今天心情不好' })}
                    sessionId="s1"
                />
            );
            expect(screen.getByText('我今天心情不好')).toBeInTheDocument();
        });

        it('用户消息不显示反馈按钮', () => {
            render(
                <MessageBubble
                    message={makeMsg({ role: 'user', content: '测试' })}
                    sessionId="s1"
                />
            );
            expect(screen.queryByTitle('有帮助')).not.toBeInTheDocument();
        });
    });

    describe('AI 消息渲染', () => {
        it('渲染 AI 消息文本', () => {
            render(
                <MessageBubble
                    message={makeMsg({ content: '我理解你的感受' })}
                    sessionId="s1"
                />
            );
            expect(screen.getByTestId('markdown')).toBeInTheDocument();
        });

        it('显示时间戳', () => {
            render(
                <MessageBubble
                    message={makeMsg()}
                    sessionId="s1"
                />
            );
            expect(screen.getByText('12:00')).toBeInTheDocument();
        });

        it('显示反馈按钮', () => {
            render(
                <MessageBubble
                    message={makeMsg()}
                    sessionId="s1"
                />
            );
            expect(screen.getByTitle('有帮助')).toBeInTheDocument();
            expect(screen.getByTitle('没感觉/不相关')).toBeInTheDocument();
        });

        it('实时搜索进行中时显示明确状态', () => {
            render(
                <MessageBubble
                    message={makeMsg({
                        content: '让我整理一下思绪',
                        metadata: {
                            webSearchProcess: {
                                status: 'started',
                                queryHint: '劳动法怎么规定产假',
                            },
                        },
                    })}
                    sessionId="s1"
                />
            );

            expect(screen.getByText('正在补充实时信息...')).toBeInTheDocument();
            expect(screen.getByText('检索线索：劳动法怎么规定产假')).toBeInTheDocument();
        });
    });

    // ====== 空消息处理 ======

    describe('空消息处理', () => {
        it('空内容 + 非 loading → 显示 debug 提示', () => {
            render(
                <MessageBubble
                    message={makeMsg({ content: '' })}
                    sessionId="s1"
                />
            );
            expect(screen.getByText('[Debug: Empty Assistant Message]')).toBeInTheDocument();
        });
    });

    // ====== 特殊内容 ======

    describe('Action Cards', () => {
        it('渲染 ActionCardGrid', () => {
            render(
                <MessageBubble
                    message={makeMsg()}
                    actionCards={[{ title: '呼吸练习', steps: ['吸气', '呼气'], when: '焦虑时', effort: 'low' as const }]}
                    sessionId="s1"
                />
            );
            expect(screen.getByTestId('action-card-grid')).toBeInTheDocument();
        });
    });

    describe('Resource Cards', () => {
        it('渲染资源卡片', () => {
            render(
                <MessageBubble
                    message={makeMsg({
                        resources: [{
                            id: 'r1',
                            title: '焦虑自助指南',
                            type: 'article',
                            url: 'https://example.com',
                            relevance: 0.9,
                        }] as any,
                    })}
                    sessionId="s1"
                />
            );
            expect(screen.getByTestId('resource-card')).toBeInTheDocument();
        });
    });

    // ====== CoT 思考过程 ======

    describe('CoT 思考过程', () => {
        it('有 safety 元数据时显示"查看思考过程"按钮', () => {
            render(
                <MessageBubble
                    message={makeMsg({
                        metadata: {
                            safety: {
                                reasoning: '用户表达焦虑',
                                label: 'normal',
                                score: 1,
                            },
                        },
                    })}
                    sessionId="s1"
                />
            );
            expect(screen.getByText('查看思考过程')).toBeInTheDocument();
        });

        it('无元数据时不显示思考按钮', () => {
            render(
                <MessageBubble
                    message={makeMsg()}
                    sessionId="s1"
                />
            );
            expect(screen.queryByText('查看思考过程')).not.toBeInTheDocument();
        });
    });

    // ====== Conclusion 阶段 ======

    describe('Conclusion 阶段', () => {
        it('assessment conclusion → 渲染 ConclusionSections', () => {
            render(
                <MessageBubble
                    message={makeMsg({ content: '评估结论' })}
                    routeType="assessment"
                    assessmentStage="conclusion"
                    sessionId="s1"
                />
            );
            expect(screen.getByTestId('conclusion-sections')).toBeInTheDocument();
        });

        it('crisis conclusion → 渲染 ConclusionSections 无 actionCards', () => {
            render(
                <MessageBubble
                    message={makeMsg({ content: '危机结论' })}
                    routeType="crisis"
                    assessmentStage="conclusion"
                    sessionId="s1"
                />
            );
            expect(screen.getByTestId('conclusion-sections')).toBeInTheDocument();
        });
    });

    // ====== Tool Calls ======

    describe('Tool Calls 渲染', () => {
        it('show_quick_replies tool call → 渲染 QuickReplies', () => {
            render(
                <MessageBubble
                    message={makeMsg({ content: '请选择' })}
                    toolCalls={[{
                        id: 'tc1',
                        type: 'function',
                        function: {
                            name: 'show_quick_replies',
                            arguments: JSON.stringify({ mode: 'choice', options: ['选项A', '选项B'] }),
                        },
                    }]}
                    sessionId="s1"
                />
            );
            expect(screen.getByTestId('quick-replies')).toBeInTheDocument();
        });

        it('render_assessment_report tool call → 渲染 ConclusionSections', () => {
            render(
                <MessageBubble
                    message={makeMsg()}
                    toolCalls={[{
                        id: 'tc2',
                        type: 'function',
                        function: {
                            name: 'render_assessment_report',
                            arguments: JSON.stringify({ summary: '评估报告内容', actionCards: [] }),
                        },
                    }]}
                    sessionId="s1"
                />
            );
            expect(screen.getByTestId('conclusion-sections')).toBeInTheDocument();
        });

        it('无效的 tool call arguments → 不崩溃', () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            render(
                <MessageBubble
                    message={makeMsg()}
                    toolCalls={[{
                        id: 'tc3',
                        type: 'function',
                        function: {
                            name: 'show_quick_replies',
                            arguments: 'invalid json{{{',
                        },
                    }]}
                    sessionId="s1"
                />
            );
            // 不应崩溃
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    // ====== thought 标签过滤 ======

    describe('thought 标签过滤', () => {
        it('thought 内容不在 displayContent 中显示', () => {
            render(
                <MessageBubble
                    message={makeMsg({
                        content: '<thought>内部分析</thought>我理解你的感受',
                    })}
                    sessionId="s1"
                />
            );
            // thought 内容不应出现在页面上（除非展开 CoT）
            const markdown = screen.getByTestId('markdown');
            expect(markdown.textContent).not.toContain('内部分析');
            expect(markdown.textContent).toContain('我理解你的感受');
        });
    });
});
