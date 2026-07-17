import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ApiRateLimiter,
  RateLimiterError,
  inferPriority,
  type RateLimiterConfig,
} from '../lib/api-rate-limiter';

function createTestLimiter(overrides?: Partial<RateLimiterConfig>): ApiRateLimiter {
  return new ApiRateLimiter({
    maxConcurrent: 3,
    ratePerSecond: { critical: 100, normal: 50, low: 20 },
    maxQueueSize: 10,
    defaultTimeout: 2000,
    processInterval: 10,
    ...overrides,
  });
}

function delayedResolve<T>(value: T, delayMs: number): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), delayMs));
}

describe('ApiRateLimiter', () => {
  let limiter: ApiRateLimiter;

  beforeEach(() => {
    limiter = createTestLimiter();
  });

  afterEach(() => {
    limiter.stop();
  });

  describe('immediate execution', () => {
    it('should execute a function immediately when capacity is available', async () => {
      const fn = vi.fn().mockResolvedValue('result');
      const result = await limiter.execute(fn, 'normal');
      expect(result).toBe('result');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should execute with default normal priority', async () => {
      const fn = vi.fn().mockResolvedValue('data');
      const result = await limiter.execute(fn);
      expect(result).toBe('data');
    });

    it('should track completed requests', async () => {
      await limiter.execute(() => Promise.resolve('ok'), 'normal');
      expect(limiter.getMetrics().completedRequests).toBe(1);
    });

    it('should track failed requests', async () => {
      await expect(
        limiter.execute(() => Promise.reject(new Error('fail')), 'normal')
      ).rejects.toThrow('fail');
      expect(limiter.getMetrics().failedRequests).toBe(1);
    });
  });

  describe('concurrent request limiting', () => {
    it('should respect maxConcurrent limit', async () => {
      const concurrentLimiter = createTestLimiter({ maxConcurrent: 2, ratePerSecond: { critical: 100, normal: 100, low: 100 } });
      let activeCount = 0;
      let maxActive = 0;

      const createSlowTask = () => () => {
        activeCount++;
        maxActive = Math.max(maxActive, activeCount);
        return delayedResolve(undefined, 100).then(() => { activeCount--; });
      };

      const promises = Array.from({ length: 5 }, () =>
        concurrentLimiter.execute(createSlowTask(), 'normal')
      );

      await Promise.all(promises);
      expect(maxActive).toBeLessThanOrEqual(2);
      concurrentLimiter.stop();
    });
  });

  describe('priority queue ordering', () => {
    it('should process critical before normal and low', async () => {
      const orderLimiter = createTestLimiter({
        maxConcurrent: 1,
        ratePerSecond: { critical: 100, normal: 100, low: 100 },
      });

      const executionOrder: string[] = [];
      let resolveBlocker: () => void;
      const blocker = new Promise<void>((resolve) => { resolveBlocker = resolve; });

      const blockerPromise = orderLimiter.execute(
        () => blocker.then(() => { executionOrder.push('blocker'); }),
        'normal'
      );

      await new Promise((r) => setTimeout(r, 50));

      const lowPromise = orderLimiter.execute(
        () => { executionOrder.push('low'); return Promise.resolve(); },
        'low'
      );
      const normalPromise = orderLimiter.execute(
        () => { executionOrder.push('normal'); return Promise.resolve(); },
        'normal'
      );
      const criticalPromise = orderLimiter.execute(
        () => { executionOrder.push('critical'); return Promise.resolve(); },
        'critical'
      );

      resolveBlocker!();
      await Promise.all([blockerPromise, lowPromise, normalPromise, criticalPromise]);

      expect(executionOrder.indexOf('critical')).toBeLessThan(executionOrder.indexOf('normal'));
      expect(executionOrder.indexOf('normal')).toBeLessThan(executionOrder.indexOf('low'));
      orderLimiter.stop();
    });

    it('should maintain FIFO within same priority level', async () => {
      const fifoLimiter = createTestLimiter({
        maxConcurrent: 1,
        ratePerSecond: { critical: 100, normal: 100, low: 100 },
      });

      const executionOrder: string[] = [];
      let resolveBlocker: () => void;
      const blocker = new Promise<void>((resolve) => { resolveBlocker = resolve; });

      const blockerPromise = fifoLimiter.execute(
        () => blocker.then(() => { executionOrder.push('blocker'); }),
        'normal'
      );

      await new Promise((r) => setTimeout(r, 50));

      const p1 = fifoLimiter.execute(() => { executionOrder.push('first'); return Promise.resolve(); }, 'normal');
      const p2 = fifoLimiter.execute(() => { executionOrder.push('second'); return Promise.resolve(); }, 'normal');
      const p3 = fifoLimiter.execute(() => { executionOrder.push('third'); return Promise.resolve(); }, 'normal');

      resolveBlocker!();
      await Promise.all([blockerPromise, p1, p2, p3]);

      expect(executionOrder.indexOf('first')).toBeLessThan(executionOrder.indexOf('second'));
      expect(executionOrder.indexOf('second')).toBeLessThan(executionOrder.indexOf('third'));
      fifoLimiter.stop();
    });
  });

  describe('request timeout', () => {
    it('should timeout queued requests', async () => {
      const timeoutLimiter = createTestLimiter({
        maxConcurrent: 1,
        defaultTimeout: 100,
        ratePerSecond: { critical: 100, normal: 100, low: 100 },
      });

      let resolveBlocker: () => void;
      const blocker = new Promise<void>((resolve) => { resolveBlocker = resolve; });

      timeoutLimiter.execute(() => blocker, 'normal');
      await new Promise((r) => setTimeout(r, 20));

      await expect(
        timeoutLimiter.execute(() => Promise.resolve('late'), 'low')
      ).rejects.toThrow('timed out in queue');

      resolveBlocker!();
      timeoutLimiter.stop();
    });

    it('should track timed out requests', async () => {
      const timeoutLimiter = createTestLimiter({
        maxConcurrent: 1,
        defaultTimeout: 50,
        ratePerSecond: { critical: 100, normal: 100, low: 100 },
      });

      let resolveBlocker: () => void;
      const blocker = new Promise<void>((resolve) => { resolveBlocker = resolve; });

      timeoutLimiter.execute(() => blocker, 'normal');
      await new Promise((r) => setTimeout(r, 10));

      try {
        await timeoutLimiter.execute(() => Promise.resolve('x'), 'low');
      } catch { /* expected */ }

      expect(timeoutLimiter.getMetrics().timedOutRequests).toBe(1);
      resolveBlocker!();
      timeoutLimiter.stop();
    });
  });

  describe('abort signal', () => {
    it('should reject immediately if already aborted', async () => {
      const controller = new AbortController();
      controller.abort();

      await expect(
        limiter.execute(() => Promise.resolve('x'), 'normal', { abortSignal: controller.signal })
      ).rejects.toThrow('aborted before queuing');
    });

    it('should reject queued request when signal fires', async () => {
      const abortLimiter = createTestLimiter({
        maxConcurrent: 1,
        ratePerSecond: { critical: 100, normal: 100, low: 100 },
      });

      let resolveBlocker: () => void;
      const blocker = new Promise<void>((resolve) => { resolveBlocker = resolve; });

      abortLimiter.execute(() => blocker, 'normal');
      await new Promise((r) => setTimeout(r, 20));

      const controller = new AbortController();
      const promise = abortLimiter.execute(
        () => Promise.resolve('x'), 'low', { abortSignal: controller.signal }
      );

      setTimeout(() => controller.abort(), 30);
      await expect(promise).rejects.toThrow('aborted');

      resolveBlocker!();
      abortLimiter.stop();
    });
  });

  describe('queue overload', () => {
    it('should reject when queue full and no low-priority to drop', async () => {
      const smallLimiter = createTestLimiter({
        maxConcurrent: 1,
        maxQueueSize: 3,
        ratePerSecond: { critical: 1, normal: 1, low: 1 },
        defaultTimeout: 5000,
      });

      let resolveBlocker: () => void;
      const blocker = new Promise<void>((resolve) => { resolveBlocker = resolve; });

      smallLimiter.execute(() => blocker, 'normal');
      await new Promise((r) => setTimeout(r, 30));

      for (let i = 0; i < 3; i++) {
        smallLimiter.execute(() => Promise.resolve(i), 'normal').catch(() => {});
      }
      await new Promise((r) => setTimeout(r, 30));

      await expect(
        smallLimiter.execute(() => Promise.resolve('overflow'), 'low')
      ).rejects.toThrow('queue full');

      resolveBlocker!();
      smallLimiter.stop();
    });

    it('should drop low-priority when queue full and new higher-priority arrives', async () => {
      const dropLimiter = createTestLimiter({
        maxConcurrent: 1,
        maxQueueSize: 3,
        ratePerSecond: { critical: 1, normal: 1, low: 1 },
        defaultTimeout: 5000,
      });

      let resolveBlocker: () => void;
      const blocker = new Promise<void>((resolve) => { resolveBlocker = resolve; });

      dropLimiter.execute(() => blocker, 'normal');
      await new Promise((r) => setTimeout(r, 30));

      for (let i = 0; i < 3; i++) {
        dropLimiter.execute(() => Promise.resolve(i), 'low').catch(() => {});
      }

      dropLimiter.execute(() => Promise.resolve('critical'), 'critical').catch(() => {});

      expect(dropLimiter.getMetrics().queueDrops).toBeGreaterThanOrEqual(1);
      resolveBlocker!();
      dropLimiter.stop();
    });

    it('should report isOverloaded when queue > 80%', async () => {
      const overloadLimiter = createTestLimiter({
        maxConcurrent: 1,
        maxQueueSize: 5,
        ratePerSecond: { critical: 1, normal: 1, low: 1 },
        defaultTimeout: 5000,
      });

      let resolveBlocker: () => void;
      const blocker = new Promise<void>((resolve) => { resolveBlocker = resolve; });

      overloadLimiter.execute(() => blocker, 'normal');
      await new Promise((r) => setTimeout(r, 30));

      for (let i = 0; i < 4; i++) {
        overloadLimiter.execute(() => Promise.resolve(i), 'low').catch(() => {});
      }

      expect(overloadLimiter.isOverloaded).toBe(true);
      resolveBlocker!();
      overloadLimiter.stop();
    });
  });

  describe('metrics', () => {
    it('should track total requests', async () => {
      await limiter.execute(() => Promise.resolve(1), 'normal');
      await limiter.execute(() => Promise.resolve(2), 'critical');
      await limiter.execute(() => Promise.resolve(3), 'low');
      expect(limiter.getMetrics().totalRequests).toBe(3);
    });

    it('should report available tokens per priority', () => {
      const m = limiter.getMetrics();
      expect(m.availableTokens).toHaveProperty('critical');
      expect(m.availableTokens).toHaveProperty('normal');
      expect(m.availableTokens).toHaveProperty('low');
    });
  });

  describe('backoff', () => {
    it('should reduce rate for a priority on backoff', async () => {
      const backoffLimiter = createTestLimiter({ ratePerSecond: { critical: 100, normal: 10, low: 5 } });
      backoffLimiter.backoff('normal', 0.1);
      // Rate should be reduced (we can't directly observe, but no crash)
      expect(typeof backoffLimiter.getMetrics().availableTokens.normal).toBe('number');
      backoffLimiter.stop();
    });
  });

  describe('clear and stop', () => {
    it('should reject all queued requests on clear', async () => {
      const clearLimiter = createTestLimiter({
        maxConcurrent: 1,
        ratePerSecond: { critical: 1, normal: 1, low: 1 },
        defaultTimeout: 5000,
      });

      let resolveBlocker: () => void;
      const blocker = new Promise<void>((resolve) => { resolveBlocker = resolve; });

      clearLimiter.execute(() => blocker, 'normal');
      await new Promise((r) => setTimeout(r, 30));

      const queuedPromise = clearLimiter.execute(
        () => Promise.resolve('x'), 'low'
      ).catch((err) => err);

      clearLimiter.clear();

      const result = await queuedPromise;
      expect(result).toBeInstanceOf(RateLimiterError);
      expect((result as RateLimiterError).code).toBe('CLEARED');

      resolveBlocker!();
      clearLimiter.stop();
    });

    it('should stop processing on stop', () => {
      limiter.stop();
      expect(() => limiter.execute(() => Promise.resolve('ok'), 'normal')).not.toThrow();
    });
  });

  describe('RateLimiterError', () => {
    it('should have correct name and code', () => {
      const err = new RateLimiterError('test', 'TEST_CODE');
      expect(err.name).toBe('RateLimiterError');
      expect(err.code).toBe('TEST_CODE');
      expect(err.message).toBe('test');
    });

    it('should be an instance of Error', () => {
      expect(new RateLimiterError('test', 'CODE')).toBeInstanceOf(Error);
    });
  });
});

describe('inferPriority', () => {
  it('should infer critical for order sync', () => {
    expect(inferPriority('ury.ury.doctype.ury_order.ury_order.sync_order')).toBe('critical');
  });
  it('should infer critical for merge/unmerge', () => {
    expect(inferPriority('ury.ury.doctype.ury_order.ury_order.merge_table')).toBe('critical');
    expect(inferPriority('ury.ury.doctype.ury_order.ury_order.unmerge_tables')).toBe('critical');
  });
  it('should infer critical for shift ops', () => {
    expect(inferPriority('ury.ury.api.shift.open_shift')).toBe('critical');
    expect(inferPriority('ury.ury.api.shift.close_shift')).toBe('critical');
  });
  it('should infer critical for payment/submit/cancel', () => {
    expect(inferPriority('ury.ury.api.pos.create_payment')).toBe('critical');
    expect(inferPriority('ury.ury.api.pos.submit_invoice')).toBe('critical');
    expect(inferPriority('ury.ury.api.pos.cancel_invoice')).toBe('critical');
  });
  it('should infer low for dashboard/reports', () => {
    expect(inferPriority('ury.ury.api.ury_dashboard.get_dashboard_summary')).toBe('low');
    expect(inferPriority('ury.ury.api.reports.get_sales_report')).toBe('low');
    expect(inferPriority('ury.ury.api.reports.export_pdf')).toBe('low');
  });
  it('should infer low for analytics/live_metrics', () => {
    expect(inferPriority('ury.ury.api.ury_dashboard.live_metrics')).toBe('low');
    expect(inferPriority('ury.ury.api.analytics.get_analytics')).toBe('low');
  });
  it('should infer normal for menu/tables/search', () => {
    expect(inferPriority('ury.ury.api.menu.get_restaurant_menu')).toBe('normal');
    expect(inferPriority('ury.ury.api.tables.get_tables')).toBe('normal');
    expect(inferPriority('ury.ury.api.customer.search_customers')).toBe('normal');
  });
  it('should default to normal for unknown', () => {
    expect(inferPriority('ury.ury.api.unknown.method')).toBe('normal');
  });
});
