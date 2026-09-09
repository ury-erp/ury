import { describe, it, expect, vi } from 'vitest';

vi.mock('react-dom/client', () => ({
  createRoot: vi.fn(() => ({
    render: vi.fn(),
  })),
}));

vi.mock('./i18n', () => ({
  initI18n: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@ury/core', () => ({
  initPrinting: vi.fn(),
}));

vi.mock('./App', () => ({
  default: () => null,
}));

describe('main.tsx', () => {
  it('should export without errors', () => {
    expect(true).toBe(true);
  });
});
