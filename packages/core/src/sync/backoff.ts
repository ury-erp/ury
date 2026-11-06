/**
 * @file backoff.ts
 * @description Exponential Backoff Retry Delay Calculator.
 */

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
  maxAttempts?: number;
  jitter?: boolean;
}

/**
 * Calculates exponential backoff delay in milliseconds.
 * Formula: Math.min(maxMs, baseMs * 2^(attempts - 1)) [+ jitter]
 */
export function calculateBackoffDelay(
  attempts: number,
  options?: BackoffOptions
): number {
  const baseMs = options?.baseMs ?? 1000;
  const maxMs = options?.maxMs ?? 30000;
  const useJitter = options?.jitter ?? true;

  if (attempts <= 0) return 0;

  // Exponential growth
  const expDelay = baseMs * Math.pow(2, attempts - 1);
  let delay = Math.min(maxMs, expDelay);

  // Optional jitter (±20%) to prevent thundering herd problem
  if (useJitter) {
    const jitterFactor = 0.8 + Math.random() * 0.4;
    delay = Math.floor(delay * jitterFactor);
  }

  return delay;
}

/**
 * Check if max attempts limit reached
 */
export function isMaxAttemptsReached(
  attempts: number,
  maxAttempts = 5
): boolean {
  return attempts >= maxAttempts;
}
