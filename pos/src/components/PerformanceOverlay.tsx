/**
 * PerformanceOverlay — Dev-only floating widget showing real-time system metrics.
 *
 * Three states: collapsed (mini bar), expanded (full dashboard), hidden.
 * Draggable, shows latency, event rate, rate limiter stats, connection state.
 * Only renders in development mode.
 *
 * Usage:
 *   <PerformanceOverlay />  // add to App root, self-hides in production
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { usePerformanceMonitor, type ConnectionState } from '../hooks/use-performance-monitor';
import { Activity, X, ChevronUp, ChevronDown, Zap, Clock, Wifi, WifiOff, AlertTriangle } from 'lucide-react';
import { cn } from '../lib/utils';

type OverlayState = 'collapsed' | 'expanded' | 'hidden';

const STATUS_COLORS: Record<ConnectionState, string> = {
  connected: 'text-green-400',
  degraded: 'text-amber-400',
  disconnected: 'text-red-400',
  reconnecting: 'text-amber-400',
};

const STATUS_LABELS: Record<ConnectionState, string> = {
  connected: 'OK',
  degraded: 'DEGRADED',
  disconnected: 'DOWN',
  reconnecting: 'RECONNECT',
};

export default function PerformanceOverlay() {
  // Only render in development
  if (!import.meta.env.DEV) return null;

  return <PerformanceOverlayInner />;
}

function PerformanceOverlayInner() {
  const [state, setState] = useState<OverlayState>('collapsed');
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });

  const metrics = usePerformanceMonitor();

  // Drag handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    setIsDragging(true);
    dragOffset.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
  }, [position]);

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 100, e.clientX - dragOffset.current.x)),
        y: Math.max(0, Math.min(window.innerHeight - 50, e.clientY - dragOffset.current.y)),
      });
    };

    const handleMouseUp = () => setIsDragging(false);

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  if (state === 'hidden') {
    return (
      <button
        data-testid="perf-overlay-show"
        onClick={() => setState('collapsed')}
        className="fixed bottom-4 right-4 z-[9999] bg-gray-800/80 text-gray-400 p-2 rounded-full hover:bg-gray-700/80 transition-colors"
        title="Show Performance Monitor"
      >
        <Activity className="w-4 h-4" />
      </button>
    );
  }

  const statusColor = STATUS_COLORS[metrics.connectionState];
  const statusLabel = STATUS_LABELS[metrics.connectionState];

  if (state === 'collapsed') {
    return (
      <div
        data-testid="perf-overlay-collapsed"
        onMouseDown={handleMouseDown}
        onClick={() => setState('expanded')}
        className={cn(
          'fixed z-[9999] flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer',
          'bg-gray-900/90 border border-gray-700/50 text-xs font-mono backdrop-blur-sm',
          isDragging && 'cursor-grabbing',
          metrics.isCritical ? 'border-red-500/50' : metrics.isDegraded ? 'border-amber-500/50' : 'border-gray-700/50'
        )}
        style={{ left: position.x, top: position.y }}
      >
        <Activity className={cn('w-3.5 h-3.5', statusColor)} />
        <span className={statusColor}>{statusLabel}</span>
        {metrics.latency !== null && (
          <span className="text-gray-400">{metrics.latency}ms</span>
        )}
        <span className="text-gray-500">{metrics.eventRate}/m</span>
        <button
          data-testid="perf-overlay-close"
          onClick={(e) => { e.stopPropagation(); setState('hidden'); }}
          className="ml-1 text-gray-500 hover:text-gray-300"
        >
          <X className="w-3 h-3" />
        </button>
      </div>
    );
  }

  // Expanded state
  return (
    <div
      data-testid="perf-overlay-expanded"
      onMouseDown={handleMouseDown}
      className={cn(
        'fixed z-[9999] w-72 rounded-lg overflow-hidden',
        'bg-gray-900/95 border border-gray-700/50 text-xs font-mono backdrop-blur-sm',
        isDragging && 'cursor-grabbing',
        metrics.isCritical ? 'border-red-500/50' : metrics.isDegraded ? 'border-amber-500/50' : ''
      )}
      style={{ left: position.x, top: position.y }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800/50 border-b border-gray-700/50">
        <div className="flex items-center gap-2">
          <Activity className={cn('w-4 h-4', statusColor)} />
          <span className="text-gray-200 font-semibold">Performance</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            data-testid="perf-overlay-collapse"
            onClick={() => setState('collapsed')}
            className="text-gray-400 hover:text-gray-200 p-0.5"
          >
            <ChevronUp className="w-3.5 h-3.5" />
          </button>
          <button
            data-testid="perf-overlay-close-expanded"
            onClick={() => setState('hidden')}
            className="text-gray-400 hover:text-gray-200 p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="px-3 py-2 space-y-2">
        {/* Connection */}
        <div className="flex items-center justify-between">
          <span className="text-gray-400 flex items-center gap-1.5">
            {metrics.connectionState === 'disconnected' ? <WifiOff className="w-3 h-3" /> : <Wifi className="w-3 h-3" />}
            Connection
          </span>
          <span className={statusColor}>{statusLabel}</span>
        </div>

        {/* Latency */}
        <div className="flex items-center justify-between">
          <span className="text-gray-400 flex items-center gap-1.5">
            <Clock className="w-3 h-3" />
            Latency
          </span>
          <span className={metrics.latency !== null ? 'text-gray-200' : 'text-gray-500'}>
            {metrics.latency !== null ? `${metrics.latency}ms` : '—'}
          </span>
        </div>

        {/* P95 Latency */}
        <div className="flex items-center justify-between">
          <span className="text-gray-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3 h-3" />
            P95
          </span>
          <span className={metrics.latencyP95 !== null ? 'text-gray-200' : 'text-gray-500'}>
            {metrics.latencyP95 !== null ? `${metrics.latencyP95}ms` : '—'}
          </span>
        </div>

        {/* Event Rate */}
        <div className="flex items-center justify-between">
          <span className="text-gray-400 flex items-center gap-1.5">
            <Zap className="w-3 h-3" />
            Events
          </span>
          <span className="text-gray-200">{metrics.eventRate}/min</span>
        </div>

        {/* Rate Limiter */}
        <div className="pt-1 border-t border-gray-700/50">
          <div className="text-gray-500 mb-1">Rate Limiter</div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Active</span>
            <span className="text-gray-200">{metrics.rateLimiter.activeRequests}/{metrics.rateLimiter.activeRequests > 0 ? '6' : '0'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Queued</span>
            <span className={metrics.rateLimiter.queuedRequests > 0 ? 'text-amber-400' : 'text-gray-200'}>
              {metrics.rateLimiter.queuedRequests}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-gray-400">Completed</span>
            <span className="text-gray-200">{metrics.rateLimiter.completedRequests}</span>
          </div>
          {metrics.rateLimiter.isOverloaded && (
            <div className="text-red-400 mt-1">⚠ Queue overloaded</div>
          )}
        </div>
      </div>
    </div>
  );
}
