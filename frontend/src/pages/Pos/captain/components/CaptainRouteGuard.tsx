import React from 'react';
import { Spinner } from '@ury/ui';
import { useCaptainContext } from '../hooks/useCaptainContext';
import ServiceRequestPanel from './ServiceRequestPanel';

interface Props {
  children: React.ReactNode;
}

/**
 * Capability-gated route wrapper for `/order*`, following the loading /
 * error / denial pattern established by `AuthGuard`
 * (`pos/src/components/AuthGuard.tsx`).
 *
 * Gates on `capabilities.canTakeTableOrders` (from `derivePOSCapabilities`,
 * via `useCaptainContext`) — the client-side UX hint for
 * `!role_restricted_for_table_order`. This is NOT the security boundary:
 * every mutation must still be re-validated server-side per PLAN.md §9.
 *
 * NOTE: Captain routes bypass `AuthGuard` entirely — they're registered as
 * siblings of `/pos` in `App.tsx`, not nested under it. Additionally,
 * `deriveAllowedRoles()` in config-slice.ts includes 'URY Captain' as a
 * defense-in-depth measure. This guard is a UX/client-side gate only;
 * all mutations are re-validated server-side.
 */
const CaptainRouteGuard: React.FC<Props> = ({ children }) => {
  const { capabilities, branch, isLoading, error } = useCaptainContext();

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Spinner message="Loading captain context..." />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-destructive text-xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Unable to load Captain context</h2>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  if (!capabilities?.canTakeTableOrders) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-warning text-xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Not permitted</h2>
          <p className="text-muted-foreground">
            You do not have permission to take table orders.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}
      <ServiceRequestPanel branch={branch} />
    </>
  );
};

export default CaptainRouteGuard;
