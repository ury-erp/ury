import { Navigate } from 'react-router-dom';
import { useAuth } from '../store/useAuth';
import { __ } from '../i18n';
import { URY_POS_ROUTES_ENABLED } from '../lib/posRouteBlock';
import { NoAccess } from './NoAccess';

/**
 * Client-side-only role-aware landing redirect for the bare root URL ("/").
 *
 * This sits OUTSIDE `RoleGuard` (see App.tsx), so it never dead-ends a
 * non-manager (e.g. a cashier) the way `RoleGuard`'s "Access Denied" card
 * does. It only decides WHICH area of the app to send the user into —
 * `/dashboard` (manager-oriented `RoleGuard`-protected area) for
 * manager-ish roles per `useAuth`'s `isManager`, otherwise `/pos/dashboard`
 * for everyone else (cashier/waiter/captain, assumed POS-Profile-driven
 * access). It does NOT perform the real permission check for either area —
 * `RoleGuard` still guards the manager routes and pos/'s own `AuthGuard`
 * still guards the POS routes; this component is purely a routing
 * convenience for whoever lands on "/" without a more specific URL.
 */
export function Landing() {
  const { isLoading, isManager } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-muted-foreground">{__('Loading…')}</p>
        </div>
      </div>
    );
  }

  if (isManager) {
    return <Navigate to="/dashboard" replace />;
  }

  // BLOCKED FOR NOW: non-managers (e.g. a cashier opening the URY app from /desk) used to be
  // sent to /pos/dashboard. That area is blocked for everyone, so show "no access" instead of
  // redirecting. See lib/posRouteBlock.ts.
  if (!URY_POS_ROUTES_ENABLED) {
    return <NoAccess />;
  }
  return <Navigate to="/pos/dashboard" replace />;
}
