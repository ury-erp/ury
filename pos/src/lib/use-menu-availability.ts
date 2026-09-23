import { useEffect, useRef, useState } from 'react';
import {
  getItemAvailability,
  ItemAvailability,
} from './availability-api';

export type AvailabilityTier = 0 | 1 | 2;

/**
 * Maps an item's availability to a sort tier:
 * - 0: Available / In Stock (sellable && (available_qty > 0 || available_qty == null)) or unknown/fail-open
 * - 1: Sold Out (sellable == false or available_qty <= 0, reason: PLAN_EXHAUSTED or FG_OUT_OF_STOCK)
 * - 2: Temporarily Unavailable / Other un-sellable reasons (BLOCKING_COMPONENT, MISSING_BOM, NOT_PRODUCED, etc.)
 */
export function getAvailabilityTier(availability?: ItemAvailability | null): AvailabilityTier {
  if (!availability) {
    // Fail-open: items without loaded/known availability stay at top so they aren't hidden
    return 0;
  }

  const isUnavailable =
    !availability.sellable ||
    (availability.available_qty != null && availability.available_qty <= 0);

  if (!isUnavailable) {
    return 0;
  }

  const reasonCode = availability.reason_code;
  if (reasonCode === 'PLAN_EXHAUSTED' || reasonCode === 'FG_OUT_OF_STOCK') {
    return 1;
  }

  return 2;
}

/**
 * Sorts menu items by availability tier:
 * Tier 0 (Available) -> Tier 1 (Sold Out) -> Tier 2 (Temporarily Unavailable).
 * Within each tier, items maintain alphabetical order by name.
 */
export function sortMenuItemsByAvailability<T extends { item: string; name: string }>(
  items: T[],
  availabilityMap: Record<string, ItemAvailability>
): T[] {
  return [...items].sort((a, b) => {
    const availA = availabilityMap[a.item];
    const availB = availabilityMap[b.item];
    const tierA = getAvailabilityTier(availA);
    const tierB = getAvailabilityTier(availB);

    if (tierA !== tierB) {
      return tierA - tierB;
    }

    return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  });
}

const CHECK_CONCURRENCY = 8;

const runWithConcurrency = async <T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const laneCount = Math.max(1, Math.min(limit, items.length));
  const lanes = new Array(laneCount).fill(0).map(async () => {
    while (cursor < items.length) {
      const current = cursor++;
      results[current] = await worker(items[current]);
    }
  });
  await Promise.all(lanes);
  return results;
};

export interface UseMenuAvailabilityResult {
  availabilityMap: Record<string, ItemAvailability>;
  refetchItem: (itemCode: string) => Promise<void>;
}

export function useMenuAvailability(
  items: Array<{ item: string }>,
  branch?: string,
  company?: string
): UseMenuAvailabilityResult {
  const [availabilityMap, setAvailabilityMap] = useState<Record<string, ItemAvailability>>({});
  const activeFetchRef = useRef<number>(0);
  const fetchedKeyRef = useRef<string>('');

  const distinctItemCodes = Array.from(new Set(items.map((i) => i.item).filter(Boolean))).sort();
  const itemsKey = distinctItemCodes.join(',');

  useEffect(() => {
    let cancelled = false;
    const fetchId = ++activeFetchRef.current;

    if (!branch || !company || distinctItemCodes.length === 0) {
      if (Object.keys(availabilityMap).length > 0) {
        setAvailabilityMap({});
      }
      return;
    }

    const currentKey = `${branch}:${company}:${itemsKey}`;
    if (fetchedKeyRef.current === currentKey) {
      return;
    }
    fetchedKeyRef.current = currentKey;

    runWithConcurrency(distinctItemCodes, CHECK_CONCURRENCY, async (item_code) => {
      try {
        const result = await getItemAvailability({ item_code, branch, company });
        return [item_code, result] as const;
      } catch {
        return [item_code, null] as const;
      }
    }).then((results) => {
      if (cancelled || fetchId !== activeFetchRef.current) return;
      const next: Record<string, ItemAvailability> = {};
      for (const [item_code, result] of results) {
        if (result) {
          next[item_code] = result;
        }
      }
      setAvailabilityMap(next);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsKey, branch, company]);

  const refetchItem = async (itemCode: string) => {
    if (!branch || !company || !itemCode) return;
    try {
      const result = await getItemAvailability(
        { item_code: itemCode, branch, company },
        { skipCache: true }
      );
      setAvailabilityMap((prev) => ({
        ...prev,
        [itemCode]: result,
      }));
    } catch {
      // Fail-open
    }
  };

  return { availabilityMap, refetchItem };
}
