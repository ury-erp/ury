import React from 'react';
import { Card, Spinner } from '@ury/ui';
import { useAuth } from '../store/useAuth';
import { __ } from '../i18n';
import { hasChefUiRole } from './production/chefRoles';

export const ChefGuard: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isLoading, roles } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (!hasChefUiRole(roles)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted p-4">
        <Card className="w-full max-w-md">
          <div className="p-6 text-center">
            <h2 className="mb-2 text-lg font-semibold text-foreground">{__('Access Denied')}</h2>
            <p className="text-muted-foreground">
              {__('You need the URY Department Head role to open the Production Board.')}
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
