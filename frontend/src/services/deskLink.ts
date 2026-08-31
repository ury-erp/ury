import { call } from '@ury/core';

/**
 * Doctype-level permission probe backing the "Open in Desk" links that
 * read-only `/ury` screens show. Wraps
 * `ury.ury.api.ury_desk_link.get_desk_permissions`.
 *
 * The results are memoised per session: doctype-level permissions come from
 * the user's role set and do not change while a page is open, and the same
 * doctype is often asked about by several rows/screens at once. In-flight
 * promises are shared too, so mounting twenty rows issues one request, not
 * twenty.
 */

export interface DeskPermission {
  read: boolean;
  write: boolean;
}

const DENIED: DeskPermission = { read: false, write: false };

const cache = new Map<string, DeskPermission>();
const inFlight = new Map<string, Promise<DeskPermission>>();

const normalize = (value: any): DeskPermission => ({
  read: Boolean(value?.read),
  write: Boolean(value?.write),
});

/**
 * Resolve the current user's `read`/`write` permission on `doctype`.
 *
 * Never throws: a failed probe resolves to "no permission", so a backend that
 * is unreachable or does not yet have the endpoint simply results in no desk
 * link being offered rather than a broken screen.
 */
export const getDeskPermission = async (doctype: string): Promise<DeskPermission> => {
  if (!doctype) return DENIED;

  const cached = cache.get(doctype);
  if (cached) return cached;

  const pending = inFlight.get(doctype);
  if (pending) return pending;

  const request = call<any>('ury.ury.api.ury_desk_link.get_desk_permissions', {
    doctypes: [doctype],
  })
    .then((res) => {
      const payload = res?.message ?? res ?? {};
      const permission = normalize(payload[doctype]);
      cache.set(doctype, permission);
      return permission;
    })
    .catch(() => DENIED)
    .finally(() => {
      inFlight.delete(doctype);
    });

  inFlight.set(doctype, request);
  return request;
};

/** Test seam: drop the memoised permissions (e.g. after a role change). */
export const clearDeskPermissionCache = () => {
  cache.clear();
  inFlight.clear();
};
