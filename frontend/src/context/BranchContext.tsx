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



const BranchContext = createContext<BranchContextType | undefined>(undefined);

export const BranchProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [activeBranchId, setActiveBranchIdState] = useState<string>(() => {
    return localStorage.getItem('ury_active_branch_id') || 'all';
  });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [, setRefreshKey] = useState<number>(0);

  const setActiveBranchId = (id: string) => {
    setActiveBranchIdState(id);
    localStorage.setItem('ury_active_branch_id', id);
  };

  const refreshDashboard = () => {
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    const fetchBranches = async () => {
      setIsLoading(true);
      try {
        const res = await call<any>('ury.ury.api.minimal.business_setup.get_branches');
        if (res && Array.isArray(res)) {
          setBranches(res);
        } else if (res?.message && Array.isArray(res.message)) {
          setBranches(res.message);
        }
      } catch {
        // Handle error without fallback
      } finally {
        setIsLoading(false);
      }
    };
    fetchBranches();
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
