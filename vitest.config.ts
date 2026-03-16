import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
    plugins: [react()],
    resolve: {
        alias: {
            'next/server': path.resolve(__dirname, './node_modules/next/server.js'),
        },
    },
    test: {
        environment: 'jsdom',
        globals: true,
        setupFiles: ['./vitest.setup.ts'],
        alias: {
            '@': path.resolve(__dirname, './'),
        },
        server: {
            deps: {
                inline: ['next-auth'],
            },
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
