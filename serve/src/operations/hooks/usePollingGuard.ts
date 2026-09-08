import { useCallback, useEffect, useRef } from 'react'

type TickFn = (
  generation: number,
  isCurrent: (generation: number) => boolean
) => Promise<void>

/**
 * Interval poll with generation tokens so late responses cannot overwrite
 * newer state, and in-flight overlap is skipped when `skipIfBusy` is set.
 */
export function usePollingGuard(
  enabled: boolean,
  intervalMs: number,
  tick: TickFn,
  options?: { skipIfBusy?: boolean; runImmediately?: boolean }
) {
  const tickRef = useRef(tick)
  const busyRef = useRef(false)
  const generationRef = useRef(0)
  const skipIfBusy = options?.skipIfBusy ?? true
  const runImmediately = options?.runImmediately ?? true

  tickRef.current = tick

  const isCurrent = useCallback(
    (generation: number) => generation === generationRef.current,
    []
  )

  const run = useCallback(async () => {
    if (skipIfBusy && busyRef.current) return
    const generation = ++generationRef.current
    busyRef.current = true
    try {
      await tickRef.current(generation, isCurrent)
    } finally {
      if (generationRef.current === generation) {
        busyRef.current = false
      }
    }
  }, [skipIfBusy, isCurrent])

  useEffect(() => {
    if (!enabled) return

    let cancelled = false
    const safeRun = () => {
      if (!cancelled) void run()
    }

    if (runImmediately) safeRun()
    const id = window.setInterval(safeRun, intervalMs)

    return () => {
      cancelled = true
      generationRef.current += 1
      window.clearInterval(id)
      busyRef.current = false
    }
  }, [enabled, intervalMs, run, runImmediately])

  return {
    isCurrent,
    refresh: run,
  }
}
