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
 * NOTE: this guard runs *inside* `AuthGuard`/`POSOpeningProvider`
 * (`pos/src/App.tsx`). `AuthGuard`'s `hasAccess` check is derived from
 * `deriveAllowedRoles()` (see `pos/src/store/slices/config-slice.ts`), which
 * was fixed to union the fixed `URY_POS_ROLES` vocabulary (including `URY
 * Captain`) with POS Profile's role-permission child tables, rather than
 * `role_allowed_for_billing` alone — so a pure Captain role now reaches this
 * guard the same way Cashier/Manager do. This guard still assumes the
 * AuthGuard/session-auth layer above it is intact and only handles the
 * Captain-specific capability check (`canTakeTableOrders`, i.e.
 * "can place an order", not "can bill/settle payment" — see
 * `derivePOSCapabilities` in `@ury/core`'s `roles.ts` for that distinction).
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
          <div className="text-red-600 text-xl mb-4">⚠️</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Unable to load Captain context</h2>
          <p className="text-gray-600">{error}</p>
        </div>
      </div>
    );
  }

  if (!capabilities?.canTakeTableOrders) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-amber-600 text-xl mb-4">🔒</div>
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Not permitted</h2>
          <p className="text-gray-600">
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
