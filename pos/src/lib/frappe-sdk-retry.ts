/**
 * Retry-enabled wrapper around the Frappe SDK.
 *
 * Drop-in replacement: change `import { call, db, auth } from './frappe-sdk'`
 * to `import { call, db, auth } from './frappe-sdk-retry'` in any API file
 * to get automatic retry with exponential backoff on network/5xx errors.
 *
 * - `call.get` / `call.post` — wrapped with retry (GET: 3 retries, POST: 2)
 * - `db.getDocList` / `db.getDoc` / `db.getValue` / `db.getCount` — wrapped with retry (3 retries)
 * - `auth` — passed through without retry (login/signup are idempotent-safe but shouldn't auto-retry)
 */

import { call as originalCall, db as originalDb, auth as originalAuth } from './frappe-sdk';
import { withRetry, type RetryOptions } from './retry';

/** Default retry options for read (GET) operations — more retries, longer backoff */
const GET_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 800,
  backoffMultiplier: 2,
  maxDelay: 8000,
};

/** Default retry options for write (POST) operations — fewer retries, faster */
const POST_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxRetries: 2,
  initialDelay: 500,
  backoffMultiplier: 2,
  maxDelay: 5000,
};

/** Default retry options for DB read operations */
const DB_READ_RETRY_OPTIONS: Partial<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 600,
  backoffMultiplier: 2,
  maxDelay: 6000,
};

/**
 * Retry-enabled version of the `call` object from frappe-js-sdk.
 * Interface is identical so it can be used as a drop-in replacement.
 */
const callWithRetry = {
  get: <T = unknown>(method: string, params?: Record<string, unknown>, options?: Partial<RetryOptions>) =>
    withRetry<T>(
      () => originalCall.get<T>(method, params),
      { ...GET_RETRY_OPTIONS, ...options }
    ),

  post: <T = unknown>(method: string, params?: Record<string, unknown>, options?: Partial<RetryOptions>) =>
    withRetry<T>(
      () => originalCall.post<T>(method, params),
      { ...POST_RETRY_OPTIONS, ...options }
    ),
};

/**
 * Retry-enabled version of the `db` object from frappe-js-sdk.
 * Wraps common DB operations with retry logic.
 */
const dbWithRetry = {
  getDocList: <T = unknown>(doctype: string, params?: Record<string, unknown>, options?: Partial<RetryOptions>) =>
    withRetry<T>(
      () => originalDb.getDocList<T>(doctype, params),
      { ...DB_READ_RETRY_OPTIONS, ...options }
    ),

  getDoc: <T = unknown>(doctype: string, name: string, options?: Partial<RetryOptions>) =>
    withRetry<T>(
      () => originalDb.getDoc<T>(doctype, name),
      { ...DB_READ_RETRY_OPTIONS, ...options }
    ),

  getValue: <T = unknown>(doctype: string, name: string, fieldname: string | string[], options?: Partial<RetryOptions>) =>
    withRetry<T>(
      () => originalDb.getValue<T>(doctype, name, fieldname),
      { ...DB_READ_RETRY_OPTIONS, ...options }
    ),

  getCount: <T = unknown>(doctype: string, params?: Record<string, unknown>, options?: Partial<RetryOptions>) =>
    withRetry<T>(
      () => originalDb.getCount<T>(doctype, params),
      { ...DB_READ_RETRY_OPTIONS, ...options }
    ),
};

export { callWithRetry as call, dbWithRetry as db, originalAuth as auth };
