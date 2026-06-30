/**
 * Centralized logger for URY POS.
 *
 * Replaces direct console.* calls with a configurable logger that supports
 * log levels and can be silenced in production.
 *
 * Usage:
 *   import { logger } from '../lib/logger';
 *   logger.error('Failed to fetch menu:', error);
 *   logger.warn('Deprecated API call');
 *   logger.info('Order submitted', { orderId: '123' });
 *   logger.debug('Cart updated', cart);
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function getMinLevel(): LogLevel {
  // In production, only show warnings and errors
  if (import.meta.env.PROD) return 'warn';
  // In development, show everything
  return 'debug';
}

class Logger {
  private minLevel: LogLevel;

  constructor() {
    this.minLevel = getMinLevel();
  }

  setLevel(level: LogLevel): void {
    this.minLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[this.minLevel];
  }

  debug(message: string, ...data: unknown[]): void {
    if (this.shouldLog('debug')) {
      console.log(`[URY DEBUG] ${message}`, ...data);
    }
  }

  info(message: string, ...data: unknown[]): void {
    if (this.shouldLog('info')) {
      console.info(`[URY INFO] ${message}`, ...data);
    }
  }

  warn(message: string, ...data: unknown[]): void {
    if (this.shouldLog('warn')) {
      console.warn(`[URY WARN] ${message}`, ...data);
    }
  }

  error(message: string, ...data: unknown[]): void {
    if (this.shouldLog('error')) {
      console.error(`[URY ERROR] ${message}`, ...data);
    }
  }
}

export const logger = new Logger();
