import React, { createContext, useContext, useState, useEffect } from 'react';
import { call } from '@ury/core';

export interface Branch {
  id: string;
  name: string;
  code?: string;
  is_active?: boolean;
  address?: string;
}

export interface BranchFilterContext {
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
}

export interface BranchContextType {
  activeBranchId: string;
  setActiveBranchId: (id: string) => void;
  selectedBranch: string;
  setSelectedBranch: (id: string) => void;
  branches: Branch[];
  setBranches: React.Dispatch<React.SetStateAction<Branch[]>>;
  activeBranch: Branch | null;
  isLoading: boolean;
  filterContext: BranchFilterContext;
  refreshDashboard: () => void;
}

const BRANCH_STORAGE_KEY = 'ury_active_branch_id';

const BranchContext = createContext<BranchContextType | undefined>(undefined);

/** Pick a concrete working branch when nothing valid is selected yet. */
export function resolveActiveBranchId(
  fetched: Branch[],
  currentId: string | null | undefined,
): string {
  if (fetched.some((b) => b.id === currentId)) {
    return currentId as string;
  }
  // Explicit "All Branches" only stays when there are multiple branches to aggregate.
  if (currentId === 'all' && fetched.length > 1) {
    return 'all';
  }
  if (fetched.length >= 1) {
    return fetched[0].id;
  }
  return 'all';
}

function readStoredBranchId(): string {
  try {
    return localStorage.getItem(BRANCH_STORAGE_KEY) || '';
  } catch {
    return '';
  }
}

function writeStoredBranchId(id: string) {
  try {
    localStorage.setItem(BRANCH_STORAGE_KEY, id);
  } catch {
    // Private mode / quota — selection still works in-memory for the session.
  }
}

export const BranchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeBranchId, setActiveBranchIdState] = useState<string>(readStoredBranchId);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [, setRefreshKey] = useState<number>(0);

  const setActiveBranchId = (id: string) => {
    setActiveBranchIdState(id);
    writeStoredBranchId(id);
  };

  const refreshDashboard = () => {
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    const fetchBranches = async () => {
      setIsLoading(true);
      try {
        const res = await call<any>('ury.ury.api.minimal.business_setup.get_branches');
        let fetched: Branch[] = [];
        if (res && Array.isArray(res)) {
          fetched = res;
        } else if (res?.message && Array.isArray(res.message)) {
          fetched = res.message;
        }
        setBranches(fetched);

        const stored = readStoredBranchId();
        const resolved = resolveActiveBranchId(fetched, stored || activeBranchId);
        if (resolved !== activeBranchId) {
          setActiveBranchId(resolved);
        } else if (resolved && !stored) {
          // Persist the resolved default so reloads keep a concrete branch.
          writeStoredBranchId(resolved);
        }
      } catch {
        // Handle error without fallback
      } finally {
        setIsLoading(false);
      }
    };
    fetchBranches();
    // Intentionally once on mount — branch list refresh is explicit elsewhere.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const activeBranch = activeBranchId === 'all'
    ? null
    : branches.find((b) => b.id === activeBranchId) || null;

  const value: BranchContextType = {
    activeBranchId,
    setActiveBranchId,
    selectedBranch: activeBranchId,
    setSelectedBranch: setActiveBranchId,
    branches,
    setBranches,
    activeBranch,
    isLoading,
    filterContext: {
      searchQuery,
      setSearchQuery,
      statusFilter,
      setStatusFilter
    },
    refreshDashboard
  };

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
};

export const useBranchContext = (): BranchContextType => {
  const context = useContext(BranchContext);
  if (!context) {
    throw new Error('useBranchContext must be used within a BranchProvider');
  }
  return context;
};

export const useBranch = useBranchContext;
