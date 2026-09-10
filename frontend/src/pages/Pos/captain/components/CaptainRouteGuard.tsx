import React, { useCallback, useEffect, useState } from 'react';
import { Spinner } from '@ury/ui';
import { useCaptainContext } from '../hooks/useCaptainContext';
import ServiceRequestPanel from './ServiceRequestPanel';
import ChecklistGateDialog from '../../components/ChecklistGateDialog';
import { getChecklist } from '../../../../lib/pos/checklist-api';
import { initI18n } from '../../i18n';

interface Props {
  children: React.ReactNode;
}

type ChecklistGateState = 'checking' | 'needed' | 'clear';

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
 * Also gates on today's Opening checklist for the branch's POS Profile being
 * `Complete`, same trigger condition and dialog (`ChecklistGateDialog`) the
 * main POS uses via `POSOpeningProvider`. Captain sessions don't go through
 * `POSOpeningProvider` (that lives under `/pos`), so this guard re-implements
 * the same check here using `context.pos_profile.name` (the real backend POS
 * Profile name resolved by `get_captain_context()` — not the capability shim
 * built for `derivePOSCapabilities` in `useCaptainContext.ts`).
 *
 * NOTE: Captain routes bypass `AuthGuard` entirely — they're registered as
 * siblings of `/pos` in `frontend/src/App.tsx`, not nested under it. (For the
 * routes that *do* go through `AuthGuard`, `deriveAllowedRoles()` in
 * config-slice.ts separately includes 'URY Captain' in the allowlist — that's
 * unrelated defense-in-depth for those routes, not something this guard
 * relies on.) This guard is a UX/client-side gate only; all mutations are
 * re-validated server-side.
 *
 * Also initializes the shared `../../i18n` module (`initI18n()`), which is
 * otherwise only called from `PosLayout.tsx` — a mount point captain routes
 * never reach. Without this, any captain-tree component that calls the
 * shared `t()` (e.g. `TableActionsMenu`, reused as-is for table merge/
 * unmerge) silently renders raw translation keys like `tables.merge_tables`
 * instead of their text, since `t()`'s locale map is empty until
 * `initI18n()` has resolved at least once. Safe to call redundantly if the
 * main POS's `PosLayout` has already initialized it in the same session.
 */
const CaptainRouteGuard: React.FC<Props> = ({ children }) => {
  const { context, capabilities, branch, isLoading, error } = useCaptainContext();
  const posProfileName = context?.pos_profile?.name ?? null;

  const [checklistGate, setChecklistGate] = useState<ChecklistGateState>('checking');

  useEffect(() => {
    initI18n().catch((initError) => {
      console.error('Failed to initialize i18n for captain routes:', initError);
    });
  }, []);

  const checkChecklist = useCallback(async () => {
    if (!posProfileName) {
      setChecklistGate('clear');
      return;
    }

    setChecklistGate('checking');
    try {
      const result = await getChecklist(posProfileName, 'Opening');
      setChecklistGate(result.logStatus !== 'Complete' ? 'needed' : 'clear');
    } catch (checklistError) {
      console.error('Failed to check captain opening checklist status:', checklistError);
      // On error, block on the checklist for safety (mirrors POSOpeningProvider).
      setChecklistGate('needed');
    }
  }, [posProfileName]);

  useEffect(() => {
    if (!isLoading && !error && capabilities?.canTakeTableOrders && posProfileName) {
      checkChecklist();
    }
  }, [isLoading, error, capabilities?.canTakeTableOrders, posProfileName, checkChecklist]);

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

  if (posProfileName && checklistGate !== 'clear') {
    if (checklistGate === 'checking') {
      return (
        <div className="min-h-screen">
          <Spinner message="Checking opening checklist..." />
        </div>
      );
    }

    return (
      <ChecklistGateDialog
        posProfile={posProfileName}
        checklistType="Opening"
        onComplete={() => {
          checkChecklist();
        }}
      />
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
