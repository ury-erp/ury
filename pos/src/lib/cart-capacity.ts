import { useEffect, useState } from 'react';
import { getItemAvailability, ItemAvailability } from './availability-api';

/**
 * B04: real-time cart capacity tracking.
 *
 * The cart previously had no client-side model of "available raw-material
 * capacity minus what's already in the cart" -- the `+` button could be
 * clicked past the item's real producible quantity, and the oversell was
 * only ever caught when `sync_order` rejected the whole order with
 * "Insufficient capacity for <item>: ... (required X, available Y)".
 *
 * This module fetches the same V3-44 `get_item_availability` figure the
 * menu grid already uses for the "Sold out" badge (see
 * `availability-api.ts`'s cache-invalidation policy notes) and exposes a
 * per-item-code remaining-headroom figure: `available_qty` minus the total
 * quantity of that item already sitting in this cart, across every line
 * (variant/addon combination) for that item_code -- because capacity is
 * tracked per finished item_code server-side, not per cart line.
 *
 * This is DISPLAY-ONLY, exactly like the menu-grid check it reuses:
 *   - It reads from the same 30s display cache, so it can lag a live
 *     concurrent order on another terminal for the same scarce item.
 *   - It never blocks `sync_order` itself -- the backend remains the sole
 *     transactional authority and still rejects an oversell at submit time
 *     regardless of what this hook reports, exactly as before this fix.
 *   - A failed/unknown availability lookup means "don't gate" (matches
 *     `MenuCard`'s existing fail-open-to-unblocked-menu policy) rather than
 *     silently locking the `+` button forever on a transient network error.
 */

export interface CartCapacityParams {
  itemCodes: string[];
  branch: string | undefined;
  company: string | undefined;
}

export interface CartCapacityResult {
  /** item_code -> latest known ItemAvailability, or undefined if unknown/unchecked. */
  availabilityByItem: Record<string, ItemAvailability>;
  /** True while the initial fetch for the current item_code set is in flight. */
  loading: boolean;
}

/**
 * Fetches (and keeps reasonably fresh) availability for every distinct
 * item_code currently in the cart. Re-fetches whenever the set of distinct
 * item codes changes; does NOT re-fetch on every quantity change (headroom
 * math is done separately from the fetched `available_qty` snapshot).
 */
export const useCartAvailability = ({ itemCodes, branch, company }: CartCapacityParams): CartCapacityResult => {
  const [availabilityByItem, setAvailabilityByItem] = useState<Record<string, ItemAvailability>>({});
  const [loading, setLoading] = useState(false);

  const distinctItemCodes = Array.from(new Set(itemCodes.filter(Boolean))).sort();
  const key = distinctItemCodes.join(',');

  useEffect(() => {
    let cancelled = false;
    if (!branch || !company || distinctItemCodes.length === 0) {
      setAvailabilityByItem({});
      return;
    }

    setLoading(true);
    Promise.all(
      distinctItemCodes.map((item_code) =>
        getItemAvailability({ item_code, branch, company })
          .then((result) => [item_code, result] as const)
          .catch(() => [item_code, null] as const),
      ),
    ).then((results) => {
      if (cancelled) return;
      const next: Record<string, ItemAvailability> = {};
      for (const [item_code, result] of results) {
        if (result) next[item_code] = result;
      }
      setAvailabilityByItem(next);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, branch, company]);

  return { availabilityByItem, loading };
};

/**
 * Total quantity of `item_code` already present across every cart line
 * (every variant/addon combination is a separate line, but they all draw
 * on the same finished-item capacity).
 */
export const cartQtyForItem = <T extends { item: string; quantity: number }>(
  lines: T[],
  item_code: string,
): number => lines.filter((line) => line.item === item_code).reduce((sum, line) => sum + line.quantity, 0);

/**
 * Remaining headroom for `item_code`: how many more units of it this cart
 * could add before hitting the last-known available quantity. `undefined`
 * means "unknown -- do not gate" (no availability data fetched yet, lookup
 * failed, or availability isn't tracked for this item).
 */
export const remainingHeadroom = (
  availability: ItemAvailability | undefined,
  currentCartQty: number,
): number | undefined => {
  if (!availability) return undefined;
  return availability.available_qty - currentCartQty;
};
