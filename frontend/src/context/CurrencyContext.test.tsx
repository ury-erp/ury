import React, { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { call, formatCurrency, getActiveCurrency, MIXED_CURRENCY } from '@ury/core';
import { CompanyProvider, resolveScopeCurrency, useCompanyContext } from './CompanyContext';
import { CurrencyScope, useCurrency } from './CurrencyContext';
import { readTabScoped, writeTabScoped } from '../lib/tabScopedStorage';

const branchState: { activeBranch: { id: string; name: string; company?: string | null } | null } = {
  activeBranch: null,
};
vi.mock('./BranchContext', () => ({
  useBranchContext: () => branchState,
}));

vi.mock('@ury/core', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return { ...actual, call: vi.fn() };
});

const COMPANIES = [
  { name: 'URY UAE', company_name: 'URY UAE', default_currency: 'AED' },
  { name: 'URY Oman', company_name: 'URY Oman', default_currency: 'OMR' },
];
const CURRENCIES = [
  { name: 'AED', symbol: 'AED' },
  { name: 'OMR', symbol: 'OMR' },
];

const currencies = {
  AED: { code: 'AED', symbol: 'AED' },
  OMR: { code: 'OMR', symbol: 'OMR' },
};

describe('resolveScopeCurrency', () => {
  it('uses the selected company currency', () => {
    expect(
      resolveScopeCurrency({ activeCompanyId: 'URY Oman', companies: COMPANIES, currencies }),
    ).toEqual(currencies.OMR);
  });

  it('prefers the selected company over a stale branch from the previous company', () => {
    expect(
      resolveScopeCurrency({
        activeCompanyId: 'URY Oman',
        companies: COMPANIES,
        currencies,
        branchCompany: 'URY UAE',
      }),
    ).toEqual(currencies.OMR);
  });

  it('narrows "All companies" to the selected branch company', () => {
    expect(
      resolveScopeCurrency({ activeCompanyId: 'all', companies: COMPANIES, currencies, branchCompany: 'URY UAE' }),
    ).toEqual(currencies.AED);
  });

  it('is mixed for "All companies" spanning several currencies', () => {
    expect(resolveScopeCurrency({ activeCompanyId: 'all', companies: COMPANIES, currencies })).toBe(MIXED_CURRENCY);
  });

  it('is single-currency for "All companies" that share one', () => {
    const same = COMPANIES.map((c) => ({ ...c, default_currency: 'AED' }));
    expect(resolveScopeCurrency({ activeCompanyId: 'all', companies: same, currencies })).toEqual(currencies.AED);
  });
});

describe('tab-scoped selection storage', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("keeps this tab's selection when another tab writes a different one", () => {
    writeTabScoped('ury_active_company_id', 'URY UAE');
    // Another tab only shares localStorage.
    localStorage.setItem('ury_active_company_id', 'URY Oman');
    expect(readTabScoped('ury_active_company_id')).toBe('URY UAE');
  });

  it('starts a new tab from the last selection made anywhere', () => {
    localStorage.setItem('ury_active_company_id', 'URY Oman');
    expect(readTabScoped('ury_active_company_id')).toBe('URY Oman');
  });
});

describe('CurrencyScope', () => {
  let mounts = 0;
  let switchCompany: (id: string) => void = () => {};

  const CompanySwitcher: React.FC = () => {
    const { setActiveCompanyId } = useCompanyContext();
    switchCompany = setActiveCompanyId;
    return null;
  };

  const Page: React.FC = () => {
    const { symbol } = useCurrency();
    useEffect(() => {
      mounts += 1;
    }, []);
    // Plain core call, as the report pages make it.
    return (
      <div>
        <span data-testid="amount">{formatCurrency(1234.5)}</span>
        <span data-testid="symbol">{symbol}</span>
      </div>
    );
  };

  const renderScope = () =>
    render(
      <CompanyProvider>
        <CompanySwitcher />
        <CurrencyScope>
          <Page />
        </CurrencyScope>
      </CompanyProvider>,
    );

  beforeEach(() => {
    mounts = 0;
    branchState.activeBranch = null;
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('currencySymbol', '₹'); // left behind by a POS session
    vi.mocked(call).mockImplementation((async (_method: string, args: any) => {
      if (args?.doctype === 'Company') return COMPANIES;
      if (args?.doctype === 'Currency') return CURRENCIES;
      return [];
    }) as any);
  });

  afterEach(() => cleanup());

  it("renders the active company's currency, never the stale POS symbol", async () => {
    sessionStorage.setItem('ury_active_company_id', 'URY UAE');
    renderScope();
    await waitFor(() => expect(screen.getByTestId('amount')).toHaveTextContent('AED 1,234.5'));
    expect(screen.getByTestId('symbol')).toHaveTextContent('AED');
  });

  it('switches currency without a reload and remounts the page', async () => {
    sessionStorage.setItem('ury_active_company_id', 'URY UAE');
    renderScope();
    await waitFor(() => expect(screen.getByTestId('amount')).toHaveTextContent('AED 1,234.5'));
    const mountsBefore = mounts;

    act(() => switchCompany('URY Oman'));

    expect(screen.getByTestId('amount')).toHaveTextContent('OMR 1,234.5');
    expect(mounts).toBeGreaterThan(mountsBefore);
    expect(sessionStorage.getItem('ury_active_company_id')).toBe('URY Oman');
  });

  it('shows bare numbers for "All companies" with mixed currencies', async () => {
    sessionStorage.setItem('ury_active_company_id', 'all');
    renderScope();
    await waitFor(() => expect(screen.getByTestId('amount')).toHaveTextContent(/^1,234\.5$/));
    expect(screen.getByTestId('symbol')).toBeEmptyDOMElement();
  });

  it('clears the published currency on unmount so POS keeps its own', async () => {
    sessionStorage.setItem('ury_active_company_id', 'URY UAE');
    const { unmount } = renderScope();
    await waitFor(() => expect(getActiveCurrency()?.code).toBe('AED'));
    unmount();
    expect(getActiveCurrency()).toBeUndefined();
  });
});
