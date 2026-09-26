/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

// Mirrors packages/ui/vite.config.ts's `test` block. packages/core has no
// DOM-dependent code under test, so environment is plain node (no jsdom).
export default defineConfig({
  test: {
    environment: 'node',
  },
});
