import React, { createContext, useContext, useEffect, useMemo } from 'react';
import {
  formatCompactCurrency,
  formatCurrency,
  setActiveCurrency,
  type CurrencyInfo,
} from '@ury/core';
import { Spinner } from '@ury/ui';
import { useCompanyContext, resolveScopeCurrency } from './CompanyContext';
import { useBranchContext } from './BranchContext';

export interface CurrencyContextType {
  /** Currency of the active company/branch scope; ``code: null`` when mixed. */
  currency: CurrencyInfo;
  isMixed: boolean;
  /** Display symbol (falls back to the ISO code); empty when mixed. */
  symbol: string;
  /** Symbol-aware info for a code returned by an API response. */
  currencyFor: (code: string | null | undefined) => CurrencyInfo;
  /** Formats in ``code`` (a response's currency) when given, else the scope currency. */
  format: (amount: number, code?: string | null) => string;
  formatCompact: (amount: number, code?: string | null) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

/**
 * Owns the dashboard's currency for this tab.
 *
 * The currency is derived from React state (active company/branch), never
 * read back from localStorage, so it changes in the same render as the
 * company switch and cannot leak between tabs. It is also published to the
 * shared ``@ury/core`` formatter so plain ``formatCurrency(x)`` calls in
 * report pages pick it up; that publication is cleared on unmount so POS
 * routes (outside this layout) keep their own POS-profile currency.
 *
 * Children are keyed by the currency code: when the currency changes, the
 * routed page remounts and refetches, so figures fetched for the previous
 * company are never shown next to the new company's symbol.
 */
export const CurrencyScope: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activeCompanyId, companies, currencies, currencyFor, isReady } = useCompanyContext();
  const { activeBranch } = useBranchContext();
  const branchCompany = activeBranch?.company ?? null;

  const currency = useMemo(
    () => resolveScopeCurrency({ activeCompanyId, companies, currencies, branchCompany }),
    [activeCompanyId, companies, currencies, branchCompany],
  );

  // Published during render so children rendering in this pass already see
  // it; the effect re-publishes after StrictMode's simulated unmount.
  setActiveCurrency(currency);
  useEffect(() => {
    setActiveCurrency(currency);
    return () => setActiveCurrency(undefined);
  }, [currency]);

  const value = useMemo<CurrencyContextType>(() => {
    const pick = (code?: string | null) => (code ? currencyFor(code) : currency);
    return {
      currency,
      isMixed: !currency.code,
      symbol: currency.code ? currency.symbol || currency.code : '',
      currencyFor,
      format: (amount, code) => formatCurrency(amount, pick(code)),
      formatCompact: (amount, code) => formatCompactCurrency(amount, pick(code)),
    };
  }, [currency, currencyFor]);

  if (!isReady) {
    // Until the company currency is known, render nothing that could format
    // money with a guessed (legacy ₹) symbol.
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner className="w-6 h-6 text-primary" />
      </div>
    );
  }

  return (
    <CurrencyContext.Provider value={value}>
      <React.Fragment key={currency.code ?? 'mixed'}>{children}</React.Fragment>
    </CurrencyContext.Provider>
  );
};

/** ``"Price (AED)"``, or plain ``"Price"`` when the scope has no single currency. */
export function withCurrencyLabel(label: string, symbol: string): string {
  return symbol ? `${label} (${symbol})` : label;
}

/**
 * Currency helpers for the active dashboard scope. Outside ``CurrencyScope``
 * (POS routes) it falls back to the core formatter's own resolution.
 */
export function useCurrency(): CurrencyContextType {
  const context = useContext(CurrencyContext);
  if (context) return context;
  const fallback: CurrencyInfo = { code: null, symbol: null };
  return {
    currency: fallback,
    isMixed: false,
    symbol: '',
    currencyFor: (code) => (code ? { code, symbol: null } : fallback),
    format: (amount, code) => formatCurrency(amount, code || undefined),
    formatCompact: (amount, code) => formatCompactCurrency(amount, code || undefined),
  };
}
