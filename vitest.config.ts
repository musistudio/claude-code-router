import { defineConfig } from 'vitest/config'

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
})
