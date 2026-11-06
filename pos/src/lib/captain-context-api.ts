import { call } from '@ury/core';

/**
 * Mirrors the `pos_profile` sub-object returned by the backend
 * `get_captain_context()` (`ury/ury/doctype/ury_order/ury_order.py`).
 *
 * NOTE: unlike `PosProfileCombined` (`pos/src/lib/pos-profile-api.ts`,
 * `@ury/core`'s `PosProfileCombined`), these role-derived fields are already
 * resolved to booleans **server-side**, against the current session's roles
 * (see `_has_role` in `get_captain_context`). They are NOT raw POS Profile
 * child-table rows. See `useCaptainContext.ts` for how this is reconciled
 * with `derivePOSCapabilities()`, which expects the raw-row shape.
 */
export interface CaptainContextPosProfile {
  name: string;
  transfer_role_permissions: boolean;
  role_allowed_for_billing: boolean;
  role_restricted_for_table_order: boolean;
  remove_items: boolean;
  show_image: boolean;
  custom_enable_kot_reprint: boolean;
  custom_enable_multiple_cashier: boolean;
}

export interface CaptainContextRoom {
  name: string;
  branch: string;
}

export interface CaptainContextOpeningState {
  pos_open: boolean;
}

export interface CaptainContext {
  user: string;
  roles: string[];
  branch: string | null;
  rooms: CaptainContextRoom[];
  pos_profile: CaptainContextPosProfile | null;
  role_restricted_for_table_order: boolean;
  opening_state: CaptainContextOpeningState | null;
}

export interface CaptainContextResponse {
  message: CaptainContext;
}

export const getCaptainContext = async (): Promise<CaptainContext> => {
  const res = await call.get<CaptainContextResponse>(
    'ury.ury.doctype.ury_order.ury_order.get_captain_context'
  );
  return res.message;
};
