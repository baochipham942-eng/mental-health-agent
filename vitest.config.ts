import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
        alias: {
            '@': path.resolve(__dirname, './'),
        },
        include: ['**/*.test.ts', '**/*.test.tsx'],
        exclude: ['node_modules', '.next', 'dist'],
        coverage: {
            provider: 'v8',
            include: ['lib/**/*.ts'],
            exclude: ['lib/**/*.test.ts', 'lib/**/*.d.ts', 'lib/**/prompts*.ts'],
        },
    },
});
