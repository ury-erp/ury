import { afterEach, describe, expect, it } from 'vitest';
import {
  formatCompactCurrency,
  formatCurrency,
  getActiveCurrency,
  MIXED_CURRENCY,
  setActiveCurrency,
} from '@ury/core';

describe('formatCurrency (@ury/core)', () => {
  afterEach(() => {
    setActiveCurrency(undefined);
    localStorage.clear();
  });

  it('formats in an explicit currency with its symbol and minor units', () => {
    expect(formatCurrency(1234.5, { code: 'AED', symbol: 'د.إ' })).toBe('د.إ 1,234.5');
    // OMR has three decimal places.
    expect(formatCurrency(12.3456, { code: 'OMR', symbol: 'ر.ع.' })).toBe('ر.ع. 12.346');
  });

  it('falls back to the ISO code when no symbol is known', () => {
    expect(formatCurrency(1500, 'OMR')).toBe('OMR 1,500');
  });

  it('keeps Indian digit grouping only for INR', () => {
    expect(formatCurrency(1234567, { code: 'INR', symbol: '₹' })).toBe('₹ 12,34,567');
    expect(formatCurrency(1234567, { code: 'AED', symbol: 'AED' })).toBe('AED 1,234,567');
  });

  it('uses the published active currency over the legacy storage symbol', () => {
    localStorage.setItem('currencySymbol', '₹');
    setActiveCurrency({ code: 'AED', symbol: 'AED' });
    expect(formatCurrency(10)).toBe('AED 10');
    expect(getActiveCurrency()?.code).toBe('AED');
  });

  it('renders a bare number for a mixed-currency scope instead of guessing', () => {
    setActiveCurrency(MIXED_CURRENCY);
    expect(formatCurrency(1234.5)).toBe('1,234.5');
  });

  it('keeps the legacy POS behaviour when nothing is published', () => {
    localStorage.setItem('currencySymbol', 'Rs');
    expect(formatCurrency(1000)).toBe('Rs 1,000');
  });
});

describe('formatCompactCurrency (@ury/core)', () => {
  afterEach(() => setActiveCurrency(undefined));

  it('uses lakh/crore units for INR', () => {
    expect(formatCompactCurrency(600000, { code: 'INR', symbol: '₹' })).toBe('₹6L');
    expect(formatCompactCurrency(12500000, { code: 'INR', symbol: '₹' })).toBe('₹1.25Cr');
  });

  it('uses K/M/B for other currencies', () => {
    expect(formatCompactCurrency(1500000, { code: 'AED', symbol: 'AED' })).toBe('AED1.5M');
    expect(formatCompactCurrency(8200, 'OMR')).toBe('OMR8.2K');
  });
});
