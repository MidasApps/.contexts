import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@app': path.resolve(__dirname, './app'),
      // O pacote `server-only` lança em client bundles. Em Vitest não há
      // distinção client/server, então stubamos. `pnpm build` (Next) continua
      // detectando violações reais — Sprint 1.A acceptance exige `pnpm build`.
      'server-only': path.resolve(__dirname, './src/test-stubs/server-only.ts'),
    },
  },
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      // TODO: expandir após Sprint 1 conforme novas libs entrarem
      include: ['src/shared/lib/memory/**/*.ts'],
      exclude: ['**/*.test.ts', '**/migrations/**'],
    },
  },
});
