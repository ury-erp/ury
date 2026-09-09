import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// Global safety net: several test files only call cleanup() in beforeEach,
// not afterEach, so a component with a pending async update (a mocked API
// call that resolves after the test's assertions run) can leak a setState
// into whichever file's environment gets torn down next -- something that
// only reliably surfaces when the vitest worker happens to order files a
// particular way (CI and local runs don't always agree on file order),
// making it look like a different, unrelated file broke each time. One
// global afterEach(cleanup) here means every file gets unmounted regardless
// of whether it remembers to do so itself.
afterEach(() => {
  cleanup();
});

const storage = new Map<string, string>();

Object.defineProperty(window, 'localStorage', {
  value: {
    clear: () => storage.clear(),
    getItem: (key: string) => storage.get(key) ?? null,
    key: (index: number) => Array.from(storage.keys())[index] ?? null,
    removeItem: (key: string) => storage.delete(key),
    setItem: (key: string, value: string) => storage.set(key, String(value)),
    get length() {
      return storage.size;
    },
  },
  configurable: true,
});

// Mock ResizeObserver for recharts and other libraries
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
};
