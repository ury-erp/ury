import { useCallback, useEffect, useState } from 'react';
import { derivePOSCapabilities } from '@ury/core';
import type { POSCapabilities, PosProfileCombined, User } from '@ury/core';
import {
  getCaptainContext,
  type CaptainContext,
} from '../../lib/captain-context-api';

export interface UseCaptainContextResult {
  /** Raw backend response from `get_captain_context()`, or null while loading/on error. */
  context: CaptainContext | null;
  user: User | null;
  roles: string[];
  branch: string | null;
  rooms: CaptainContext['rooms'];
  /** Shimmed profile passed into `derivePOSCapabilities` — see note below. Not a full POS Profile document. */
  posProfile: PosProfileCombined | null;
  capabilities: POSCapabilities | null;
  openingState: CaptainContext['opening_state'];
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Builds a `PosProfileCombined`-shaped object that makes `derivePOSCapabilities`
 * (and the helpers it calls, `isUserRestrictedFromTableOrders`/`canCaptainTransfer`)
 * resolve to the same booleans the backend already computed.
 *
 * KNOWN MISMATCH (flagged for review, not fixed here — Phase 6 is scaffolding only):
 * `get_captain_context()` pre-resolves each role-derived POS Profile field to a
 * boolean *against the current session's roles* (`_has_role(...)` server-side).
 * `derivePOSCapabilities()` / `isUserRestrictedFromTableOrders()` / `canCaptainTransfer()`
 * were written against the *raw* POS Profile shape (`PosProfileCombined`), where those
 * fields are child-table row arrays (`{ role: string }[]`) that get matched against
 * `user.roles` client-side. The two Phase-1/Phase-2 pieces don't compose directly.
 *
 * This shim bridges the gap by encoding each resolved boolean as "the row table
 * contains one of the user's own roles" (true) or "is empty" (false), so the
 * client-side matching in `derivePOSCapabilities` reproduces the server's boolean
 * exactly, without duplicating the role-matching logic itself. It intentionally
 * does NOT attempt to fabricate the rest of the POS Profile document (company,
 * warehouse, currency, etc.) — those fields are irrelevant to capability
 * derivation and are filled with empty placeholders. Do not use this object for
 * anything other than `derivePOSCapabilities` input.
 */
const buildCapabilityProfileShim = (
  user: User,
  ctx: CaptainContext
): PosProfileCombined => {
  const ownRoleRow = user.roles[0] ?? '';
  const asRows = (flag: boolean) =>
    flag && ownRoleRow
      ? [{ role: ownRoleRow } as unknown as PosProfileCombined['role_allowed_for_billing'][number]]
      : [];

  const profile = ctx.pos_profile;

  return {
    name: profile?.name ?? '',
    owner: '',
    creation: '',
    modified: '',
    modified_by: '',
    docstatus: 0,
    idx: 0,
    company: '',
    customer: null,
    country: '',
    disabled: 0,
    warehouse: '',
    campaign: null,
    company_address: null,
    restaurant: '',
    branch: ctx.branch ?? '',
    currency: '',
    role_allowed_for_billing: asRows(Boolean(profile?.role_allowed_for_billing)),
    role_restricted_for_table_order: asRows(
      Boolean(profile?.role_restricted_for_table_order)
    ),
    transfer_role_permissions: asRows(Boolean(profile?.transfer_role_permissions)),
    waiter: '',
    cashier: '',
    print_format: null,
    qz_print: 0,
    qz_host: null,
    printer: null,
    print_type: '',
    tableAttention: 0,
    disable_rounded_total: 0,
    enable_discount: 0,
    multiple_cashier: profile?.custom_enable_multiple_cashier ? 1 : 0,
    remove_items: profile?.remove_items ? 1 : 0,
    show_image: profile?.show_image ? 1 : 0,
    custom_enable_kot_reprint: profile?.custom_enable_kot_reprint ? 1 : 0,
  };
};

/**
 * Fetches the current Captain's operational context from the backend
 * (`get_captain_context()`, landed in Phase 2) and derives client-side
 * capability flags from it via `derivePOSCapabilities` (landed in Phase 1).
 *
 * This is the single source of truth `CaptainRouteGuard` and the Captain
 * pages should read from — do not re-fetch or re-derive capabilities
 * elsewhere.
 */
export const useCaptainContext = (): UseCaptainContextResult => {
  const [context, setContext] = useState<CaptainContext | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchContext = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const result = await getCaptainContext();
      setContext(result);
    } catch (err) {
      setError((err as Error).message || 'Failed to load captain context.');
      setContext(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchContext();
  }, [fetchContext]);

  const user: User | null = context
    ? { name: context.user, roles: context.roles }
    : null;

  const posProfile: PosProfileCombined | null =
    user && context ? buildCapabilityProfileShim(user, context) : null;

  const capabilities: POSCapabilities | null = user
    ? derivePOSCapabilities(user, posProfile)
    : null;

  return {
    context,
    user,
    roles: context?.roles ?? [],
    branch: context?.branch ?? null,
    rooms: context?.rooms ?? [],
    posProfile,
    capabilities,
    openingState: context?.opening_state ?? null,
    isLoading,
    error,
    refetch: fetchContext,
  };
};

export default useCaptainContext;
