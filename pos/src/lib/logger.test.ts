import { describe, it, expect, vi, beforeEach } from 'vitest';
import { logger } from './logger';

describe('Logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    logger.setLevel('debug'); // Reset to show all logs for testing
  });

  it('should log debug messages when level is debug', () => {
    const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logger.debug('test debug', { key: 'value' });
    expect(consoleSpy).toHaveBeenCalledWith('[URY DEBUG] test debug', { key: 'value' });
  });

  it('should log info messages when level is debug', () => {
    const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    logger.info('test info');
    expect(consoleSpy).toHaveBeenCalledWith('[URY INFO] test info');
  });

  it('should log warn messages when level is debug', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('test warning');
    expect(consoleSpy).toHaveBeenCalledWith('[URY WARN] test warning');
  });

  it('should log error messages when level is debug', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    logger.error('test error', new Error('fail'));
    expect(consoleSpy).toHaveBeenCalledWith('[URY ERROR] test error', expect.any(Error));
  });

  it('should suppress debug and info when level is warn', () => {
    logger.setLevel('warn');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.debug('should not appear');
    logger.info('should not appear');
    logger.warn('should appear');
    logger.error('should also appear');

    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('should suppress all logs when level is silent', () => {
    logger.setLevel('silent');
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    logger.debug('nope');
    logger.info('nope');
    logger.warn('nope');
    logger.error('nope');

    expect(logSpy).not.toHaveBeenCalled();
    expect(infoSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('should allow changing log level dynamically', () => {
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

    logger.setLevel('silent');
    logger.debug('hidden');

    logger.setLevel('debug');
    logger.debug('visible');

    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[URY DEBUG] visible');
  });

  it('should pass multiple data arguments to console methods', () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('multi arg', 1, { a: 'b' }, [1, 2]);
    expect(consoleSpy).toHaveBeenCalledWith('[URY WARN] multi arg', 1, { a: 'b' }, [1, 2]);
  });
});
