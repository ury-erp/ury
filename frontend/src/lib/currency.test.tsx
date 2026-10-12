import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { formatCurrency, formatCompactCurrency, getCurrencyCode, getCurrencySymbol, setCurrency } from '@ury/core';
import { CurrencyIcon } from '../components/common/CurrencyIcon';

function boot(currency: string, symbol?: string, numberFormat = '#,###.##') {
  Object.assign(window, { frappe: { boot: {
    sysdefaults: { currency, number_format: numberFormat },
    docs: symbol ? [{ doctype: ':Currency', name: currency, symbol }] : [],
  } } });
}

beforeEach(() => { localStorage.clear(); setCurrency(); boot('KZT', '₸', '# ###,##'); });
afterEach(() => { setCurrency(); Object.assign(window, { frappe: undefined }); });

describe('server-backed currency formatting', () => {
  it('works on a fresh browser and survives clearing browser storage', () => {
    expect(formatCurrency(123456.78)).toBe('₸ 123 456,78');
    localStorage.setItem('currencySymbol', '₹');
    expect(formatCurrency(123456.78)).toBe('₸ 123 456,78');
    localStorage.clear();
    expect(formatCurrency(123456.78)).toBe('₸ 123 456,78');
  });

  it('tracks server country/currency changes instead of a stale symbol', () => {
    boot('INR', '₹', '#,##,###.##');
    expect(formatCurrency(123456.78)).toBe('₹ 1,23,456.78');
    boot('EUR', '€', '#.###,##');
    expect(formatCurrency(-123456.78)).toBe('€ -123.456,78');
    expect(formatCompactCurrency(8200)).toBe('€8,2K');
  });

  it('uses profile currency even if its Currency lookup has no symbol', () => {
    setCurrency('USD', '$');
    expect(getCurrencySymbol()).toBe('$');
    setCurrency('UGX');
    expect(getCurrencyCode()).toBe('UGX');
    expect(getCurrencySymbol()).toBe('UGX');
    expect(formatCompactCurrency(8200)).toContain('UGX');
    setCurrency();
    expect(getCurrencySymbol()).toBe('₸');
  });

  it('resolves guest boot with no Currency documents', () => {
    boot('KZT');
    expect(getCurrencySymbol()).toBe('₸');
    boot('UGX');
    expect(formatCurrency(160000)).toBe('UGX 160,000');
  });

  it('does not invent a currency before setup', () => {
    Object.assign(window, { frappe: undefined });
    expect(getCurrencyCode()).toBe('');
    expect(getCurrencySymbol()).toBe('');
    expect(formatCurrency(10)).toBe('10');
  });

  it('renders the Daily P&L currency symbol dynamically', () => {
    const { rerender } = render(<CurrencyIcon />);
    expect(screen.getByText('₸')).toBeInTheDocument();
    boot('EUR', '€');
    rerender(<CurrencyIcon />);
    expect(screen.getByText('€')).toBeInTheDocument();
    expect(screen.queryByText('₹')).not.toBeInTheDocument();
  });
});
