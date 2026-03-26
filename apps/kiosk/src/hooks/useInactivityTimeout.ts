/**
 * Hook for managing inactivity timeout in kiosk mode
 * Resets to attract screen after 90 seconds of inactivity
 */

import { useEffect, useRef, useCallback } from 'react';

interface UseInactivityTimeoutOptions {
  timeoutMs?: number;
  warningMs?: number;
  onTimeout: () => void;
  onWarning?: (show: boolean) => void;
  enabled?: boolean;
}

const DEFAULT_TIMEOUT = 90 * 1000; // 90 seconds
const DEFAULT_WARNING = 10 * 1000; // Show warning 10 seconds before timeout

export function useInactivityTimeout({
  timeoutMs = DEFAULT_TIMEOUT,
  warningMs = DEFAULT_WARNING,
  onTimeout,
  onWarning,
  enabled = true,
}: UseInactivityTimeoutOptions) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const warningRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(Date.now());

  const clearTimers = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (warningRef.current) {
      clearTimeout(warningRef.current);
      warningRef.current = null;
    }
  }, []);

  const resetTimer = useCallback(() => {
    if (!enabled) return;

    clearTimers();
    startTimeRef.current = Date.now();

    // Set warning timer
    if (warningMs > 0 && onWarning) {
      warningRef.current = setTimeout(() => {
        onWarning(true);
      }, timeoutMs - warningMs);
    }

    // Set timeout timer
    timeoutRef.current = setTimeout(() => {
      onTimeout();
    }, timeoutMs);
  }, [enabled, timeoutMs, warningMs, onTimeout, onWarning, clearTimers]);

  // Setup activity listeners
  useEffect(() => {
    if (!enabled) {
      clearTimers();
      return;
    }

    const activityEvents = [
      'touchstart',
      'touchmove',
      'touchend',
      'mousedown',
      'mousemove',
      'keydown',
      'scroll',
    ];

    const handleActivity = () => {
      if (onWarning) {
        onWarning(false);
      }
      resetTimer();
    };

    // Add listeners
    activityEvents.forEach(event => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    // Start initial timer
    resetTimer();

    return () => {
      clearTimers();
      activityEvents.forEach(event => {
        window.removeEventListener(event, handleActivity);
      });
    };
  }, [enabled, resetTimer, clearTimers, onWarning]);

  return {
    resetTimer,
    clearTimers,
    getElapsedTime: () => Date.now() - startTimeRef.current,
  };
}

export default useInactivityTimeout;
