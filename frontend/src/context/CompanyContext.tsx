import React, { createContext, useContext, useState, useEffect } from 'react';
import { call } from '@ury/core';

export interface Company {
  name: string;
  company_name?: string;
}

export interface CompanyContextType {
  activeCompanyId: string;
  setActiveCompanyId: (id: string) => void;
  companies: Company[];
  setCompanies: React.Dispatch<React.SetStateAction<Company[]>>;
  activeCompany: Company | null;
  isLoading: boolean;
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
  try {
    return localStorage.getItem(COMPANY_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredCompanyId(id: string) {
  try {
    localStorage.setItem(COMPANY_STORAGE_KEY, id);
  } catch {
  }
}

export const CompanyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeCompanyId, setActiveCompanyIdState] = useState<string>(readStoredCompanyId);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

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
          fields: ['name', 'company_name'],
          filters: { is_group: 0 }
        });
        let fetched: Company[] = [];
        if (res && Array.isArray(res)) {
          fetched = res;
        } else if (res?.message && Array.isArray(res.message)) {
          fetched = res.message;
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
      }
    };
    fetchCompanies();
  }, []);

  const activeCompany = activeCompanyId === 'all'
    ? null
    : companies.find((c) => c.name === activeCompanyId) || null;

  const value: CompanyContextType = {
    activeCompanyId,
    setActiveCompanyId,
    companies,
    setCompanies,
    activeCompany,
    isLoading
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
