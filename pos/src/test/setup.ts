import '@testing-library/jest-dom';

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

// Mock sessionStorage and localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });
Object.defineProperty(window, 'sessionStorage', { value: localStorageMock });
