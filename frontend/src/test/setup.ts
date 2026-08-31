import '@testing-library/jest-dom/vitest';

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
