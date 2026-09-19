/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Mirrors frontend/vite.config.ts's `test` block — packages/ui had no test
// runner wired up before this (see editable-table.test.tsx).
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
  },
});
