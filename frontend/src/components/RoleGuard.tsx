import React, { useState, useEffect } from 'react';
import { Card, Spinner } from '@ury/ui';
import { getLoggedUser, getUserRoles } from '@ury/core';

interface RoleGuardProps {
  children: React.ReactNode;
}

export const RoleGuard: React.FC<RoleGuardProps> = ({ children }) => {
  const [hasRole, setHasRole] = useState<boolean | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    const checkUserRole = async () => {
      try {
        const userId = await getLoggedUser();
        if (userId) {
          const roles = await getUserRoles(userId);
          const userRoles = roles.roles || [];
          const hasURYManagerRole = userRoles.some(
            (role: any) => role === 'URY Manager' || role.name === 'URY Manager'
          );
          setHasRole(hasURYManagerRole);
        } else {
          setHasRole(false);
        }
      } catch (e) {
        console.error('Failed to check user role', e);
        setHasRole(false);
      } finally {
        setIsLoading(false);
      }
    };

    checkUserRole();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Spinner />
      </div>
    );
  }

  if (!hasRole) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50 p-4">
        <Card className="w-full max-w-md">
          <div className="p-6 text-center">
            <h2 className="text-lg font-semibold text-gray-900 mb-2">Access Denied</h2>
            <p className="text-gray-600">
              You need the URY Manager role to access this section.
            </p>
          </div>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
};
