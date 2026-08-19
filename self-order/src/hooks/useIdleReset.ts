import { useEffect, useRef } from 'react'

/**
 * Fires `onIdle` once after `timeoutMs` of no user interaction
 * (pointerdown/keydown). Generic and dependency-free — it knows nothing
 * about cart/session state; the caller is responsible for clearing that
 * state and navigating back to an idle screen when `onIdle` fires.
 */
export function useIdleReset(onIdle: () => void, timeoutMs = 90000) {
  const onIdleRef = useRef(onIdle)
  onIdleRef.current = onIdle

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>

    function reset() {
      clearTimeout(timer)
      timer = setTimeout(() => onIdleRef.current(), timeoutMs)
    }

    reset()
    window.addEventListener('pointerdown', reset)
    window.addEventListener('keydown', reset)

    return () => {
      clearTimeout(timer)
      window.removeEventListener('pointerdown', reset)
      window.removeEventListener('keydown', reset)
    }
  }, [timeoutMs])
}
