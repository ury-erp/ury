/**
 * PerformanceAlerts — Null-rendering component that fires toast notifications
 * when performance degrades or connection is lost.
 *
 * Handles:
 * - Critical latency (>2s): error toast
 * - Degraded latency (>500ms): warning toast
 * - Connection state changes: info toast on reconnection
 *
 * Includes throttling to avoid toast spam during persistent issues.
 *
 * Usage:
 *   <PerformanceAlerts />  // add to App root, renders null
 */

import { useRef, useEffect } from 'react';
import { usePerformanceMonitor, type ConnectionState } from '../hooks/use-performance-monitor';
import { showToast } from './ui/toast';
import { i18n } from '../i18n';

interface AlertState {
  lastCriticalAlert: number;
  lastDegradedAlert: number;
  lastReconnectAlert: number;
  prevConnectionState: ConnectionState;
  hasAlertedCritical: boolean;
}

const THROTTLE_CRITICAL_MS = 30_000; // 30s between critical alerts
const THROTTLE_DEGRADED_MS = 60_000; // 60s between degraded alerts
const THROTTLE_RECONNECT_MS = 30_000; // 30s between reconnect alerts

export default function PerformanceAlerts() {
  const metrics = usePerformanceMonitor();
  const alertState = useRef<AlertState>({
    lastCriticalAlert: 0,
    lastDegradedAlert: 0,
    lastReconnectAlert: 0,
    prevConnectionState: 'connected',
    hasAlertedCritical: false,
  });

  useEffect(() => {
    const now = Date.now();
    const state = alertState.current;

    // Critical latency alert
    if (metrics.isCritical && metrics.latency !== null) {
      if (now - state.lastCriticalAlert > THROTTLE_CRITICAL_MS) {
        state.lastCriticalAlert = now;
        state.hasAlertedCritical = true;
        showToast.error(
          i18n.t('performance.criticalLatency', 'Critical latency detected'),
          {
            duration: 5000,
            description: `${metrics.latency}ms`,
          }
        );
      }
      return; // Don't show degraded if critical
    }

    // Degraded latency alert (only if not critical)
    if (metrics.isDegraded && metrics.latency !== null && !metrics.isCritical) {
      if (now - state.lastDegradedAlert > THROTTLE_DEGRADED_MS) {
        state.lastDegradedAlert = now;
        showToast.warning(
          i18n.t('performance.degradedLatency', 'High latency detected'),
          {
            duration: 4000,
            description: `${metrics.latency}ms`,
          }
        );
      }
    }

    // Reset critical flag when recovered
    if (!metrics.isCritical && !metrics.isDegraded) {
      state.hasAlertedCritical = false;
    }

    // Connection state change: reconnected
    if (
      state.prevConnectionState !== 'connected' &&
      metrics.connectionState === 'connected'
    ) {
      if (now - state.lastReconnectAlert > THROTTLE_RECONNECT_MS) {
        state.lastReconnectAlert = now;
        showToast.info(
          i18n.t('performance.reconnected', 'Connection restored')
        );
      }
    }

    // Track connection state changes
    state.prevConnectionState = metrics.connectionState;
  }, [metrics]);

  return null;
}
