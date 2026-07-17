import '@testing-library/jest-dom';
import { server } from '../mocks/server';

// Mock window.frappe for tests
Object.defineProperty(window, 'frappe', {
  value: {
    boot: {
      lang: 'en',
      user: { name: 'Administrator' },
      csrf_token: 'test-csrf-token',
    },
    call: vi.fn(),
    db: vi.fn(),
    auth: vi.fn(),
  },
  writable: true,
});

// Mock import.meta.env for Vite
vi.stubGlobal('import.meta', {
  env: {
    VITE_FRAPPE_BASE_URL: 'http://localhost:8000',
  },
});

// Mock sessionStorage and localStorage with a real storage implementation
function createStorageMock(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (index: number) => Object.keys(store)[index] ?? null,
  };
}
Object.defineProperty(window, 'localStorage', { value: createStorageMock(), writable: true });
Object.defineProperty(window, 'sessionStorage', { value: createStorageMock(), writable: true });

// ─── MSW Server Lifecycle ─────────────────────────────────────────────────────
beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});

afterEach(() => {
  server.resetHandlers();
});

afterAll(() => {
  server.close();
});
