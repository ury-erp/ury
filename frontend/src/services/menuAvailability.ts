import { call } from '@ury/core';
import { getItemAvailability, ItemAvailability } from '../pages/Pos/lib/availability-api';

/**
 * Read-only client that composes two existing whitelisted endpoints to
 * answer "which items in the catalog aren't sellable right now, and why":
 *
 *  - `frappe.client.get_list` on `Item` -- the catalog to check. There is no
 *    dedicated "list items with availability" endpoint, so this fetches a
 *    bounded page of enabled items (see `ITEM_CHECK_LIMIT`) the same way
 *    `ItemProductionConfigPage.tsx` already does.
 *  - `ury.ury.api.ury_availability.get_item_availability` (via the existing
 *    `getItemAvailability` adapter in `pages/Pos/lib/availability-api.ts`)
 *    -- called once per item. That endpoint is single-item only (no bulk
 *    variant exists in `ury_availability.py`), so this module fans the
 *    calls out with bounded concurrency rather than one at a time.
 *
 * This module never re-derives sellability -- `sellable` / `reason_code`
 * are passed through verbatim from the server, exactly like
 * `availability-api.ts` itself does.
 */

export interface CatalogItem {
  item_code: string;
  item_name?: string;
}

/** Upper bound on how many catalog items this page checks per load, so a
 * large catalog can't turn one page load into thousands of sequential
 * availability calls. The KPI strip reports the real number checked, so
 * this cap is never silently hidden from the user. */
export const ITEM_CHECK_LIMIT = 200;

const CHECK_CONCURRENCY = 8;

export interface AvailabilityCheckResult {
  checked: ItemAvailability[];
  /** item_codes whose availability call errored (network/server error) -- excluded from `checked`. */
  failed: string[];
}

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

interface FrappeListResponse<T> {
  message?: T[];
}

interface CompanyListRow {
  name: string;
}

interface ItemListRow {
  name: string;
  item_name?: string;
}

const unwrapList = <T>(payload: FrappeListResponse<T> | T[] | undefined): T[] => {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.message)) return payload.message;
  return [];
};

export const menuAvailabilityService = {
  /**
   * Best-effort default company, mirroring the same fallback
   * `ury.ury.api.minimal.business_setup.get_branches` uses server-side
   * (user default company, else the first `Company` record) -- there is no
   * per-branch company field on the `Branch` doctype in this app.
   */
  async resolveDefaultCompany(): Promise<string | null> {
    const res = await call<FrappeListResponse<CompanyListRow>>('frappe.client.get_list', {
      doctype: 'Company',
      fields: ['name'],
      limit_page_length: 1,
    });
    const data = unwrapList(res);
    return data.length > 0 ? String(data[0].name) : null;
  },

  /** Bounded page of enabled catalog items, for checking sellability against. */
  async listCatalogItems(): Promise<CatalogItem[]> {
    const res = await call<FrappeListResponse<ItemListRow>>('frappe.client.get_list', {
      doctype: 'Item',
      fields: ['name', 'item_name'],
      filters: { disabled: 0 },
      limit_page_length: ITEM_CHECK_LIMIT,
      order_by: 'item_name asc',
    });
    return unwrapList(res).map((row) => ({ item_code: String(row.name || ''), item_name: row.item_name }));
  },

  /** Checks availability for every given item, at the given branch/company. */
  async checkAvailability(items: CatalogItem[], branch: string, company: string): Promise<AvailabilityCheckResult> {
    const failed: string[] = [];
    const outcomes = await runWithConcurrency(items, CHECK_CONCURRENCY, async (item) => {
      try {
        return await getItemAvailability({ item_code: item.item_code, branch, company });
      } catch {
        failed.push(item.item_code);
        return null;
      }
    });
    const checked = outcomes.filter((outcome): outcome is ItemAvailability => outcome !== null);
    return { checked, failed };
  },
};
