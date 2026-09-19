import React, { useState, useEffect } from 'react';
import { Card, Spinner } from '@ury/ui';
import { getLoggedUser, getUserRoles, isDashboardManager } from '@ury/core';
import { ErrorState } from '@ury/ui';
import { t } from '../i18n';

interface RoleGuardProps {
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ children }) => {
  const [hasRole, setHasRole] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  // Distinct from `hasRole === false`. Telling someone they lack permission
  // when the check never completed sends them to an administrator over a
  // problem an administrator cannot fix (UX-15).
  const [checkFailed, setCheckFailed] = useState<boolean>(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const userId = await getLoggedUser();
        if (userId) {
          const roles = await getUserRoles(userId);
          // Shared policy: this guard accepted only "URY Manager" while
          // useAuth also accepted Administrator and System Manager, so an
          // administrator was refused a screen the rest of the app treated
          // as theirs.
          setHasRole(isDashboardManager(roles.roles || []));
        } else {
          setHasRole(false);
        }
      } catch (e) {
        console.error('Failed to check user role', e);
        setCheckFailed(true);
      } finally {
        setIsLoading(false);
      }
    };

    setCheckFailed(false);
    setIsLoading(true);
    checkUserRole();
  }, [attempt]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  if (checkFailed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <ErrorState
          title={t('auth.role_check_failed')}
          description={t('auth.role_check_failed_hint')}
          retryLabel={t('common.retry')}
          onRetry={() => setAttempt((n) => n + 1)}
        />
      </div>
    );
  }

  if (!hasRole) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <div className="p-6 text-center">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">{t('auth.access_denied')}</h2>
            <p className="text-gray-600">{t('auth.need_manager_role')}</p>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
