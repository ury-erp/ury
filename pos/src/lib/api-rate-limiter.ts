/**
 * API Rate Limiter with Priority Queue for URY POS.
 *
 * Controls the rate of outgoing API requests to prevent overwhelming
 * the Frappe/ERPNext server, and ensures critical operations (order sync,
 * payment processing) are prioritized over low-priority analytics calls.
 *
 * Architecture:
 *   Domain API → api-dedup (cache + dedup) → rate limiter → frappe-sdk-retry → frappe-sdk
 *
 * Features:
 * - Token bucket rate limiting per priority level
 * - Priority queue: critical > normal > low
 * - Concurrent request limiting (max in-flight requests)
 * - Automatic queue processing with token refill
 * - Request timeout and abort signal support
 * - Graceful degradation: drops lowest-priority requests on overload
 * - Metrics for PerformanceOverlay integration
 */

import { logger } from './logger';

// ---- Priority Types ----

/** Request priority levels. Higher priority = processed first. */
export type RequestPriority = 'critical' | 'normal' | 'low';

/** Numeric ordering for priority comparison (lower = higher priority) */
const PRIORITY_ORDER: Record<RequestPriority, number> = {
  critical: 0,
  normal: 1,
  low: 2,
};

// ---- Configuration ----

export interface RateLimiterConfig {
  /** Max concurrent in-flight requests (default: 6) */
  maxConcurrent: number;
  /** Max requests per second per priority level */
  ratePerSecond: Record<RequestPriority, number>;
  /** Max queue size before rejecting new requests (default: 50) */
  maxQueueSize: number;
  /** Default timeout for queued requests in ms (default: 30000) */
  defaultTimeout: number;
  /** Interval in ms for the queue processing tick (default: 100) */
  processInterval: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  maxConcurrent: 6,
  ratePerSecond: {
    critical: 10,
    normal: 5,
    low: 2,
  },
  maxQueueSize: 50,
  defaultTimeout: 30_000,
  processInterval: 100,
};

// ---- Token Bucket ----

class TokenBucket {
  private tokens: number;
  private maxTokens: number;
  private refillRateMs: number;
  private lastRefill: number;

  constructor(maxTokens: number, tokensPerSecond: number) {
    this.maxTokens = maxTokens;
    this.tokens = maxTokens;
    this.refillRateMs = tokensPerSecond / 1000;
    this.lastRefill = Date.now();
  }

  tryConsume(): boolean {
    this.refill();
    if (this.tokens >= 1) {
      this.tokens -= 1;
      return true;
    }
    return false;
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    if (elapsed > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + elapsed * this.refillRateMs);
      this.lastRefill = now;
    }
  }

  get availableTokens(): number {
    this.refill();
    return Math.floor(this.tokens);
  }

  updateRate(tokensPerSecond: number): void {
    this.refill();
    this.refillRateMs = tokensPerSecond / 1000;
    this.maxTokens = tokensPerSecond;
    this.tokens = Math.min(this.tokens, this.maxTokens);
  }
}

// ---- Queue Entry ----

interface QueuedRequest<T = unknown> {
  id: string;
  priority: RequestPriority;
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (reason: unknown) => void;
  timestamp: number;
  timeout: number;
  abortSignal?: AbortSignal;
  timer: ReturnType<typeof setTimeout> | null;
  abortHandler: (() => void) | null;
}

// ---- Error Class ----

export class RateLimiterError extends Error {
  public readonly code: string;

  constructor(message: string, code: string) {
    super(message);
    this.name = 'RateLimiterError';
    this.code = code;
  }
}

// ---- Metrics ----

export interface RateLimiterMetrics {
  totalRequests: number;
  completedRequests: number;
  failedRequests: number;
  timedOutRequests: number;
  rejectedRequests: number;
  queueDrops: number;
  activeRequests: number;
  queuedRequests: number;
  availableTokens: Record<RequestPriority, number>;
  avgQueueWaitMs: number;
}

// ---- Rate Limiter ----

export class ApiRateLimiter {
  private readonly config: RateLimiterConfig;
  private readonly queue: QueuedRequest[] = [];
  private activeCount = 0;
  private readonly buckets: Map<RequestPriority, TokenBucket>;
  private processTimer: ReturnType<typeof setInterval> | null = null;
  private requestIdCounter = 0;
  private started = false;

  private metrics = {
    totalRequests: 0,
    completedRequests: 0,
    failedRequests: 0,
    timedOutRequests: 0,
    rejectedRequests: 0,
    queueDrops: 0,
  };

  private readonly waitTimes: number[] = [];
  private static readonly MAX_WAIT_SAMPLES = 20;

  constructor(config?: Partial<RateLimiterConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.buckets = new Map();
    for (const [priority, rate] of Object.entries(this.config.ratePerSecond)) {
      this.buckets.set(priority as RequestPriority, new TokenBucket(rate, rate));
    }
  }

  async execute<T>(
    fn: () => Promise<T>,
    priority: RequestPriority = 'normal',
    options?: { timeout?: number; abortSignal?: AbortSignal }
  ): Promise<T> {
    this.metrics.totalRequests++;

    if (options?.abortSignal?.aborted) {
      this.metrics.rejectedRequests++;
      throw new RateLimiterError('Request aborted before queuing', 'ABORTED');
    }

    if (this.activeCount < this.config.maxConcurrent) {
      const bucket = this.buckets.get(priority);
      if (bucket && bucket.tryConsume()) {
        return this.runRequest(fn, priority, Date.now());
      }
      if (priority === 'critical' && this.activeCount < this.config.maxConcurrent - 1) {
        return this.runRequest(fn, priority, Date.now());
      }
    }

    return this.enqueue(fn, priority, options);
  }

  getMetrics(): RateLimiterMetrics {
    const availableTokens: Record<RequestPriority, number> = { critical: 0, normal: 0, low: 0 };
    for (const [priority, bucket] of this.buckets.entries()) {
      availableTokens[priority] = bucket.availableTokens;
    }

    const avgQueueWaitMs =
      this.waitTimes.length > 0
        ? this.waitTimes.reduce((sum, t) => sum + t, 0) / this.waitTimes.length
        : 0;

    return {
      ...this.metrics,
      activeRequests: this.activeCount,
      queuedRequests: this.queue.length,
      availableTokens,
      avgQueueWaitMs,
    };
  }

  backoff(priority: RequestPriority, factor: number = 0.5): void {
    const bucket = this.buckets.get(priority);
    if (bucket) {
      const currentRate = this.config.ratePerSecond[priority];
      const newRate = Math.max(1, Math.floor(currentRate * factor));
      bucket.updateRate(newRate);
      logger.warn(`[Rate Limiter] Backed off ${priority} rate: ${currentRate}/s → ${newRate}/s`);

      setTimeout(() => {
        bucket.updateRate(currentRate);
        logger.info(`[Rate Limiter] Recovered ${priority} rate to ${currentRate}/s`);
      }, 30_000);
    }
  }

  start(): void {
    if (this.started) return;
    this.started = true;
    this.processTimer = setInterval(() => this.processQueue(), this.config.processInterval);
  }

  stop(): void {
    if (this.processTimer) {
      clearInterval(this.processTimer);
      this.processTimer = null;
    }
    this.started = false;
    this.clear();
  }

  clear(): void {
    for (const request of this.queue) {
      this.cleanupRequest(request);
      request.reject(new RateLimiterError('Rate limiter cleared', 'CLEARED'));
    }
    this.queue.length = 0;
  }

  get isOverloaded(): boolean {
    return this.queue.length >= this.config.maxQueueSize * 0.8;
  }

  // ---- Private ----

  private async runRequest<T>(
    fn: () => Promise<T>,
    _priority: RequestPriority,
    queuedAt: number
  ): Promise<T> {
    this.activeCount++;
    this.ensureStarted();

    const waitTime = Date.now() - queuedAt;
    if (waitTime > 10) {
      this.waitTimes.push(waitTime);
      if (this.waitTimes.length > ApiRateLimiter.MAX_WAIT_SAMPLES) {
        this.waitTimes.shift();
      }
    }

    try {
      const result = await fn();
      this.metrics.completedRequests++;
      return result;
    } catch (error) {
      this.metrics.failedRequests++;
      throw error;
    } finally {
      this.activeCount--;
    }
  }

  private enqueue<T>(
    fn: () => Promise<T>,
    priority: RequestPriority,
    options?: { timeout?: number; abortSignal?: AbortSignal }
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      if (this.queue.length >= this.config.maxQueueSize) {
        if (!this.dropLowestPriority()) {
          this.metrics.rejectedRequests++;
          reject(new RateLimiterError('Rate limiter queue full', 'QUEUE_FULL'));
          return;
        }
      }

      const id = `rl-${this.requestIdCounter++}`;
      const timeout = options?.timeout ?? this.config.defaultTimeout;

      const request: QueuedRequest<T> = {
        id, priority, fn, resolve, reject,
        timestamp: Date.now(),
        timeout,
        abortSignal: options?.abortSignal,
        timer: null,
        abortHandler: null,
      };

      request.timer = setTimeout(() => {
        this.removeFromQueue(id);
        this.metrics.timedOutRequests++;
        reject(new RateLimiterError(`Request timed out in queue after ${timeout}ms`, 'TIMEOUT'));
      }, timeout);

      if (options?.abortSignal) {
        request.abortHandler = () => {
          this.removeFromQueue(id);
          this.metrics.rejectedRequests++;
          reject(new RateLimiterError('Request aborted in queue', 'ABORTED'));
        };
        options.abortSignal.addEventListener('abort', request.abortHandler, { once: true });
      }

      this.insertByPriority(request as QueuedRequest);
      logger.debug(
        `[Rate Limiter] Queued ${priority} request ${id} (queue: ${this.queue.length}, active: ${this.activeCount})`
      );
      this.ensureStarted();
    });
  }

  private insertByPriority(request: QueuedRequest): void {
    const requestOrder = PRIORITY_ORDER[request.priority];
    let insertIndex = this.queue.length;
    for (let i = 0; i < this.queue.length; i++) {
      if (PRIORITY_ORDER[this.queue[i].priority] > requestOrder) {
        insertIndex = i;
        break;
      }
    }
    this.queue.splice(insertIndex, 0, request);
  }

  private processQueue(): void {
    let i = 0;
    while (i < this.queue.length && this.activeCount < this.config.maxConcurrent) {
      const request = this.queue[i];
      const bucket = this.buckets.get(request.priority);

      if (bucket && bucket.tryConsume()) {
        this.queue.splice(i, 1);
        this.cleanupRequest(request);
        this.runRequest(request.fn as () => Promise<unknown>, request.priority, request.timestamp)
          .then(request.resolve)
          .catch(request.reject);
      } else if (request.priority === 'critical' && this.activeCount < this.config.maxConcurrent - 1) {
        this.queue.splice(i, 1);
        this.cleanupRequest(request);
        this.runRequest(request.fn as () => Promise<unknown>, request.priority, request.timestamp)
          .then(request.resolve)
          .catch(request.reject);
      } else {
        i++;
      }
    }
  }

  private removeFromQueue(id: string): void {
    const index = this.queue.findIndex((r) => r.id === id);
    if (index !== -1) {
      const request = this.queue[index];
      this.cleanupRequest(request);
      this.queue.splice(index, 1);
    }
  }

  private cleanupRequest(request: QueuedRequest): void {
    if (request.timer) { clearTimeout(request.timer); request.timer = null; }
    if (request.abortHandler && request.abortSignal) {
      request.abortSignal.removeEventListener('abort', request.abortHandler);
      request.abortHandler = null;
    }
  }

  private dropLowestPriority(): boolean {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (PRIORITY_ORDER[this.queue[i].priority] >= PRIORITY_ORDER.low) {
        const request = this.queue[i];
        this.cleanupRequest(request);
        this.queue.splice(i, 1);
        this.metrics.queueDrops++;
        request.reject(new RateLimiterError('Request dropped due to queue overload', 'QUEUE_DROPPED'));
        logger.warn('[Rate Limiter] Dropped low-priority request due to queue overload');
        return true;
      }
    }
    return false;
  }

  private ensureStarted(): void {
    if (!this.started) this.start();
  }
}

// ---- Singleton ----

export const apiRateLimiter = new ApiRateLimiter();

// ---- Priority Mapping ----

export function inferPriority(method: string): RequestPriority {
  if (
    method.includes('sync_order') ||
    method.includes('merge_table') ||
    method.includes('unmerge_table') ||
    method.includes('open_shift') ||
    method.includes('close_shift') ||
    method.includes('create_payment') ||
    method.includes('submit_invoice') ||
    method.includes('cancel_invoice')
  ) return 'critical';

  if (
    method.includes('dashboard') ||
    method.includes('report') ||
    method.includes('analytics') ||
    method.includes('export') ||
    method.includes('profit_loss') ||
    method.includes('live_metrics')
  ) return 'low';

  return 'normal';
}
