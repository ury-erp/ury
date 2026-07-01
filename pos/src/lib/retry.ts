/**
 * Retry utility for API calls with exponential backoff.
 *
 * Usage:
 *   import { withRetry } from '../lib/retry';
 *   const data = await withRetry(() => call.get('endpoint', params));
 */

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Initial delay in ms before first retry (default: 1000) */
  initialDelay: number;
  /** Multiplier applied to delay after each retry (default: 2) */
  backoffMultiplier: number;
  /** Maximum delay cap in ms (default: 10000) */
  maxDelay: number;
  /** Custom function to determine if an error is retryable (default: network/5xx) */
  isRetryable?: (error: unknown) => boolean;
  /** Callback fired before each retry attempt */
  onRetry?: (attempt: number, error: unknown) => void;
}

const DEFAULT_OPTIONS: RetryOptions = {
  maxRetries: 3,
  initialDelay: 1000,
  backoffMultiplier: 2,
  maxDelay: 10000,
};

/**
 * Determines if an error is retryable.
 * Network errors and 5xx server errors are considered retryable.
 * 4xx errors (except 429 Too Many Requests) are not retryable.
 */
function defaultIsRetryable(error: unknown): boolean {
  if (!error) return false;

  // Frappe-specific error patterns
  const anyErr = error as Record<string, unknown>;

  // Network errors (no response received)
  if (anyErr.message === 'Network Error' || anyErr.code === 'ERR_NETWORK') {
    return true;
  }

  // HTTP status code checks
  const httpStatus = (anyErr as { httpStatus?: number }).httpStatus
    ?? (anyErr.response as { status?: number } | undefined)?.status;

  if (httpStatus) {
    // Retry on 5xx server errors and 429 Too Many Requests
    if (httpStatus >= 500 || httpStatus === 429) return true;
    // Don't retry on 4xx client errors
    if (httpStatus >= 400 && httpStatus < 500) return false;
  }

  // Timeout errors
  if (anyErr.code === 'ECONNABORTED' || anyErr.code === 'ETIMEDOUT') {
    return true;
  }

  // Frappe server messages that indicate temporary issues
  if (anyErr._server_messages && typeof anyErr._server_messages === 'string') {
    try {
      const messages = JSON.parse(anyErr._server_messages as string);
      if (Array.isArray(messages)) {
        const msgObj = JSON.parse(messages[0]);
        // Don't retry validation errors or permission errors
        if (msgObj.message?.includes('PermissionDenied') || msgObj.message?.includes('ValidationError')) {
          return false;
        }
      }
    } catch {
      // Can't parse, might be retryable
    }
  }

  // Default: retry on unknown errors (could be network issues)
  return true;
}

/**
 * Sleep for a given number of milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate the delay for a given retry attempt with exponential backoff and jitter.
 */
function calculateDelay(attempt: number, options: RetryOptions): number {
  const exponentialDelay = options.initialDelay * Math.pow(options.backoffMultiplier, attempt);
  const cappedDelay = Math.min(exponentialDelay, options.maxDelay);
  // Add jitter (±25% of the delay) to avoid thundering herd
  const jitter = cappedDelay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, Math.round(cappedDelay + jitter));
}

/**
 * Execute an async function with automatic retry on failure.
 *
 * @param fn - The async function to execute
 * @param options - Retry configuration options
 * @returns The result of the function
 * @throws The last error if all retries are exhausted
 *
 * @example
 * // Simple usage with defaults
 * const data = await withRetry(() => fetchMenu());
 *
 * @example
 * // Custom options
 * const data = await withRetry(() => fetchMenu(), {
 *   maxRetries: 5,
 *   initialDelay: 500,
 *   onRetry: (attempt, err) => console.warn(`Retry ${attempt}:`, err),
 * });
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts: RetryOptions = { ...DEFAULT_OPTIONS, ...options };
  const isRetryable = opts.isRetryable ?? defaultIsRetryable;

  let lastError: unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // If this was the last attempt or the error is not retryable, throw immediately
      if (attempt >= opts.maxRetries || !isRetryable(error)) {
        throw error;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, opts);

      // Notify via callback
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, error);
      }

      await sleep(delay);
    }
  }

  // This should never be reached, but TypeScript needs it
  throw lastError;
}

/**
 * Create a pre-configured retry wrapper for consistent usage across the app.
 *
 * @example
 * const apiRetry = createRetry({ maxRetries: 2, initialDelay: 500 });
 * const data = await apiRetry(() => call.get('endpoint'));
 */
export function createRetry(defaults: Partial<RetryOptions>) {
  return <T>(fn: () => Promise<T>, overrides?: Partial<RetryOptions>) =>
    withRetry(fn, { ...defaults, ...overrides });
}
