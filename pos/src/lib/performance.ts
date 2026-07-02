/**
 * Performance monitoring utility for URY POS.
 *
 * Tracks:
 * - Component render times
 * - API call durations
 * - Custom performance markers
 * - Memory usage (when available)
 *
 * All metrics are logged via the logger and can be
 * exported for analysis via getMetrics().
 *
 * In production, only slow operations (>threshold) are logged.
 * In development, all operations are tracked.
 */

import { logger } from './logger';

interface PerformanceEntry {
  name: string;
  startTime: number;
  endTime: number;
  duration: number;
  type: 'render' | 'api' | 'custom';
  metadata?: Record<string, unknown>;
}

interface ApiMetrics {
  totalCalls: number;
  avgDuration: number;
  maxDuration: number;
  minDuration: number;
  failureCount: number;
}

class PerformanceMonitor {
  private entries: PerformanceEntry[] = [];
  private activeTimers = new Map<string, number>();
  private maxEntries = 500;
  private slowThreshold: number;

  /** Threshold in ms — operations slower than this are always logged */
  constructor(slowThreshold = 1000) {
    this.slowThreshold = slowThreshold;
  }

  /**
   * Start a performance timer.
   * Returns the timer ID for stopping.
   */
  startTimer(name: string, type: PerformanceEntry['type'] = 'custom'): string {
    const id = `${type}:${name}:${Date.now()}`;
    this.activeTimers.set(id, performance.now());
    return id;
  }

  /**
   * Stop a performance timer and record the entry.
   */
  stopTimer(id: string, metadata?: Record<string, unknown>): number | null {
    const startTime = this.activeTimers.get(id);
    if (startTime === undefined) {
      logger.warn(`[Perf] Timer not found: ${id}`);
      return null;
    }

    this.activeTimers.delete(id);
    const endTime = performance.now();
    const duration = endTime - startTime;

    // ID format: "type:name:timestamp" — extract type and name
    const parts = id.split(':');
    const type = parts[0];
    // Name is everything between first and last colon (in case name contains colons)
    const name = parts.slice(1, -1).join(':');

    const entry: PerformanceEntry = {
      name,
      startTime,
      endTime,
      duration,
      type: type as PerformanceEntry['type'],
      metadata,
    };

    this.addEntry(entry);

    // Log slow operations in all environments
    if (duration > this.slowThreshold) {
      logger.warn(`[Perf SLOW] ${type}/${name}: ${duration.toFixed(1)}ms`, metadata);
    } else {
      logger.debug(`[Perf] ${type}/${name}: ${duration.toFixed(1)}ms`);
    }

    return duration;
  }

  /**
   * Measure an async operation (e.g., API call).
   */
  async measure<T>(
    name: string,
    fn: () => Promise<T>,
    type: PerformanceEntry['type'] = 'api',
    metadata?: Record<string, unknown>
  ): Promise<T> {
    const id = this.startTimer(name, type);
    try {
      const result = await fn();
      this.stopTimer(id, { ...metadata, success: true });
      return result;
    } catch (error) {
      this.stopTimer(id, { ...metadata, success: false });
      throw error;
    }
  }

  /**
   * Measure a sync operation (e.g., render).
   */
  measureSync<T>(
    name: string,
    fn: () => T,
    type: PerformanceEntry['type'] = 'render'
  ): T {
    const id = this.startTimer(name, type);
    try {
      const result = fn();
      this.stopTimer(id);
      return result;
    } catch (error) {
      this.stopTimer(id, { error: true });
      throw error;
    }
  }

  /**
   * Add a performance marker at the current time.
   */
  mark(name: string, metadata?: Record<string, unknown>): void {
    const now = performance.now();
    const entry: PerformanceEntry = {
      name,
      startTime: now,
      endTime: now,
      duration: 0,
      type: 'custom',
      metadata,
    };
    this.addEntry(entry);
    logger.debug(`[Perf MARK] ${name}`);
  }

  /**
   * Get API-specific metrics for a given endpoint or all endpoints.
   */
  getApiMetrics(endpointName?: string): ApiMetrics {
    const apiEntries = this.entries.filter(
      (e) => e.type === 'api' && (!endpointName || e.name === endpointName)
    );

    if (apiEntries.length === 0) {
      return { totalCalls: 0, avgDuration: 0, maxDuration: 0, minDuration: 0, failureCount: 0 };
    }

    const durations = apiEntries.map((e) => e.duration);
    const failures = apiEntries.filter((e) => e.metadata?.success === false).length;

    return {
      totalCalls: apiEntries.length,
      avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
      maxDuration: Math.max(...durations),
      minDuration: Math.min(...durations),
      failureCount: failures,
    };
  }

  /**
   * Get all recorded entries (optionally filtered by type).
   */
  getEntries(type?: PerformanceEntry['type']): PerformanceEntry[] {
    if (type) return this.entries.filter((e) => e.type === type);
    return [...this.entries];
  }

  /**
   * Get slow operations (above threshold).
   */
  getSlowOperations(): PerformanceEntry[] {
    return this.entries.filter((e) => e.duration > this.slowThreshold);
  }

  /**
   * Get a summary of all metrics.
   */
  getSummary(): {
    totalEntries: number;
    apiMetrics: ApiMetrics;
    renderMetrics: { count: number; avgDuration: number };
    slowOperations: number;
    memoryUsage: NodeJS.MemoryUsage | null;
  } {
    const renderEntries = this.entries.filter((e) => e.type === 'render');
    const renderDurations = renderEntries.map((e) => e.duration);

    let memoryUsage: NodeJS.MemoryUsage | null = null;
    if (typeof performance !== 'undefined' && 'memory' in performance) {
      const mem = (performance as unknown as { memory: NodeJS.MemoryUsage }).memory;
      memoryUsage = mem;
    }

    return {
      totalEntries: this.entries.length,
      apiMetrics: this.getApiMetrics(),
      renderMetrics: {
        count: renderEntries.length,
        avgDuration: renderDurations.length > 0
          ? renderDurations.reduce((a, b) => a + b, 0) / renderDurations.length
          : 0,
      },
      slowOperations: this.getSlowOperations().length,
      memoryUsage,
    };
  }

  /**
   * Clear all recorded entries.
   */
  clear(): void {
    this.entries = [];
    this.activeTimers.clear();
  }

  private addEntry(entry: PerformanceEntry): void {
    this.entries.push(entry);
    // Keep only the last maxEntries
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }
}

/** Singleton performance monitor instance */
export const perfMonitor = new PerformanceMonitor();
