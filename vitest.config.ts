import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  cacheDir: 'D:/proyectos/the-builders-house/.vite-cache',
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    hookTimeout: 60000,
    fileParallelism: false,
    globalSetup: ['src/__tests__/setup/global-setup.ts'],
    include: ['src/__tests__/**/*.test.ts'],
    // Load .env so DATABASE_URL is available in globalSetup
    envFile: '.env',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/server/**/*.ts', 'src/lib/**/*.ts'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
