import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useIdleReset } from './useIdleReset'

describe('useIdleReset', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('fires onIdle once after timeoutMs of no interaction', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleReset(onIdle, 1000))

    act(() => {
      vi.advanceTimersByTime(999)
    })
    expect(onIdle).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('resets the timer on pointerdown so onIdle does not fire early', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleReset(onIdle, 1000))

    act(() => {
      vi.advanceTimersByTime(700)
      window.dispatchEvent(new Event('pointerdown'))
      vi.advanceTimersByTime(700)
    })
    expect(onIdle).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('resets the timer on keydown so onIdle does not fire early', () => {
    const onIdle = vi.fn()
    renderHook(() => useIdleReset(onIdle, 1000))

    act(() => {
      vi.advanceTimersByTime(700)
      window.dispatchEvent(new Event('keydown'))
      vi.advanceTimersByTime(700)
    })
    expect(onIdle).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(onIdle).toHaveBeenCalledTimes(1)
  })

  it('always calls the latest onIdle callback even if it changes between renders', () => {
    const firstOnIdle = vi.fn()
    const secondOnIdle = vi.fn()
    const { rerender } = renderHook(({ cb }) => useIdleReset(cb, 1000), {
      initialProps: { cb: firstOnIdle },
    })

    rerender({ cb: secondOnIdle })

    act(() => {
      vi.advanceTimersByTime(1000)
    })

    expect(firstOnIdle).not.toHaveBeenCalled()
    expect(secondOnIdle).toHaveBeenCalledTimes(1)
  })

  it('clears the timer and removes listeners on unmount', () => {
    const onIdle = vi.fn()
    const removeSpy = vi.spyOn(window, 'removeEventListener')
    const { unmount } = renderHook(() => useIdleReset(onIdle, 1000))

    unmount()

    act(() => {
      vi.advanceTimersByTime(2000)
    })

    expect(onIdle).not.toHaveBeenCalled()
    expect(removeSpy).toHaveBeenCalledWith('pointerdown', expect.any(Function))
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })

  it('restarts with the new timeout when timeoutMs changes', () => {
    const onIdle = vi.fn()
    const { rerender } = renderHook(({ timeout }) => useIdleReset(onIdle, timeout), {
      initialProps: { timeout: 1000 },
    })

    rerender({ timeout: 5000 })

    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(onIdle).not.toHaveBeenCalled()

    act(() => {
      vi.advanceTimersByTime(4000)
    })
    expect(onIdle).toHaveBeenCalledTimes(1)
  })
})
