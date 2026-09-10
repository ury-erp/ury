import { useEffect, useMemo, useState } from 'react';
import { getLoggedUser, getUserRoles } from '@ury/core';

interface AuthState {
  user: string | null;
  roles: string[];
  fullName: string;
  isLoading: boolean;
  error: string | null;
  isManager: boolean;
}

export function useAuth(): AuthState {
  const [user, setUser] = useState<string | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [fullName, setFullName] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        setIsLoading(true);
        setError(null);

        const loggedUser = await getLoggedUser();
        if (cancelled) return;

        if (!loggedUser) {
          setUser(null);
          setRoles([]);
          setFullName('');
          return;
        }

        const { roles: userRoles, full_name } = await getUserRoles(loggedUser);
        if (cancelled) return;

        setUser(loggedUser);
        setRoles(userRoles);
        setFullName(full_name);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load user');
        setUser(null);
        setRoles([]);
        setFullName('');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  const isManager = useMemo(
    () =>
      roles.includes('URY Manager') ||
      roles.includes('Administrator') ||
      roles.includes('System Manager'),
    [roles]
  );

  return {
    user,
    roles,
    fullName,
    isLoading,
    error,
    isManager,
  };
}
