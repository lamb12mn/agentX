import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['**/*.skip.ts', 'dist/**', 'node_modules/**'],
    testTimeout: 30000,
  },
});
