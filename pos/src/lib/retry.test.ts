import { describe, it, expect, vi } from 'vitest';
import { withRetry, createRetry } from '../lib/retry';

describe('withRetry', () => {
  it('should return the result on first successful call', async () => {
    const fn = vi.fn().mockResolvedValue('success');
    const result = await withRetry(fn, { maxRetries: 3, initialDelay: 10 });
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed on subsequent attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelay: 10,
      backoffMultiplier: 1,
      maxDelay: 50,
    });

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should throw after max retries are exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('persistent failure'));

    await expect(
      withRetry(fn, {
        maxRetries: 2,
        initialDelay: 10,
        backoffMultiplier: 1,
        maxDelay: 50,
      })
    ).rejects.toThrow('persistent failure');

    expect(fn).toHaveBeenCalledTimes(3); // 1 initial + 2 retries
  });

  it('should not retry non-retryable errors', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('not retryable'));
    const isRetryable = (err: unknown) =>
      (err as Error).message !== 'not retryable';

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,
        isRetryable,
      })
    ).rejects.toThrow('not retryable');

    expect(fn).toHaveBeenCalledTimes(1); // No retries
  });

  it('should call onRetry callback before each retry', async () => {
    const onRetry = vi.fn();
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockRejectedValueOnce(new Error('fail again'))
      .mockResolvedValueOnce('success');

    const result = await withRetry(fn, {
      maxRetries: 3,
      initialDelay: 10,
      backoffMultiplier: 1,
      maxDelay: 50,
      onRetry,
    });

    expect(result).toBe('success');
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry).toHaveBeenCalledWith(1, expect.any(Error));
    expect(onRetry).toHaveBeenCalledWith(2, expect.any(Error));
  });

  it('should handle network errors as retryable by default', async () => {
    const networkError = new Error('Network Error');
    const fn = vi.fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, {
      maxRetries: 2,
      initialDelay: 10,
      maxDelay: 50,
    });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should not retry 4xx client errors by default', async () => {
    const clientError = Object.assign(new Error('Not Found'), {
      httpStatus: 404,
    });
    const fn = vi.fn().mockRejectedValue(clientError);

    await expect(
      withRetry(fn, {
        maxRetries: 3,
        initialDelay: 10,
      })
    ).rejects.toThrow('Not Found');

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry 5xx server errors by default', async () => {
    const serverError = Object.assign(new Error('Internal Server Error'), {
      httpStatus: 500,
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, {
      maxRetries: 2,
      initialDelay: 10,
      maxDelay: 50,
    });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should retry timeout errors by default', async () => {
    const timeoutError = Object.assign(new Error('timeout'), {
      code: 'ECONNABORTED',
    });
    const fn = vi.fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce('recovered');

    const result = await withRetry(fn, {
      maxRetries: 2,
      initialDelay: 10,
      maxDelay: 50,
    });

    expect(result).toBe('recovered');
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe('createRetry', () => {
  it('should create a retry wrapper with default options', async () => {
    const retry = createRetry({ maxRetries: 1, initialDelay: 10 });
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('success');

    const result = await retry(fn);
    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should allow overriding defaults per call', async () => {
    const retry = createRetry({ maxRetries: 1, initialDelay: 10 });
    const fn = vi.fn().mockRejectedValue(new Error('always fails'));

    await expect(retry(fn, { maxRetries: 2 })).rejects.toThrow('always fails');
    // 1 initial + 2 retries = 3
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
