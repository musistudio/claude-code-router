import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: [
      'packages/*/tests/**/*.test.ts',
    ],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  resolve: {
    alias: {
      '@musistudio/llms': resolve(__dirname, 'packages/core/src/server.ts'),
      '@CCR/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@': resolve(__dirname, 'packages/core/src'),
    },
  },
})
