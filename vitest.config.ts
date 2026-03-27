import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli/index.ts', 'src/**/*.d.ts'],
    },
    include: ['tests/**/*.test.ts'],
    reporters: ['verbose'],
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
