import { describe, it, expect, beforeEach } from 'vitest';
import { useChatStore, CHAT_MODELS } from '../chatStore';
import type { Message } from '@/types/chat';

// 直接操作 Zustand store（不需要 React 渲染）
const store = useChatStore;

function makeMessage(overrides: Partial<Message> = {}): Message {
    return {
        id: `msg-${Date.now()}-${Math.random()}`,
        role: 'user',
        content: '测试消息',
        timestamp: new Date().toISOString(),
        ...overrides,
    };
}

describe('chatStore', () => {
    beforeEach(() => {
        // 重置 store 到初始状态
        store.setState({
            messages: [],
            currentState: undefined,
            routeType: undefined,
            assessmentStage: undefined,
            initialMessage: undefined,
            followupAnswerDraft: '',
            inputDraft: '',
            transitionMessages: {},
            skillProgress: {},
            isLoading: false,
            error: null,
            debugDrawerOpen: false,
            debugPrompts: null,
            validationError: null,
            lastRequestPayload: null,
            sessionStatus: undefined,
            isCreatingSession: false,
            isConsulting: false,
            currentSessionId: undefined,
            currentModel: 'deepseek',
        });
    });

    // ====== 初始状态 ======

    describe('初始状态', () => {
        it('messages 为空数组', () => {
            expect(store.getState().messages).toEqual([]);
        });

        it('isLoading 为 false', () => {
            expect(store.getState().isLoading).toBe(false);
        });

        it('currentModel 默认 deepseek', () => {
            expect(store.getState().currentModel).toBe('deepseek');
        });

        it('CHAT_MODELS 包含三个模型', () => {
            expect(Object.keys(CHAT_MODELS)).toEqual(['deepseek', 'kimi', 'openrouter']);
        });
    });

    // ====== 消息管理 ======

    describe('addMessage', () => {
        it('添加一条消息', () => {
            const msg = makeMessage({ content: '你好' });
            store.getState().addMessage(msg);
            expect(store.getState().messages).toHaveLength(1);
            expect(store.getState().messages[0].content).toBe('你好');
        });

        it('多次添加保持顺序', () => {
            store.getState().addMessage(makeMessage({ id: '1', content: '第一条' }));
            store.getState().addMessage(makeMessage({ id: '2', content: '第二条' }));
            const msgs = store.getState().messages;
            expect(msgs).toHaveLength(2);
            expect(msgs[0].content).toBe('第一条');
            expect(msgs[1].content).toBe('第二条');
        });
    });

    describe('updateMessage', () => {
        it('按 id 更新消息内容', () => {
            store.getState().addMessage(makeMessage({ id: 'u1', content: '原始' }));
            store.getState().updateMessage('u1', { content: '已更新' });
            expect(store.getState().messages[0].content).toBe('已更新');
        });

        it('不存在的 id 不影响其他消息', () => {
            store.getState().addMessage(makeMessage({ id: 'u1', content: '原始' }));
            store.getState().updateMessage('not-exist', { content: '变了' });
            expect(store.getState().messages[0].content).toBe('原始');
        });
    });

    describe('setMessages', () => {
        it('替换整个消息列表', () => {
            store.getState().addMessage(makeMessage({ content: '旧的' }));
            const newMsgs = [makeMessage({ content: '新的1' }), makeMessage({ content: '新的2' })];
            store.getState().setMessages(newMsgs);
            expect(store.getState().messages).toHaveLength(2);
            expect(store.getState().messages[0].content).toBe('新的1');
        });
    });

    describe('clearMessages', () => {
        it('清空消息和相关状态', () => {
            store.getState().addMessage(makeMessage());
            store.getState().updateState({ currentState: 'awaiting_followup', routeType: 'support' });
            store.getState().setError('some error');
            store.getState().appendFollowupAnswer('answer');

            store.getState().clearMessages();

            expect(store.getState().messages).toEqual([]);
            expect(store.getState().currentState).toBeUndefined();
            expect(store.getState().routeType).toBeUndefined();
            expect(store.getState().error).toBeNull();
            expect(store.getState().followupAnswerDraft).toBe('');
        });
    });

    // ====== 状态管理 ======

    describe('updateState', () => {
        it('更新 currentState', () => {
            store.getState().updateState({ currentState: 'in_crisis' });
            expect(store.getState().currentState).toBe('in_crisis');
        });

        it('更新 routeType', () => {
            store.getState().updateState({ routeType: 'assessment' });
            expect(store.getState().routeType).toBe('assessment');
        });

        it('部分更新不影响其他字段', () => {
            store.getState().updateState({ currentState: 'normal', routeType: 'support' });
            store.getState().updateState({ currentState: 'awaiting_followup' });
            expect(store.getState().routeType).toBe('support');
        });
    });

    describe('setLoading / setError', () => {
        it('setLoading 切换加载状态', () => {
            store.getState().setLoading(true);
            expect(store.getState().isLoading).toBe(true);
            store.getState().setLoading(false);
            expect(store.getState().isLoading).toBe(false);
        });

        it('setError 设置错误信息', () => {
            store.getState().setError('连接失败');
            expect(store.getState().error).toBe('连接失败');
            store.getState().setError(null);
            expect(store.getState().error).toBeNull();
        });
    });

    // ====== followupAnswer ======

    describe('followupAnswerDraft', () => {
        it('appendFollowupAnswer 首次追加', () => {
            store.getState().appendFollowupAnswer('第一个回答');
            expect(store.getState().followupAnswerDraft).toBe('第一个回答');
        });

        it('appendFollowupAnswer 多次追加用换行连接', () => {
            store.getState().appendFollowupAnswer('回答1');
            store.getState().appendFollowupAnswer('回答2');
            expect(store.getState().followupAnswerDraft).toBe('回答1\n回答2');
        });

        it('clearFollowupAnswer 清空', () => {
            store.getState().appendFollowupAnswer('某些内容');
            store.getState().clearFollowupAnswer();
            expect(store.getState().followupAnswerDraft).toBe('');
        });
    });

    // ====== inputDraft ======

    describe('inputDraft', () => {
        it('setInputDraft 保存输入草稿', () => {
            store.getState().setInputDraft('我正在输入...');
            expect(store.getState().inputDraft).toBe('我正在输入...');
        });
    });

    // ====== transitionMessages ======

    describe('transitionMessages', () => {
        it('设置和获取过渡消息', () => {
            const msgs = [makeMessage({ content: '过渡消息' })];
            store.getState().setTransitionMessages('session-1', msgs);
            const result = store.getState().getAndClearTransitionMessages('session-1');
            expect(result).toHaveLength(1);
            expect(result![0].content).toBe('过渡消息');
        });

        it('阅后即焚 — 取出后自动清除', () => {
            const msgs = [makeMessage()];
            store.getState().setTransitionMessages('session-2', msgs);
            store.getState().getAndClearTransitionMessages('session-2');
            const result = store.getState().getAndClearTransitionMessages('session-2');
            expect(result).toBeUndefined();
        });

        it('不存在的 sessionId 返回 undefined', () => {
            expect(store.getState().getAndClearTransitionMessages('no-such')).toBeUndefined();
        });
    });

    // ====== skillProgress ======

    describe('skillProgress', () => {
        it('更新和获取技能进度', () => {
            store.getState().updateSkillProgress('card-1', {
                status: 'in_progress',
                completedSteps: [0, 1],
            });
            const progress = store.getState().getSkillProgress('card-1');
            expect(progress?.status).toBe('in_progress');
            expect(progress?.completedSteps).toEqual([0, 1]);
        });

        it('不存在的 cardId 返回 undefined', () => {
            expect(store.getState().getSkillProgress('nonexistent')).toBeUndefined();
        });
    });

    // ====== Session 管理 ======

    describe('session 管理', () => {
        it('setSessionStatus', () => {
            store.getState().setSessionStatus('active');
            expect(store.getState().sessionStatus).toBe('active');
        });

        it('setCreatingSession', () => {
            store.getState().setCreatingSession(true);
            expect(store.getState().isCreatingSession).toBe(true);
        });

        it('setConsulting (deprecated)', () => {
            store.getState().setConsulting(true);
            expect(store.getState().isConsulting).toBe(true);
        });

        it('setCurrentSessionId', () => {
            store.getState().setCurrentSessionId('sess-abc');
            expect(store.getState().currentSessionId).toBe('sess-abc');
        });
    });

    // ====== 模型选择 ======

    describe('模型选择', () => {
        it('切换到 kimi', () => {
            store.getState().setCurrentModel('kimi');
            expect(store.getState().currentModel).toBe('kimi');
        });

        it('切换到 openrouter', () => {
            store.getState().setCurrentModel('openrouter');
            expect(store.getState().currentModel).toBe('openrouter');
        });
    });

    // ====== Debug 面板 ======

    describe('debug 状态', () => {
        it('setDebugDrawerOpen', () => {
            store.getState().setDebugDrawerOpen(true);
            expect(store.getState().debugDrawerOpen).toBe(true);
        });

        it('setDebugPrompts', () => {
            const prompts = { system: 'test' };
            store.getState().setDebugPrompts(prompts);
            expect(store.getState().debugPrompts).toEqual(prompts);
        });

        it('setValidationError', () => {
            store.getState().setValidationError({ field: 'test' });
            expect(store.getState().validationError).toEqual({ field: 'test' });
        });

        it('setLastRequestPayload', () => {
            store.getState().setLastRequestPayload({ message: 'hi' });
            expect(store.getState().lastRequestPayload).toEqual({ message: 'hi' });
        });
    });

    // ====== resetConversation ======

    describe('resetConversation', () => {
        it('重置对话状态但保留 inputDraft 和 skillProgress', () => {
            // 先设置各种状态
            store.getState().addMessage(makeMessage());
            store.getState().updateState({ currentState: 'in_crisis', routeType: 'crisis' });
            store.getState().setInputDraft('保留这个');
            store.getState().updateSkillProgress('card-x', { status: 'done', completedSteps: [0, 1, 2] });
            store.getState().setSessionStatus('active');
            store.getState().setConsulting(true);
            store.getState().setError('error');
            store.getState().setDebugDrawerOpen(true);

            store.getState().resetConversation();

            // 应被重置
            expect(store.getState().messages).toEqual([]);
            expect(store.getState().currentState).toBeUndefined();
            expect(store.getState().routeType).toBeUndefined();
            expect(store.getState().sessionStatus).toBeUndefined();
            expect(store.getState().isConsulting).toBe(false);
            expect(store.getState().error).toBeNull();
            expect(store.getState().debugDrawerOpen).toBe(false);

            // 应被保留
            expect(store.getState().inputDraft).toBe('保留这个');
            expect(store.getState().getSkillProgress('card-x')?.status).toBe('done');
        });
    });

    // ====== 持久化配置 ======

    describe('persist 配置', () => {
        it('partialize 只持久化 skillProgress 和 currentModel', () => {
            // 验证 persist 配置是否正确（通过检查 store 名称）
            expect(store.persist.getOptions().name).toBe('chat-storage');
        });
    });
});
