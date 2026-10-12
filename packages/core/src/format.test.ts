import { afterEach, describe, expect, it } from 'vitest';
import { formatCompactCurrency, formatCurrency, setCompactSuffixes } from './format';
import { setIntlLocale } from './i18n/locale-registry';
import { storage } from './storage';

describe('formatCurrency', () => {
  afterEach(() => {
    storage.removeItem('currency');
    storage.removeItem('currencySymbol');
    setIntlLocale('ar-IQ-u-nu-latn');
  });

  it('defaults to Iraqi dinars, whole and symbol after — never rupees', () => {
    expect(formatCurrency(25000)).toBe('25,000 د.ع');
    expect(formatCurrency(7499.6)).toBe('7,500 د.ع');
  });

  it('labels the dinar in English as IQD', () => {
    setIntlLocale('en-US');
    expect(formatCurrency(1500)).toBe('1,500 IQD');
  });

  it('keeps another configured currency as before', () => {
    storage.setItem('currency', 'USD');
    storage.setItem('currencySymbol', '$');
    expect(formatCurrency(12.5)).toBe('$ 12.5');
  });

  it('compacts dinars with Arabic units', () => {
    setCompactSuffixes({ thousand: 'ألف', million: 'مليون' });
    expect(formatCompactCurrency(25000)).toBe('25 ألف د.ع');
    expect(formatCompactCurrency(1_500_000)).toBe('1.5 مليون د.ع');
  });
});
