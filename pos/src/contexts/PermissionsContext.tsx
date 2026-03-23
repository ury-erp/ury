import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, type MeResponse } from '../lib/permissions-api';

interface PermissionsContextType {
  ury_role: string | null;
  capabilities: string[];
  isLoading: boolean;
  error: string | null;
  user: string | null;
  fullName: string | null;
  hasCapability: (capability: string) => boolean;
  refresh: () => Promise<void>;
}

const PermissionsContext = createContext<PermissionsContextType>({
  ury_role: null,
  capabilities: [],
  isLoading: true,
  error: null,
  user: null,
  fullName: null,
  hasCapability: () => false,
  refresh: async () => {},
});

export const usePermissions = () => useContext(PermissionsContext);

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [data, setData] = useState<MeResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMe = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getMe();
      setData(result);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const hasCapability = useCallback(
    (capability: string): boolean => {
      if (!data) return false;
      return data.capabilities.includes(capability);
    },
    [data]
  );

  return (
    <PermissionsContext.Provider
      value={{
        ury_role: data?.ury_role ?? null,
        capabilities: data?.capabilities ?? [],
        isLoading,
        error,
        user: data?.user ?? null,
        fullName: data?.full_name ?? null,
        hasCapability,
        refresh: fetchMe,
      }}
    >
      {children}
    </PermissionsContext.Provider>
  );
};
