import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock frappe-sdk-retry before importing api-dedup
vi.mock('./frappe-sdk-retry', () => ({
  call: {
    get: vi.fn(),
    post: vi.fn(),
  },
  db: {
    getDocList: vi.fn(),
    getDoc: vi.fn(),
    getValue: vi.fn(),
    getCount: vi.fn(),
  },
  auth: { getLoggedInUser: vi.fn() },
}));

// Mock logger
vi.mock('./logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    setLevel: vi.fn(),
  },
}));

import { dedupedCall, invalidateCache, getCacheStats } from './api-dedup';
import { call } from './frappe-sdk-retry';

describe('api-dedup: dedupedCall.get', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCache(); // Clear all cache between tests
  });

  it('should make the actual API call on first request', async () => {
    (call.get as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ message: 'hello' });

    const result = await dedupedCall.get('test.api.method', { key: 'value' });

    expect(result).toEqual({ message: 'hello' });
    expect(call.get).toHaveBeenCalledWith('test.api.method', { key: 'value' });
  });

  it('should return cached response on second call within TTL', async () => {
    (call.get as ReturnType<typeof vi.fn>).mockResolvedValue({ message: 'cached' });

    const first = await dedupedCall.get('test.api.method', undefined, { cacheTtl: 60000 });
    const second = await dedupedCall.get('test.api.method', undefined, { cacheTtl: 60000 });

    expect(first).toEqual({ message: 'cached' });
    expect(second).toEqual({ message: 'cached' });
    // Should only call the API once (second served from cache)
    expect(call.get).toHaveBeenCalledTimes(1);
  });

  it('should dedup concurrent in-flight requests', async () => {
    let resolveFirst: (value: unknown) => void;
    const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });

    (call.get as ReturnType<typeof vi.fn>).mockReturnValueOnce(firstPromise);

    // Fire two concurrent requests
    const req1 = dedupedCall.get('test.api.concurrent', undefined, { cacheTtl: 0 });
    const req2 = dedupedCall.get('test.api.concurrent', undefined, { cacheTtl: 0 });

    // Resolve the API call
    resolveFirst!({ message: 'deduped' });

    const [res1, res2] = await Promise.all([req1, req2]);

    expect(res1).toEqual({ message: 'deduped' });
    expect(res2).toEqual({ message: 'deduped' });
    // Only one actual API call should have been made
    expect(call.get).toHaveBeenCalledTimes(1);
  });

  it('should skip cache when cacheTtl is 0', async () => {
    (call.get as ReturnType<typeof vi.fn>).mockResolvedValue({ message: 'fresh' });

    const r1 = await dedupedCall.get('test.api.nocache', undefined, { cacheTtl: 0 });
    const r2 = await dedupedCall.get('test.api.nocache', undefined, { cacheTtl: 0 });

    expect(r1).toEqual({ message: 'fresh' });
    expect(r2).toEqual({ message: 'fresh' });
    // Both should hit the API (no caching)
    expect(call.get).toHaveBeenCalledTimes(2);
  });

  it('should remove pending request on error', async () => {
    (call.get as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('API Error'));

    await expect(
      dedupedCall.get('test.api.error', undefined, { cacheTtl: 0 })
    ).rejects.toThrow('API Error');

    // Stats should show no pending requests after error
    const stats = getCacheStats();
    expect(stats.pendingCount).toBe(0);
  });

  it('should cache response and make new call after invalidation', async () => {
    (call.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: 'response' });

    await dedupedCall.get('test.api.cache_test', undefined, { cacheTtl: 60000 });
    expect(call.get).toHaveBeenCalledTimes(1);

    // Second call should use cache
    await dedupedCall.get('test.api.cache_test', undefined, { cacheTtl: 60000 });
    expect(call.get).toHaveBeenCalledTimes(1); // Still 1

    // Invalidate cache
    invalidateCache('test.api.cache_test');

    // Third call should hit API again
    await dedupedCall.get('test.api.cache_test', undefined, { cacheTtl: 60000 });
    expect(call.get).toHaveBeenCalledTimes(2); // Now 2
  });
});

describe('api-dedup: dedupedCall.post', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCache();
  });

  it('should make the actual POST call', async () => {
    (call.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ message: 'created' });

    const result = await dedupedCall.post('test.api.create', { name: 'Item' });

    expect(result).toEqual({ message: 'created' });
    expect(call.post).toHaveBeenCalledWith('test.api.create', { name: 'Item' });
  });

  it('should dedup concurrent POST requests', async () => {
    let resolveFirst: (value: unknown) => void;
    const firstPromise = new Promise((resolve) => { resolveFirst = resolve; });

    (call.post as ReturnType<typeof vi.fn>).mockReturnValueOnce(firstPromise);

    const req1 = dedupedCall.post('test.api.create', { name: 'Item' });
    const req2 = dedupedCall.post('test.api.create', { name: 'Item' });

    resolveFirst!({ message: 'created' });

    const [res1, res2] = await Promise.all([req1, req2]);

    expect(res1).toEqual({ message: 'created' });
    expect(res2).toEqual({ message: 'created' });
    expect(call.post).toHaveBeenCalledTimes(1);
  });

  it('should remove pending request after POST completes', async () => {
    (call.post as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ message: 'ok' });

    await dedupedCall.post('test.api.create', { name: 'Item' });

    const stats = getCacheStats();
    expect(stats.pendingCount).toBe(0);
  });

  it('should remove pending request after POST error', async () => {
    (call.post as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('POST failed'));

    await expect(dedupedCall.post('test.api.create', { name: 'Item' })).rejects.toThrow('POST failed');

    const stats = getCacheStats();
    expect(stats.pendingCount).toBe(0);
  });
});

describe('api-dedup: invalidateCache', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCache();
  });

  it('should clear all cache when called without arguments', async () => {
    (call.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: 'response' });

    await dedupedCall.get('test.api.x', undefined, { cacheTtl: 60000 });
    expect(call.get).toHaveBeenCalledTimes(1);

    // Second call should use cache
    await dedupedCall.get('test.api.x', undefined, { cacheTtl: 60000 });
    expect(call.get).toHaveBeenCalledTimes(1); // Still 1, from cache

    // Clear all cache
    invalidateCache();

    // Third call should hit API again
    await dedupedCall.get('test.api.x', undefined, { cacheTtl: 60000 });
    expect(call.get).toHaveBeenCalledTimes(2); // Now 2
  });

  it('should clear specific cache entry when method is provided', async () => {
    (call.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: 'response' });

    await dedupedCall.get('test.api.a', undefined, { cacheTtl: 60000 });
    await dedupedCall.get('test.api.b', undefined, { cacheTtl: 60000 });
    expect(call.get).toHaveBeenCalledTimes(2); // a + b

    // Both should be cached now
    await dedupedCall.get('test.api.a', undefined, { cacheTtl: 60000 });
    await dedupedCall.get('test.api.b', undefined, { cacheTtl: 60000 });
    expect(call.get).toHaveBeenCalledTimes(2); // Still 2, both cached

    // Invalidate only 'a'
    invalidateCache('test.api.a');

    // 'a' should be fetched again
    await dedupedCall.get('test.api.a', undefined, { cacheTtl: 60000 });
    expect(call.get).toHaveBeenCalledTimes(3); // a fetched again

    // 'b' should still be cached
    await dedupedCall.get('test.api.b', undefined, { cacheTtl: 60000 });
    expect(call.get).toHaveBeenCalledTimes(3); // b still cached
  });
});

describe('api-dedup: getCacheStats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    invalidateCache();
  });

  it('should return empty stats when no requests made', () => {
    const stats = getCacheStats();
    expect(stats.pendingCount).toBe(0);
    expect(stats.cachedCount).toBe(0);
    expect(stats.cacheKeys).toEqual([]);
  });

  it('should report cached entries', async () => {
    (call.get as ReturnType<typeof vi.fn>).mockResolvedValue({ data: 'test' });

    await dedupedCall.get('test.api.one', undefined, { cacheTtl: 60000 });
    await dedupedCall.get('test.api.two', undefined, { cacheTtl: 60000 });

    const stats = getCacheStats();
    expect(stats.cachedCount).toBe(2);
    expect(stats.cacheKeys.length).toBe(2);
  });
});
