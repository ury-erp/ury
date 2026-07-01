import { describe, it, expect } from 'vitest';
import { formatCurrency, formatInvoiceTime } from '../lib/utils';

// Mock the storage module since formatCurrency depends on it
vi.mock('../lib/storage', () => ({
  storage: {
    getItem: vi.fn().mockReturnValue('€'),
    setItem: vi.fn(),
  },
}));

describe('formatCurrency', () => {
  it('should format a number with currency symbol from storage', () => {
    expect(formatCurrency(0)).toBe('€ 0');
  });

  it('should format positive numbers', () => {
    expect(formatCurrency(15.5)).toBe('€ 15.5');
  });

  it('should format large numbers', () => {
    expect(formatCurrency(12345.67)).toBe('€ 12345.67');
  });

  it('should handle negative numbers', () => {
    expect(formatCurrency(-50)).toBe('€ -50');
  });

  it('should handle decimal numbers', () => {
    expect(formatCurrency(9.99)).toBe('€ 9.99');
  });
});

describe('formatInvoiceTime', () => {
  it('should return default message for null timestamp', () => {
    expect(formatInvoiceTime(null)).toBe('No bill activity yet');
  });

  it('should format a valid ISO timestamp', () => {
    const result = formatInvoiceTime('2026-07-01T14:30:00');
    // Result depends on locale, but should be a time string
    expect(result).toBeTruthy();
    expect(result).not.toBe('No bill activity yet');
  });

  it('should format a time-only string', () => {
    const result = formatInvoiceTime('14:30:00');
    expect(result).toBeTruthy();
    expect(result).not.toBe('No bill activity yet');
  });

  it('should return the original string if it cannot be parsed', () => {
    const result = formatInvoiceTime('not-a-time');
    expect(result).toBe('not-a-time');
  });
});
