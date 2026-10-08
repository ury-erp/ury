import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getCurrencyInfo } from '../lib/pos-profile-api';
import { usePOSStore } from './pos-store';

vi.mock('../lib/pos-profile-api', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, getCurrencyInfo: vi.fn() };
});

describe('POS store currency symbol', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getCurrencyInfo).mockReset();
    vi.mocked(getCurrencyInfo).mockImplementation(async (code: string) => ({
      name: code,
      symbol: code === 'OMR' ? 'ر.ع.' : 'د.إ',
    }) as any);
  });

  it('refetches the symbol when the profile currency differs from the cached one', async () => {
    // Left over from a UAE profile.
    localStorage.setItem('currencySymbol', 'د.إ');
    localStorage.setItem('currencySymbolCode', 'AED');

    usePOSStore.setState({ currency: 'OMR' });
    await usePOSStore.getState().ensureCurrencySymbol();

    expect(getCurrencyInfo).toHaveBeenCalledWith('OMR');
    expect(usePOSStore.getState().currencySymbol).toBe('ر.ع.');
    expect(localStorage.getItem('currencySymbol')).toBe('ر.ع.');
    expect(localStorage.getItem('currencySymbolCode')).toBe('OMR');
  });

  it('reuses the cached symbol for the same currency', async () => {
    localStorage.setItem('currencySymbol', 'د.إ');
    localStorage.setItem('currencySymbolCode', 'AED');

    usePOSStore.setState({ currency: 'AED', currencySymbol: null });
    await usePOSStore.getState().ensureCurrencySymbol();

    expect(getCurrencyInfo).not.toHaveBeenCalled();
    expect(usePOSStore.getState().currencySymbol).toBe('د.إ');
  });

  it('does not trust a cached symbol with no recorded currency', async () => {
    localStorage.setItem('currencySymbol', '₹');

    usePOSStore.setState({ currency: 'AED' });
    await usePOSStore.getState().ensureCurrencySymbol();

    expect(getCurrencyInfo).toHaveBeenCalledWith('AED');
    expect(usePOSStore.getState().currencySymbol).toBe('د.إ');
  });
});
