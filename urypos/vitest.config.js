/**
 * Vitest configuration for urypos store unit tests.
 *
 * Intentionally separate from vite.config.js because vite.config.js imports
 * proxyOptions which calls path.resolve() against a dev-server context that
 * doesn't exist during test runs.
 *
 * Environment: jsdom — provides window, navigator, localStorage, and the
 * IndexedDB API surface (polyfilled by fake-indexeddb via setupFiles).
 *
 * Run:
 *   yarn test           # watch mode
 *   yarn test:run       # single pass (CI)
 *   yarn test:ui        # browser UI
 */

import path from 'path';
import { defineConfig } from 'vitest/config';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],

  resolve: {
    alias: {
      // Match the @ alias in vite.config.js so store imports resolve correctly
      '@': path.resolve(__dirname, 'src'),
    },
  },

  test: {
    // jsdom provides browser globals: window, navigator, localStorage, etc.
    environment: 'jsdom',

    // Run before every test file — installs fake-indexeddb into globalThis
    // so OfflineDB.js sees a working indexedDB without a real browser.
    setupFiles: ['./src/stores/__tests__/setup.js'],

    // Glob covering all test files under src/
    include: ['src/**/*.{test,spec}.{js,ts}'],

    // Print each test name as it runs
    reporters: ['verbose'],

    // Inline coverage if you later add `yarn test:run --coverage`
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/stores/OfflineDB.js', 'src/stores/Offline.js'],
    },

    // Silence Vue/Pinia warn noise in test output
    globals: true,
  },
});
