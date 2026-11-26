import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/packages/*/test/**/*.test.ts', 'src/apps/cli/test/**/*.test.ts', 'src/apps/desktop/test/**/*.test.ts'],
    environment: 'node',
    passWithNoTests: false,
    coverage: {
      provider: 'v8',
      include: ['src/packages/core/src/**/*.ts'],
      exclude: ['src/packages/core/src/**/index.ts'],
      reporter: ['text', 'json-summary'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
        statements: 80,
      },
    },
  },
});