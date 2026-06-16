import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ChatShell } from '../ChatShell';

const routerPush = vi.fn();

const storeState = {
  messages: [],
  currentState: undefined,
  routeType: undefined,
  assessmentStage: undefined,
  initialMessage: undefined,
  followupAnswerDraft: '',
  isLoading: false,
  error: null,
  debugPrompts: null,
  validationError: null,
  addMessage: vi.fn(),
  updateMessage: vi.fn(),
  setLoading: vi.fn(),
  setError: vi.fn(),
  updateState: vi.fn(),
  clearMessages: vi.fn(),
  appendFollowupAnswer: vi.fn(),
  clearFollowupAnswer: vi.fn(),
  setDebugPrompts: vi.fn(),
  setValidationError: vi.fn(),
  setLastRequestPayload: vi.fn(),
  lastRequestPayload: null,
  resetConversation: vi.fn(),
  inputDraft: '',
  setInputDraft: vi.fn(),
  setMessages: vi.fn(),
  debugDrawerOpen: false,
  setDebugDrawerOpen: vi.fn(),
  setTransitionMessages: vi.fn(),
  getAndClearTransitionMessages: vi.fn(),
  currentSessionId: undefined,
  setCurrentSessionId: vi.fn(),
  sessionStatus: undefined,
  setSessionStatus: vi.fn(),
  isCreatingSession: false,
  setCreatingSession: vi.fn(),
  isConsulting: false,
  setConsulting: vi.fn(),
  currentModel: 'deepseek',
};

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock('@/store/chatStore', () => {
  const useChatStore = vi.fn(() => storeState) as any;
  useChatStore.getState = vi.fn(() => storeState);
  return {
    useChatStore,
    CHAT_MODELS: {
      deepseek: { label: 'DeepSeek V3', modelName: 'deepseek-chat' },
      kimi: { label: 'Kimi K2.5', modelName: 'kimi-k2.5' },
      openrouter: { label: 'GPT 5.5', modelName: 'openai/gpt-5.5' },
    },
  };
});

vi.mock('../MessageList', () => ({
  MessageList: () => <div data-testid="message-list" />,
}));

vi.mock('../ChatInput', () => ({
  ChatInput: () => <textarea aria-label="输入消息" />,
}));

vi.mock('../DebugDrawer', () => ({
  DebugDrawer: () => null,
}));

vi.mock('../TherapistSelector', () => ({
  TherapistSelector: () => <div>选一个你喜欢的聊天风格</div>,
}));

vi.mock('../BreathingOrb', () => ({
  BreathingOrb: () => <div data-testid="breathing-orb" />,
}));

vi.mock('../MoodBar', () => ({
  MoodBar: () => <div data-testid="mood-bar" />,
}));

vi.mock('../LeaveDialog', () => ({
  LeaveDialog: () => null,
}));

vi.mock('../MoodShiftToast', () => ({
  MoodShiftToast: () => null,
}));

vi.mock('@arco-design/web-react', () => ({
  Modal: ({ children, visible }: any) => (visible ? <div role="dialog">{children}</div> : null),
  Tag: ({ children }: any) => <span>{children}</span>,
  Message: { error: vi.fn(), success: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

vi.mock('@/lib/api/chat', () => ({
  getStructuredReplyFallback: vi.fn(),
  sendChatMessage: vi.fn(),
}));

vi.mock('@/lib/actions/chat', () => ({
  completeSession: vi.fn(),
  hideSession: vi.fn(),
}));

vi.mock('@/lib/actions/summary', () => ({
  generateSummaryForSession: vi.fn(),
}));

vi.mock('@/lib/mood-theme', async () => {
  const actual = await vi.importActual<any>('@/lib/mood-theme');
  return {
    ...actual,
    applyMoodColor: vi.fn(),
  };
});

const demoUser = {
  id: 'demo-user',
  name: 'demo',
  username: 'demo',
  nickname: '长青之锚',
  avatar: '/avatars/loyal.png',
  quickLoginToken: 'token',
};

describe('ChatShell therapist header', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uses the saved therapist as visible chat style without showing the selector', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      json: async () => ({ preferredTherapist: 'xiaowarm' }),
    })));

    render(<ChatShell initialMessages={[]} user={demoUser as any} />);

    expect(screen.getByRole('heading', { name: '心灵树洞' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText('小温陪你聊一会儿')).toBeInTheDocument();
    });
    expect(screen.getByLabelText('当前聊天风格：小温')).toBeInTheDocument();
    expect(screen.queryByText('选一个你喜欢的聊天风格')).not.toBeInTheDocument();
  });

  it('assigns a random therapist for a fresh chat when no preference exists', async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => ({
      json: async () => (init?.method === 'PATCH' ? {} : { preferredTherapist: null }),
    }));
    vi.stubGlobal('fetch', fetchMock);

    render(<ChatShell initialMessages={[]} user={demoUser as any} />);

    await waitFor(() => {
      expect(screen.getByText(/陪你聊一会儿/)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/user/preferences',
      expect.objectContaining({ method: 'PATCH' }),
    );
    expect(screen.queryByText('选一个你喜欢的聊天风格')).not.toBeInTheDocument();
  });
});
