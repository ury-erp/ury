import React, { useEffect, useState } from 'react';
import { useRootStore } from '../store/root-store';
import { Button } from '@ury/ui';
import { Spinner } from '@ury/ui';
import { RefreshCw } from 'lucide-react';
import { t } from '../i18n'

interface Props {
  children: React.ReactNode;
}

const AuthGuard: React.FC<Props> = ({ children }) => {
  const { 
    checkAuth, 
    user, 
    isLoading: authLoading, 
    error: authError,
    fetchPosProfile,
    posProfile,
    isLoading: configLoading,
    error: configError,
    hasAccess,
    allowedRoles,
  } = useRootStore();

  // State to track if we're rechecking permissions
  const [isRechecking, setIsRechecking] = useState(false);

  useEffect(() => {
    // Start auth check
    checkAuth();
  }, [checkAuth]);

  // Once we have a user, fetch POS profile
  useEffect(() => {
    if (user) {
      fetchPosProfile();
    }
  }, [user, fetchPosProfile]);

  // Show loading state while either auth or config is loading
  if (authLoading || (user && configLoading) || isRechecking) {
    return (
      <div className="min-h-screen">
        <Spinner  message={t('common.loading')} />
      </div>
    );
  }

  if (authError || configError) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-destructive text-xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Access Denied</h2>
          <p className="text-muted-foreground">{authError || configError}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    // The checkAuth function will handle the redirect to login
    return null;
  }

  if (!posProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-warning text-xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Configuration Error</h2>
          <p className="text-muted-foreground">POS Profile not found or not configured.</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-warning text-xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Permission Required</h2>
          <p className="text-muted-foreground">You do not have permission to access this application.</p>
          <p className="text-sm text-text-tertiary mt-2">Required roles: {allowedRoles.join(', ')}</p>
          <Button 
            variant="outline"
            className="mt-4"
            onClick={async () => {
              setIsRechecking(true);
              try {
                await fetchPosProfile(true); // Force refresh the POS profile
              } finally {
                setIsRechecking(false);
              }
            }}
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Recheck Permissions
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default AuthGuard; 