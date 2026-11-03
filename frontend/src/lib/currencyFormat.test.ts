import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatCompactCurrency,
  formatCurrency,
  getActiveCurrency,
  MIXED_CURRENCY,
  setActiveCurrency,
  currencyDisplaySymbol,
  siteCurrencyCode,
  SAR_SIGN,
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

describe('site currency resolution and Saudi riyal sign (@ury/core)', () => {
  const setBoot = (currency?: string) => {
    (globalThis as unknown as { frappe?: unknown }).frappe = currency ? { boot: { sysdefaults: { currency } } } : undefined;
  };
  afterEach(() => {
    setBoot(undefined);
    setActiveCurrency(undefined);
    localStorage.clear();
    document.documentElement.removeAttribute('dir');
    document.documentElement.removeAttribute('lang');
    vi.restoreAllMocks();
  });

  it('INR default is unchanged when there is no boot', () => {
    expect(siteCurrencyCode()).toBeNull();
    expect(formatCurrency(1234567.5)).toBe('₹ 12,34,567.5');
    expect(formatCompactCurrency(600000)).toBe('₹6L');
  });

  it('uses the site currency from the boot payload when none is passed', () => {
    setBoot('USD');
    expect(siteCurrencyCode()).toBe('USD');
    expect(formatCurrency(1234.5, { code: 'USD', symbol: '$' })).toBe('$ 1,234.5');
    expect(formatCurrency(1234567)).toBe('USD 1,234,567');
    expect(formatCompactCurrency(2500000)).toBe('USD2.5M');
  });

  it('SAR always renders the official sign, whatever the Currency doc holds', () => {
    expect(SAR_SIGN).toBe('\u20C1');
    expect(currencyDisplaySymbol('SAR', '\uFDFC')).toBe(SAR_SIGN);
    expect(formatCurrency(1234.5, { code: 'SAR', symbol: '\uFDFC' })).toBe(`${SAR_SIGN} 1,234.5`);
    setBoot('SAR');
    expect(formatCurrency(10)).toBe(`${SAR_SIGN} 10`);
  });

  it('AED uses the Currency doc symbol, then the ISO code', () => {
    expect(formatCurrency(50, { code: 'AED', symbol: 'د.إ' })).toBe('د.إ 50');
    setBoot('AED');
    expect(formatCurrency(1500)).toBe('AED 1,500');
    expect(formatCompactCurrency(1500000, 'AED')).toBe('AED1.5M');
  });

  it('isolates the amount LTR in an RTL UI (LRI..PDI, amount then symbol)', () => {
    document.documentElement.setAttribute('dir', 'rtl');
    expect(formatCurrency(1234.5, { code: 'SAR' })).toBe(`\u20661,234.5 ${SAR_SIGN}\u2069`);
    expect(formatCurrency(1234.5, { code: 'AED', symbol: 'AED' })).toBe('\u20661,234.5 AED\u2069');
    expect(formatCompactCurrency(1500000, { code: 'AED', symbol: 'AED' })).toBe('\u20661.5MAED\u2069');
  });

  it('Arabic lang attribute also counts as RTL; LTR leaves no isolation marks', () => {
    document.documentElement.setAttribute('lang', 'ar');
    expect(formatCurrency(10, 'USD')).toBe('\u206610 USD\u2069');
    document.documentElement.setAttribute('lang', 'en');
    expect(formatCurrency(10, 'USD')).toBe('USD 10');
  });
});
