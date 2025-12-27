import '@testing-library/jest-dom';

// Mock Web Speech API if validation relies on it
Object.defineProperty(window, 'SpeechRecognition', {
    writable: true,
    value: class { },
});
Object.defineProperty(window, 'webkitSpeechRecognition', {
    writable: true,
    value: class { },
});
