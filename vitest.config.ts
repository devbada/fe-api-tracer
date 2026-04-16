import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['scripts/**/*.ts', 'config.ts'],
      exclude: ['scripts/generate-api-docs.ts'],
    },
  },
});
