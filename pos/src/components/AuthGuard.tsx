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
          <div className="text-red-600 text-xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Access Denied</h2>
          <p className="text-gray-600">{authError || configError}</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center p-6 bg-white rounded-lg shadow-sm border border-gray-200 max-w-sm">
          <div className="text-blue-600 text-2xl mb-3">🔄</div>
          <h2 className="text-lg font-semibold text-gray-800 mb-2">Connecting to Session...</h2>
          <p className="text-sm text-gray-500 mb-4">Verifying user authentication. If offline, existing session data will be used.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              checkAuth();
            }}
          >
            Retry Connection
          </Button>
        </div>
      </div>
    );
  }


  if (!posProfile) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-amber-600 text-xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Configuration Error</h2>
          <p className="text-gray-600">POS Profile not found or not configured.</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-amber-600 text-xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Permission Required</h2>
          <p className="text-gray-600">You do not have permission to access this application.</p>
          <p className="text-sm text-gray-500 mt-2">Required roles: {allowedRoles.join(', ')}</p>
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