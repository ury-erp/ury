/**
 * API request deduplication and caching layer.
 *
 * Prevents duplicate in-flight requests for the same endpoint+params,
 * and optionally caches GET responses with TTL.
 *
 * Usage:
 *   import { dedupedCall } from './api-dedup';
 *   const data = await dedupedCall.get('ury_dashboard.api.summary');
 */

import { call } from './frappe-sdk-retry';
import { logger } from './logger';

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

interface PendingRequest {
  promise: Promise<unknown>;
  timestamp: number;
}

/** In-flight request deduplication map: key → Promise */
const pendingRequests = new Map<string, PendingRequest>();

/** Response cache: key → { data, timestamp } */
const responseCache = new Map<string, CacheEntry<unknown>>();

/** Default TTL for cached responses (5 minutes) */
const DEFAULT_CACHE_TTL = 5 * 60 * 1000;

/** Max age for pending request before it's considered stale (30 seconds) */
const PENDING_REQUEST_MAX_AGE = 30 * 1000;

/**
 * Generate a cache/dedup key from method + params.
 */
function makeKey(method: string, params?: Record<string, unknown>): string {
  const paramsKey = params ? JSON.stringify(params) : '';
  return `${method}::${paramsKey}`;
}

/**
 * Clean up stale pending requests.
 */
function cleanupStalePending(): void {
  const now = Date.now();
  for (const [key, entry] of pendingRequests.entries()) {
    if (now - entry.timestamp > PENDING_REQUEST_MAX_AGE) {
      pendingRequests.delete(key);
    }
  }
}

/**
 * Clean up expired cache entries.
 */
function cleanupExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of responseCache.entries()) {
    // Estimate TTL based on creation time (default 5 min)
    if (now - entry.timestamp > DEFAULT_CACHE_TTL) {
      responseCache.delete(key);
    }
  }
}

/**
 * Deduplicated and cached version of call.get.
 * If a request for the same method+params is already in-flight,
 * returns the same Promise instead of making a duplicate call.
 * If a cached response exists and is still fresh, returns it directly.
 */
export const dedupedCall = {
  get: async <T = unknown>(
    method: string,
    params?: Record<string, unknown>,
    options?: {
      /** Cache TTL in ms. Set to 0 to skip cache. Default: 300000 (5 min) */
      cacheTtl?: number;
      /** Skip dedup entirely */
      noDedup?: boolean;
    }
  ): Promise<T> => {
    const cacheTtl = options?.cacheTtl ?? DEFAULT_CACHE_TTL;
    const key = makeKey(method, params);

    // Clean up stale entries periodically
    cleanupStalePending();
    cleanupExpiredCache();

    // Check cache first (if TTL > 0)
    if (cacheTtl > 0) {
      const cached = responseCache.get(key) as CacheEntry<T> | undefined;
      if (cached && Date.now() - cached.timestamp < cacheTtl) {
        logger.debug(`[API Cache HIT] ${method}`);
        return cached.data;
      }
    }

    // Check for in-flight request (dedup)
    if (!options?.noDedup) {
      const pending = pendingRequests.get(key);
      if (pending && Date.now() - pending.timestamp < PENDING_REQUEST_MAX_AGE) {
        logger.debug(`[API Dedup] Reusing in-flight request for ${method}`);
        return pending.promise as Promise<T>;
      }
    }

    // Make the actual request
    const promise = call.get<T>(method, params)
      .then((data) => {
        // Cache the response
        if (cacheTtl > 0) {
          responseCache.set(key, { data, timestamp: Date.now() });
        }
        // Remove from pending
        pendingRequests.delete(key);
        return data;
      })
      .catch((error) => {
        // Remove from pending on error too
        pendingRequests.delete(key);
        throw error;
      });

    // Register as pending
    pendingRequests.set(key, { promise, timestamp: Date.now() });

    return promise;
  },

  post: async <T = unknown>(
    method: string,
    params?: Record<string, unknown>
  ): Promise<T> => {
    // POST requests are never cached, but we still dedup in-flight
    const key = makeKey(method, params);

    cleanupStalePending();

    const pending = pendingRequests.get(key);
    if (pending && Date.now() - pending.timestamp < PENDING_REQUEST_MAX_AGE) {
      logger.debug(`[API Dedup] Reusing in-flight POST for ${method}`);
      return pending.promise as Promise<T>;
    }

    const promise = call.post<T>(method, params)
      .then((data) => {
        pendingRequests.delete(key);
        // Invalidate any cached GET responses for related endpoints
        invalidateRelatedCache(method);
        return data;
      })
      .catch((error) => {
        pendingRequests.delete(key);
        throw error;
      });

    pendingRequests.set(key, { promise, timestamp: Date.now() });

    return promise;
  },
};

/**
 * Invalidate cache entries that may be affected by a POST request.
 * Uses heuristic: if the POST method path shares a prefix with cached GET entries,
 * those entries are invalidated.
 */
function invalidateRelatedCache(postMethod: string): void {
  // Extract the base API module (e.g., "ury_dashboard.api" from "ury_dashboard.api.summary")
  const baseModule = postMethod.split('.').slice(0, 3).join('.');
  let invalidated = 0;

  for (const [key] of responseCache.entries()) {
    if (key.startsWith(baseModule)) {
      responseCache.delete(key);
      invalidated++;
    }
  }

  if (invalidated > 0) {
    logger.debug(`[API Cache] Invalidated ${invalidated} entries after POST to ${postMethod}`);
  }
}

/**
 * Manually invalidate specific cache entries.
 */
export function invalidateCache(method?: string, params?: Record<string, unknown>): void {
  if (method) {
    const key = makeKey(method, params);
    responseCache.delete(key);
  } else {
    responseCache.clear();
    logger.debug('[API Cache] Cleared all cache entries');
  }
}

/**
 * Get cache statistics for debugging/monitoring.
 */
export function getCacheStats(): {
  pendingCount: number;
  cachedCount: number;
  cacheKeys: string[];
} {
  return {
    pendingCount: pendingRequests.size,
    cachedCount: responseCache.size,
    cacheKeys: Array.from(responseCache.keys()),
  };
}
