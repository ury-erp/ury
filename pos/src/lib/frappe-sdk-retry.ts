/**
 * Retry-enabled wrapper around the Frappe SDK call object.
 *
 * Drop-in replacement: change `import { call } from './frappe-sdk'`
 * to `import { call } from './frappe-sdk-retry'` in any API file
 * to get automatic retry with exponential backoff on network/5xx errors.
 *
 * All other SDK methods (db, auth) are unchanged — only `call.get` and
 * `call.post` are wrapped with `withRetry`.
 */

import { call as originalCall } from './frappe-sdk';
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

/**
 * Create a retry-enabled version of the `call` object from frappe-js-sdk.
 * The interface is identical so it can be used as a drop-in replacement.
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

export { callWithRetry as call };
