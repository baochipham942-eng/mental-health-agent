import { renderHook, act, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useCloudVoiceRecognition } from '../useCloudVoiceRecognition';

// Mock lib/utils/audio
vi.mock('@/lib/utils/audio', () => ({
    downsampleBuffer: vi.fn(() => new Float32Array(100)),
    floatTo16BitPCM: vi.fn(() => new ArrayBuffer(200)),
    bufferToPCM: vi.fn(),
    bufferToWav: vi.fn(),
}));

// Mock URL.createObjectURL
global.URL.createObjectURL = vi.fn(() => 'mock-url');
global.URL.revokeObjectURL = vi.fn();

describe('useCloudVoiceRecognition', () => {
    let mockMediaRecorder: any;
    let mockGetUserMedia: any;
    let mockFetch: any;

    beforeEach(() => {
        vi.clearAllMocks();

        // Mock AudioContext
        // Mock AudioContext
        // Use a function so it can be called with new
        (window as any).AudioContext = vi.fn(function () {
            return {
                createBuffer: vi.fn(() => ({
                    copyToChannel: vi.fn(),
                })),
                decodeAudioData: vi.fn().mockResolvedValue({
                    sampleRate: 48000,
                    length: 48000,
                    duration: 1,
                    numberOfChannels: 1,
                    getChannelData: vi.fn(() => new Float32Array(48000)),
                }),
            };
        });
        (window as any).webkitAudioContext = (window as any).AudioContext;

        // Mock MediaRecorder instance
        mockMediaRecorder = {
            start: vi.fn(),
            stop: vi.fn(),
            state: 'inactive',
            ondataavailable: null,
            onstop: null,
            mimeType: 'audio/webm',
        };

        // Mock MediaRecorder Constructor (Must be a function, not arrow)
        (window as any).MediaRecorder = vi.fn(function () {
            return mockMediaRecorder;
        });
        (window as any).MediaRecorder.isTypeSupported = vi.fn(() => true);

        // Mock getUserMedia
        mockGetUserMedia = vi.fn().mockResolvedValue({
            getTracks: vi.fn(() => [{ stop: vi.fn() }]),
        });

        Object.defineProperty(navigator, 'mediaDevices', {
            value: { getUserMedia: mockGetUserMedia },
            writable: true,
        });

        // Mock Fetch
        mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue({
            ok: true,
            json: async () => ({ text: 'Test Transcript' }),
        } as Response);

        // Mock global Blob to support arrayBuffer in JSDOM
        const OriginalBlob = global.Blob;
        global.Blob = class MockBlob extends OriginalBlob {
            constructor(blobParts?: BlobPart[], options?: BlobPropertyBag) {
                super(blobParts, options);
            }
            arrayBuffer() {
                return Promise.resolve(new ArrayBuffer(100));
            }
            // Add slice if needed, but JSDOM usually has it
        } as any;
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    // Test 1: Short Audio Rejection
    it('should not upload if recording is too short (< 1s)', async () => {
        const { result } = renderHook(() => useCloudVoiceRecognition());

        await act(async () => {
            result.current.start();
        });

        expect(result.current.status).toBe('recording');

        // Verify that passing data and stopping quickly (simulated) results in NO fetch
        // We simulate that only 100ms passed (Date.now is mocked or we rely on speed)
        // Wait, the hook uses Date.now(). We should mock system time if we want determinstic behavior.
        // But for "too short", usually strict immediate stop is enough.

        // Mock Date.now relative to start
        const startTime = Date.now();
        vi.setSystemTime(startTime + 500); // 500ms elapsed

        await act(async () => {
            if (mockMediaRecorder.ondataavailable) {
                mockMediaRecorder.ondataavailable({ data: new Blob(['short'], { type: 'audio/webm' }) });
            }
            result.current.stop();
            // Manually trigger onstop
            if (mockMediaRecorder.onstop) {
                mockMediaRecorder.onstop();
            }
        });

        expect(mockFetch).not.toHaveBeenCalled();
        expect(result.current.status).toBe('idle');
    });

    // Test 2: Normal Audio Upload
    it('should upload if recording is normal (> 1s)', async () => {
        const { result } = renderHook(() => useCloudVoiceRecognition());

        const startTime = Date.now();
        vi.setSystemTime(startTime);

        await act(async () => {
            result.current.start();
        });

        // Advance time > 1s
        vi.setSystemTime(startTime + 1500);

        await act(async () => {
            if (mockMediaRecorder.ondataavailable) {
                const mockBlob = new Blob(['audio data'], { type: 'audio/webm' });
                // Patch arrayBuffer method for JSDOM environment
                (mockBlob as any).arrayBuffer = vi.fn().mockResolvedValue(new ArrayBuffer(100));

                mockMediaRecorder.ondataavailable({ data: mockBlob });
            }
            result.current.stop();
            if (mockMediaRecorder.onstop) {
                await mockMediaRecorder.onstop();
            }
        });

        // Verify fetch
        await waitFor(() => {
            expect(mockFetch).toHaveBeenCalledWith('/api/speech/transcribe', expect.objectContaining({
                method: 'POST',
            }));
        });

        // Verify PCM format
        const formData = mockFetch.mock.calls[0][1].body as FormData;
        const file = formData.get('audio') as File;
        expect(file.name).toBe('recording.pcm');
    });

    // Test 3: Rapid Toggle
    it('should prevent rapid toggle/start race conditions', async () => {
        const { result } = renderHook(() => useCloudVoiceRecognition());

        await act(async () => {
            result.current.start();
            result.current.start();
            result.current.start();
        });

        // Should lock and only call getUserMedia once
        expect(mockGetUserMedia).toHaveBeenCalledTimes(1);
    });
});
