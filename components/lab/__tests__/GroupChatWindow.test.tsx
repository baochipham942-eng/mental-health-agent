import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GroupChatWindow } from '../GroupChatWindow';

const sendMessageMock = vi.fn();
const stopMock = vi.fn();

vi.mock('@/hooks/useGroupChat', () => ({
  useGroupChat: () => ({
    messages: [
      {
        id: 'u1',
        role: 'user',
        content: '最近有点累',
      },
      {
        id: 'm1',
        role: 'assistant',
        mentorId: 'socrates',
        mentorName: '苏格拉底',
        mentorAvatar: '🏛️',
        content: '我们先问清楚累来自哪里。',
        round: 1,
      },
    ],
    sendMessage: sendMessageMock,
    isLoading: false,
    activeMentorId: null,
    currentRound: 1,
    stop: stopMock,
  }),
}));

vi.mock('@/lib/ai/mentors/personas', () => ({
  getMentor: (id: string) => ({
    id,
    name: id === 'socrates' ? '苏格拉底' : '荣格',
    avatar: id === 'socrates' ? '🏛️' : '🌑',
    color: 'slate',
  }),
}));

vi.mock('@arco-design/web-react', () => ({
  Button: ({ children, icon, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>
      {icon}
      {children}
    </button>
  ),
  Input: ({ value, onChange, onPressEnter, ...props }: any) => (
    <input
      value={value}
      onChange={(event) => onChange?.(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === 'Enter') onPressEnter?.(event);
      }}
      {...props}
    />
  ),
}));

vi.mock('@arco-design/web-react/icon', () => ({
  IconSend: () => <span>send</span>,
  IconClose: () => <span>close</span>,
  IconUser: () => <span>user</span>,
}));

vi.mock('react-markdown', () => ({
  default: ({ children }: any) => <>{children}</>,
}));

describe('GroupChatWindow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.style.overflow = '';
  });

  it('sends the summary quick action with summarize intent', async () => {
    render(
      <GroupChatWindow
        mentorIds={['socrates', 'jung']}
        mode="discuss"
        topic="最近有点累"
        onClose={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('总结观点')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('总结观点'));

    expect(sendMessageMock).toHaveBeenLastCalledWith(
      '请各位对刚才的讨论做一个简短的总结。',
      'summarize',
    );
  });
});
