import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['pos/tests/**/*.test.{ts,tsx}'],
    // These existing files use node:test; run them with Node, not Vitest.
    exclude: ['**/node_modules/**', 'pos/tests/logout.test.ts', 'pos/tests/order-tabs.test.ts'],
    maxWorkers: 1,
    fileParallelism: false,
  },
});
