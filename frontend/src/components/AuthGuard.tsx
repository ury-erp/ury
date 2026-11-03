import { Spinner } from '@ury/ui';
import { useAuth } from '../store/useAuth';
import { __ } from '../i18n';

interface AuthGuardProps {
  children: React.ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
  const { user, isLoading, error, isManager } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Spinner message={__('Loading...')} />
      </div>
    );
  }

  if (error || !user) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-destructive text-xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-foreground mb-2">{__('Access Denied')}</h2>
          <p className="text-muted-foreground">
            {error || __('Please log in to access this section.')}
          </p>
        </div>
      </div>
    );
  }

  if (!isManager) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-warning text-xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-foreground mb-2">{__('Permission Required')}</h2>
          <p className="text-muted-foreground">{__('This section is restricted to Managers.')}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
