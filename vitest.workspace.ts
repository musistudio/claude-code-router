import { defineWorkspace } from 'vitest/config';

export default defineWorkspace([
  {
    test: {
      name: 'core',
      include: ['packages/core/src/**/*.test.ts'],
      environment: 'node',
    },
  },
  {
    test: {
      name: 'server',
      include: ['packages/server/src/**/*.test.ts'],
      environment: 'node',
    },
  },
]);
