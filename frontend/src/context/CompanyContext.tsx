import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { call, MIXED_CURRENCY, type CurrencyInfo } from '@ury/core';
import { readTabScoped, writeTabScoped } from '../lib/tabScopedStorage';

export interface Company {
  name: string;
  company_name?: string;
  default_currency?: string | null;
}

export interface CompanyContextType {
  activeCompanyId: string;
  setActiveCompanyId: (id: string) => void;
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  activeCompany: Company | null;
  isLoading: boolean;
  /** True once companies and their currency metadata have been fetched (or failed). */
  isReady: boolean;
  /** ``Currency`` metadata keyed by ISO code, for every company's currency. */
  currencies: Record<string, CurrencyInfo>;
  /** Symbol-aware ``CurrencyInfo`` for a code (falls back to the bare code). */
  currencyFor: (code: string | null | undefined) => CurrencyInfo;
}

const COMPANY_STORAGE_KEY = 'ury_active_company_id';

const CompanyContext = createContext<CompanyContextType | undefined>(undefined);

export function resolveActiveCompanyId(
  fetched: Company[],
  currentId: string | null | undefined,
): string {
  if (fetched.some((c) => c.name === currentId)) {
    return currentId as string;
  }
  if (currentId === 'all' && fetched.length > 1) {
    return 'all';
  }
  if (fetched.length >= 1) {
    return fetched[0].name;
  }
  return 'all';
}

function readStoredCompanyId(): string {
  return readTabScoped(COMPANY_STORAGE_KEY);
}

function writeStoredCompanyId(id: string) {
  writeTabScoped(COMPANY_STORAGE_KEY, id);
}

function unwrapList<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res;
  const message = (res as { message?: unknown } | null)?.message;
  return Array.isArray(message) ? message : [];
}

export function lookupCurrency(
  currencies: Record<string, CurrencyInfo>,
  code: string | null | undefined,
): CurrencyInfo {
  if (!code) return MIXED_CURRENCY;
  return currencies[code] || { code, symbol: null };
}

/**
 * Currency of the current dashboard scope.
 *
 * A concrete company wins (its branches all share its currency, and during a
 * company switch the branch list still holds the previous company's branches).
 * In "All companies", a selected branch narrows it to that branch's company;
 * otherwise the scope only has one currency if every company uses the same one.
 */
export function resolveScopeCurrency(params: {
  activeCompanyId: string;
  companies: Company[];
  currencies: Record<string, CurrencyInfo>;
  branchCompany?: string | null;
}): CurrencyInfo {
  const { activeCompanyId, companies, currencies, branchCompany } = params;
  const companyCurrency = (id: string | null | undefined) =>
    companies.find((c) => c.name === id)?.default_currency || null;

  if (activeCompanyId && activeCompanyId !== 'all') {
    return lookupCurrency(currencies, companyCurrency(activeCompanyId));
  }
  if (branchCompany) {
    return lookupCurrency(currencies, companyCurrency(branchCompany));
  }
  const distinct = new Set(companies.map((c) => c.default_currency).filter(Boolean));
  return distinct.size === 1 ? lookupCurrency(currencies, [...distinct][0]) : MIXED_CURRENCY;
}

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeCompanyId, setActiveCompanyIdState] = useState<string>(readStoredCompanyId);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [currencies, setCurrencies] = useState<Record<string, CurrencyInfo>>({});

  const setActiveCompanyId = (id: string) => {
    setActiveCompanyIdState(id);
    writeStoredCompanyId(id);
  };

  useEffect(() => {
    const fetchCompanies = async () => {
      setIsLoading(true);
      try {
        const res = await call<any>('frappe.client.get_list', {
          doctype: 'Company',
          fields: ['name', 'company_name', 'default_currency'],
          filters: { is_group: 0 }
        });
        const fetched = unwrapList<Company>(res);

        // One request for every company's currency, held in memory only.
        const codes = [...new Set(fetched.map((c) => c.default_currency).filter(Boolean))] as string[];
        if (codes.length) {
          try {
            const currencyRes = await call<unknown>('frappe.client.get_list', {
              doctype: 'Currency',
              fields: ['name', 'symbol'],
              filters: [['name', 'in', codes]],
              limit_page_length: 0,
            });
            const map: Record<string, CurrencyInfo> = {};
            for (const row of unwrapList<{ name: string; symbol?: string }>(currencyRes)) {
              map[row.name] = { code: row.name, symbol: row.symbol || null };
            }
            setCurrencies(map);
          } catch {
            // No Currency read access: amounts still show the ISO code.
          }
        }
        setCompanies(fetched);

        const stored = readStoredCompanyId();
        const resolved = resolveActiveCompanyId(fetched, stored || activeCompanyId);
        if (resolved !== activeCompanyId) {
          setActiveCompanyId(resolved);
        } else if (resolved && !stored) {
          writeStoredCompanyId(resolved);
        }
      } catch {
      } finally {
        setIsLoading(false);
        setIsReady(true);
      }
    };
    fetchCompanies();
  }, []);

  const currencyFor = useCallback(
    (code: string | null | undefined) => lookupCurrency(currencies, code),
    [currencies],
  );

  const activeCompany = activeCompanyId === 'all'
    ? null
    : companies.find((c) => c.name === activeCompanyId) || null;

  const value: CompanyContextType = {
    activeCompanyId,
    setActiveCompanyId,
    companies,
    setCompanies,
    activeCompany,
    isLoading,
    isReady,
    currencies,
    currencyFor,
  };

  return (
    <CompanyContext.Provider value={value}>
      {children}
    </CompanyContext.Provider>
  );
};

export const useCompanyContext = (): CompanyContextType => {
  const context = useContext(CompanyContext);
  if (!context) {
    throw new Error('useCompanyContext must be used within a CompanyProvider');
  }
  return context;
};

export const useCompany = useCompanyContext;
