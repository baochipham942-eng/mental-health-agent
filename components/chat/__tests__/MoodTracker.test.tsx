/**
 * MoodTracker 提交闭环测试：
 * - 提交后调用 logExercise 保存记录
 * - 触发 onComplete 让父卡片标记完成
 * - 完成卡片回显所选心情
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MoodTracker } from '../widgets/MoodTracker';

const { logExerciseMock } = vi.hoisted(() => ({ logExerciseMock: vi.fn() }));

vi.mock('@/lib/actions/exercise', () => ({
    logExercise: logExerciseMock,
}));

describe('MoodTracker', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        logExerciseMock.mockResolvedValue({});
    });

    it('未选择心情时点击保存不提交', () => {
        render(<MoodTracker />);
        fireEvent.click(screen.getByText('保存记录'));
        expect(logExerciseMock).not.toHaveBeenCalled();
        expect(screen.queryByText(/已记下/)).not.toBeInTheDocument();
    });

    it('选择心情并提交后保存记录、回调 onComplete、回显心情', () => {
        const onComplete = vi.fn();
        render(<MoodTracker onComplete={onComplete} />);

        fireEvent.click(screen.getByText('不错'));
        fireEvent.change(screen.getByPlaceholderText('记录一下此时此刻的想法...'), {
            target: { value: '加班到十点' },
        });
        fireEvent.click(screen.getByText('保存记录'));

        expect(logExerciseMock).toHaveBeenCalledWith({
            cardId: '情绪记录',
            title: '情绪记录',
            durationSeconds: 0,
            preMoodScore: 4,
            postMoodScore: 4,
            feedback: '加班到十点',
        });
        expect(onComplete).toHaveBeenCalledTimes(1);
        expect(screen.getByText('已记下「不错」的心情')).toBeInTheDocument();
    });

    it('无备注时 feedback 为 undefined', () => {
        render(<MoodTracker />);
        fireEvent.click(screen.getByText('很好'));
        fireEvent.click(screen.getByText('保存记录'));
        expect(logExerciseMock).toHaveBeenCalledWith(
            expect.objectContaining({ postMoodScore: 5, feedback: undefined })
        );
    });

    it('保存失败不打断完成展示（乐观 UI）', () => {
        logExerciseMock.mockRejectedValue(new Error('network'));
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        render(<MoodTracker />);
        fireEvent.click(screen.getByText('一般'));
        fireEvent.click(screen.getByText('保存记录'));
        expect(screen.getByText('已记下「一般」的心情')).toBeInTheDocument();
        errSpy.mockRestore();
    });
});
