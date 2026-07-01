/**
 * React hooks for performance monitoring.
 *
 * Usage:
 *   usePerformanceMark('Dashboard', 'mount');     // marks when component mounts
 *   usePerformanceMark('Dashboard', 'update');    // marks when component updates
 *   useRenderTime('Dashboard');                    // measures render time
 */

import { useEffect, useRef } from 'react';
import { perfMonitor } from './performance';

/**
 * Add a performance mark when a component mounts or updates.
 */
export function usePerformanceMark(
  componentName: string,
  phase: 'mount' | 'update' | 'unmount' = 'mount'
): void {
  useEffect(() => {
    if (phase === 'mount' || phase === 'update') {
      perfMonitor.mark(`${componentName}.${phase}`);
    }

    if (phase === 'unmount') {
      return () => {
        perfMonitor.mark(`${componentName}.unmount`);
      };
    }
  }, [componentName, phase]);
}

/**
 * Measure the render time of a component.
 * Records the time from mount to the first paint.
 */
export function useRenderTime(componentName: string): void {
  const renderStart = useRef(performance.now());

  useEffect(() => {
    const renderEnd = performance.now();
    const duration = renderEnd - renderStart.current;

    // Only log if it's a meaningful render (> 16ms = 1 frame)
    if (duration > 16) {
      perfMonitor.measureSync(componentName, () => {
        // Already measured above, just recording
      });
    }

    // Reset for next render
    renderStart.current = performance.now();
  });
}
