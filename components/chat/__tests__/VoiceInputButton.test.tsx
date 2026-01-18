import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceInputButton } from '../VoiceInputButton';
import { useCloudVoiceRecognition } from '@/hooks/useCloudVoiceRecognition';

// Mock Hooks
vi.mock('@/hooks/useVoiceRecognition', () => ({
    useVoiceRecognition: () => ({
        status: 'idle',
        isSupported: false,
        error: null,
    }),
}));

vi.mock('@/hooks/useCloudVoiceRecognition', () => ({
    useCloudVoiceRecognition: vi.fn(),
}));

// Mock Arco Tooltip
vi.mock('@arco-design/web-react', () => ({
    Tooltip: ({ children, content }: any) => <div data-testid="tooltip" title={content}>{children}</div>,
}));

describe('VoiceInputButton Style & Logic', () => {
    const mockToggle = vi.fn();

    beforeEach(() => {
        vi.clearAllMocks();
        // Force fallback to Cloud Speech by hiding Web Speech API
        // Use assignment because the property is non-configurable but writable
        (window as any).SpeechRecognition = undefined;
        (window as any).webkitSpeechRecognition = undefined;
    });

    it('renders idle state correctly', () => {
        vi.mocked(useCloudVoiceRecognition).mockReturnValue({
            status: 'idle',
            isSupported: true, // Must be true to render
            toggle: mockToggle,
            duration: 0,
            start: vi.fn(),
            stop: vi.fn(),
            error: null,
        });

        render(<VoiceInputButton onTranscript={() => { }} />);

        const button = screen.getByRole('button', { name: /开始语音输入/i });
        expect(button).toBeInTheDocument();
        // Idle classes
        expect(button).toHaveClass('text-gray-400');
        expect(button).not.toHaveClass('bg-red-500');
    });

    it('renders recording state correctly (Red + Shadow)', () => {
        vi.mocked(useCloudVoiceRecognition).mockReturnValue({
            status: 'recording',
            isSupported: true,
            toggle: mockToggle,
            duration: 5,
            start: vi.fn(),
            stop: vi.fn(),
            error: null,
        });

        render(<VoiceInputButton onTranscript={() => { }} />);

        const button = screen.getByRole('button', { name: /停止录音/i });
        expect(button).toHaveClass('bg-red-500');
        expect(button).toHaveClass('shadow-md');
    });

    it('renders transcribing state correctly (Blue + Disabled)', () => {
        vi.mocked(useCloudVoiceRecognition).mockReturnValue({
            status: 'transcribing',
            isSupported: true,
            toggle: mockToggle,
            duration: 5,
            start: vi.fn(),
            stop: vi.fn(),
            error: null,
        });

        render(<VoiceInputButton onTranscript={() => { }} />);

        const button = screen.getByRole('button');
        expect(button).toBeDisabled();
        expect(button).toHaveClass('bg-blue-500');

        // Check for spinner
        const spinner = button.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
    });
});
