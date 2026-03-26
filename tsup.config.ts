import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli/index.ts'],
  format: ['esm'],
  dts: false,
  clean: true,
  banner: { js: '#!/usr/bin/env node' },
  outDir: 'dist',
  outExtension: () => ({ js: '.js' }),
  splitting: false,
  sourcemap: true,
  target: 'node20',
  shims: true,
});
