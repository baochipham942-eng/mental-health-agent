import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock Web Speech API if validation relies on it
Object.defineProperty(window, 'SpeechRecognition', {
    writable: true,
    value: class { },
});
Object.defineProperty(window, 'webkitSpeechRecognition', {
    writable: true,
    value: class { },
});

// Global mock: logger (almost all modules depend on it)
vi.mock('@/lib/observability/logger', () => ({
    log: vi.fn(),
    logDebug: vi.fn(),
    logInfo: vi.fn(),
    logWarn: vi.fn(),
    logError: vi.fn(),
    startTimer: vi.fn(() => ({ end: vi.fn(), endWithError: vi.fn() })),
}));

// Global mock: langfuse (deepseek.ts and others depend on it)
vi.mock('@/lib/observability/langfuse', () => ({
    getLangfuse: vi.fn(() => null),
    createTrace: vi.fn(() => null),
    createGeneration: vi.fn(() => null),
    endGeneration: vi.fn(),
    updateTrace: vi.fn(),
    flushLangfuse: vi.fn(() => Promise.resolve()),
    withTrace: vi.fn((_name: string, fn: Function) => fn(null)),
}));
