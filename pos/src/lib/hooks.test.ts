import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { debounce, throttle, useDebounce } from './debounce';

// ─── debounce function ────────────────────────────────────────────

describe('debounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should delay function execution', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced();
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should only execute once for rapid calls', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced();
    debounced();
    debounced();
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should reset delay on each call', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced();
    vi.advanceTimersByTime(200);
    debounced();
    vi.advanceTimersByTime(200);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should support cancel()', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 300);
    debounced();
    debounced.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled();
  });

  it('should pass arguments to the original function', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('hello', 'world');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledWith('hello', 'world');
  });

  it('should use the latest arguments', () => {
    const fn = vi.fn();
    const debounced = debounce(fn, 100);
    debounced('first');
    debounced('second');
    vi.advanceTimersByTime(100);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith('second');
  });
});

// ─── throttle function ────────────────────────────────────────────

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should execute immediately on first call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 300);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should not execute again within the limit', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 300);
    throttled();
    throttled();
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should execute again after the limit passes', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 300);
    throttled();
    vi.advanceTimersByTime(300);
    throttled();
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should support cancel()', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 300);
    throttled();
    throttled();
    throttled.cancel();
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should queue trailing call within the limit', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 300);
    throttled('first');
    throttled('second');
    vi.advanceTimersByTime(300);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

// ─── useDebounce hook ─────────────────────────────────────────────

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('hello', 300));
    expect(result.current).toBe('hello');
  });

  it('should delay value update', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 300 } }
    );
    expect(result.current).toBe('hello');
    rerender({ value: 'world', delay: 300 });
    expect(result.current).toBe('hello');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(result.current).toBe('world');
  });

  it('should reset timer on rapid value changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    );
    rerender({ value: 'b', delay: 300 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    rerender({ value: 'c', delay: 300 });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe('a');
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('c');
  });

  it('should work with number values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 0, delay: 100 } }
    );
    rerender({ value: 42, delay: 100 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(42);
  });

  it('should work with object values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: { name: 'a' }, delay: 100 } }
    );
    rerender({ value: { name: 'b' }, delay: 100 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toEqual({ name: 'b' });
  });

  it('should handle delay changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    );
    rerender({ value: 'b', delay: 100 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('b');
  });

  it('should clean up timer on unmount', () => {
    const { rerender, unmount } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'a', delay: 300 } }
    );
    rerender({ value: 'b', delay: 300 });
    unmount();
    // Should not cause any issues after unmount
    act(() => {
      vi.advanceTimersByTime(500);
    });
  });

  it('should debounce null values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello' as string | null, delay: 100 } }
    );
    rerender({ value: null, delay: 100 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBeNull();
  });

  it('should debounce boolean values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: false, delay: 100 } }
    );
    rerender({ value: true, delay: 100 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe(true);
  });

  it('should update immediately for initial render', () => {
    const { result } = renderHook(() => useDebounce('initial', 500));
    expect(result.current).toBe('initial');
  });

  it('should handle empty string values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'hello', delay: 100 } }
    );
    rerender({ value: '', delay: 100 });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(result.current).toBe('');
  });
});
