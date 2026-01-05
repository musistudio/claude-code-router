import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['packages/**/src/**/*.ts'],
      exclude: [
        'packages/**/src/**/*.test.ts',
        'packages/**/src/**/*.d.ts',
        'packages/**/dist/**',
      ],
    },
  },
  resolve: {
    alias: {
      '@CCR/shared': path.resolve(__dirname, './packages/shared/src'),
      '@CCR/cli': path.resolve(__dirname, './packages/cli/src'),
      '@CCR/server': path.resolve(__dirname, './packages/server/src'),
      '@musistudio/llms': path.resolve(__dirname, './packages/core/src'),
    },
  },
});
