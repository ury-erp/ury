/**
 * Performance monitoring hook for URY POS.
 *
 * Tracks API latency, event rates, connection quality, and rate limiter metrics.
 * Designed to feed data into PerformanceOverlay and PerformanceAlerts.
 *
 * Usage:
 *   const { latency, eventRate, connectionState, rateLimiter } = usePerformanceMonitor();
 */

import { useState, useEffect, useRef } from 'react';
import { apiRateLimiter, type RateLimiterMetrics } from '../lib/api-rate-limiter';
import { perfMonitor } from '../lib/performance';

// ---- Types ----

export type ConnectionState = 'connected' | 'degraded' | 'disconnected' | 'reconnecting';

export interface PerformanceMetrics {
  /** Average API latency in ms over the measurement window */
  latency: number | null;
  /** 95th percentile latency in ms */
  latencyP95: number | null;
  /** Events per minute (render + API calls) */
  eventRate: number;
  /** Current connection state */
  connectionState: ConnectionState;
  /** Time since last successful response in ms */
  timeSinceLastResponse: number | null;
  /** Rate limiter metrics */
  rateLimiter: RateLimiterMetrics;
  /** Whether the system is in a degraded state */
  isDegraded: boolean;
  /** Whether the system is in a critical state */
  isCritical: boolean;
}

export interface PerformanceMonitorOptions {
  /** How often to sample metrics in ms (default: 5000) */
  sampleInterval: number;
  /** Latency threshold for degraded state in ms (default: 500) */
  degradedLatencyMs: number;
  /** Latency threshold for critical state in ms (default: 2000) */
  criticalLatencyMs: number;
  /** Window size for latency calculations (default: 20 samples) */
  latencyWindowSize: number;
}

const DEFAULT_OPTIONS: PerformanceMonitorOptions = {
  sampleInterval: 5000,
  degradedLatencyMs: 500,
  criticalLatencyMs: 2000,
  latencyWindowSize: 20,
};

// ---- Hook ----

export function usePerformanceMonitor(
  options?: Partial<PerformanceMonitorOptions>
): PerformanceMetrics {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const [metrics, setMetrics] = useState<PerformanceMetrics>({
    latency: null,
    latencyP95: null,
    eventRate: 0,
    connectionState: 'connected',
    timeSinceLastResponse: null,
    rateLimiter: apiRateLimiter.getMetrics(),
    isDegraded: false,
    isCritical: false,
  });

  const latencySamples = useRef<number[]>([]);
  const eventTimestamps = useRef<number[]>([]);
  const lastResponseTime = useRef<number>(Date.now());

  // Main sampling loop
  useEffect(() => {
    const sample = () => {
      // Get API metrics from perfMonitor
      const apiMetrics = perfMonitor.getApiMetrics();
      const currentLatency = apiMetrics.avgDuration;

      // Update latency samples
      if (currentLatency > 0) {
        latencySamples.current.push(currentLatency);
        if (latencySamples.current.length > opts.latencyWindowSize) {
          latencySamples.current.shift();
        }
        lastResponseTime.current = Date.now();
      }

      // Calculate average latency
      const avgLatency =
        latencySamples.current.length > 0
          ? latencySamples.current.reduce((a, b) => a + b, 0) / latencySamples.current.length
          : null;

      // Calculate P95 latency
      const p95Latency = (() => {
        if (latencySamples.current.length < 3) return null;
        const sorted = [...latencySamples.current].sort((a, b) => a - b);
        const idx = Math.ceil(sorted.length * 0.95) - 1;
        return sorted[Math.max(0, idx)];
      })();

      // Calculate event rate (events per minute)
      const oneMinuteAgo = Date.now() - 60_000;
      const recentEvents = eventTimestamps.current.filter((t) => t > oneMinuteAgo);
      eventTimestamps.current = recentEvents;
      const eventRate = recentEvents.length;

      // Determine connection state
      const timeSinceLastResponse = Date.now() - lastResponseTime.current;
      let connectionState: ConnectionState = 'connected';
      if (avgLatency !== null && avgLatency > opts.criticalLatencyMs) {
        connectionState = 'disconnected';
      } else if (avgLatency !== null && avgLatency > opts.degradedLatencyMs) {
        connectionState = 'degraded';
      }

      // Get rate limiter metrics
      const rateLimiterMetrics = apiRateLimiter.getMetrics();

      const isCritical = connectionState === 'disconnected' || (avgLatency !== null && avgLatency > opts.criticalLatencyMs);
      const isDegraded = !isCritical && (connectionState === 'degraded' || (avgLatency !== null && avgLatency > opts.degradedLatencyMs));

      setMetrics({
        latency: avgLatency !== null ? Math.round(avgLatency) : null,
        latencyP95: p95Latency !== null ? Math.round(p95Latency) : null,
        eventRate,
        connectionState,
        timeSinceLastResponse: Math.round(timeSinceLastResponse),
        rateLimiter: rateLimiterMetrics,
        isDegraded,
        isCritical,
      });
    };

    sample();
    const interval = setInterval(sample, opts.sampleInterval);
    return () => clearInterval(interval);
  }, [opts.sampleInterval, opts.degradedLatencyMs, opts.criticalLatencyMs, opts.latencyWindowSize]);

  return metrics;
}

/**
 * Get a summary string for the current performance state.
 */
export function usePerformanceSummary(): string {
  const metrics = usePerformanceMonitor();

  if (metrics.isCritical) {
    return `CRITICAL: latency ${metrics.latency}ms, ${metrics.connectionState}`;
  }
  if (metrics.isDegraded) {
    return `DEGRADED: latency ${metrics.latency}ms, ${metrics.connectionState}`;
  }
  if (metrics.latency !== null) {
    return `OK: latency ${metrics.latency}ms, ${metrics.eventRate} events/min`;
  }
  return 'OK: no data yet';
}
