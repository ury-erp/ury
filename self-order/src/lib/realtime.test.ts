import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// socket.io-client is mocked per Phase 3's instruction: unit tests cover
// this module's own connect/subscribe/cleanup logic, not real socket
// behavior (deferred to the Phase 5 e2e layer against a live bench).
const ioMock = vi.fn()

vi.mock('socket.io-client', () => ({
  io: (...args: any[]) => ioMock(...args),
}))

function buildFakeSocket() {
  const listeners: Record<string, ((...args: any[]) => void)[]> = {}
  return {
    on: vi.fn((event: string, handler: (...args: any[]) => void) => {
      listeners[event] = listeners[event] ?? []
      listeners[event].push(handler)
    }),
    off: vi.fn((event: string, handler: (...args: any[]) => void) => {
      listeners[event] = (listeners[event] ?? []).filter((h) => h !== handler)
    }),
    emit(event: string, payload: unknown) {
      for (const handler of listeners[event] ?? []) handler(payload)
    },
  }
}

describe('self-order realtime socket', () => {
  beforeEach(() => {
    vi.resetModules()
    ioMock.mockReset()
    ioMock.mockReturnValue(buildFakeSocket())
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ message: { site_name: 'ury.local' } }),
      }),
    )
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('fetches the site name, then connects socket.io against the site-scoped URL', async () => {
    const { getRealtimeSocket } = await import('./realtime')
    const socket = await getRealtimeSocket()

    expect(fetch).toHaveBeenCalledWith(
      '/api/method/ury.ury.api.ury_kot_display.get_site_name',
      expect.objectContaining({ method: 'GET' }),
    )
    expect(ioMock).toHaveBeenCalledTimes(1)
    const [siteUrl, options] = ioMock.mock.calls[0]
    expect(siteUrl).toContain('/ury.local')
    expect(options).toEqual({ withCredentials: true })
    expect(socket).toBeTruthy()
  })

  it('returns the same singleton socket on repeated calls without reconnecting', async () => {
    const { getRealtimeSocket } = await import('./realtime')
    const first = await getRealtimeSocket()
    const second = await getRealtimeSocket()

    expect(first).toBe(second)
    expect(ioMock).toHaveBeenCalledTimes(1)
  })

  it('rejects and does not cache a broken connection when the site name lookup fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ message: {} }),
      }),
    )
    const { getRealtimeSocket } = await import('./realtime')

    await expect(getRealtimeSocket()).rejects.toThrow('Site name is not set')
    expect(ioMock).not.toHaveBeenCalled()

    // A subsequent call must retry (not stay permanently poisoned by the
    // first failed attempt) once the underlying fetch starts succeeding.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        json: () => Promise.resolve({ message: { site_name: 'ury.local' } }),
      }),
    )
    const socket = await getRealtimeSocket()
    expect(socket).toBeTruthy()
    expect(ioMock).toHaveBeenCalledTimes(1)
  })

  it('swallows a fetch() rejection and treats it as an empty site name, still throwing the same connect error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))
    const { getRealtimeSocket } = await import('./realtime')

    await expect(getRealtimeSocket()).rejects.toThrow('Site name is not set')
  })

  describe('useMenuAvailabilityChannel', () => {
    it('subscribes to the branch-scoped channel and forwards events to the latest onEvent callback', async () => {
      const { useMenuAvailabilityChannel } = await import('./realtime')
      const fakeSocket = buildFakeSocket()
      ioMock.mockReturnValue(fakeSocket)

      const onEvent = vi.fn()
      renderHook(({ handler }) => useMenuAvailabilityChannel('Kozhikode', handler), {
        initialProps: { handler: onEvent },
      })

      await waitFor(() => expect(fakeSocket.on).toHaveBeenCalledWith('menu_availability_update_Kozhikode', expect.any(Function)))

      const payload = {
        affected_items: ['COFFEE'],
        component_item: 'MILK',
        branch: 'Kozhikode',
        department: null,
      }
      fakeSocket.emit('menu_availability_update_Kozhikode', payload)
      expect(onEvent).toHaveBeenCalledWith(payload)
    })

    it('does nothing when branch is undefined', async () => {
      const { useMenuAvailabilityChannel } = await import('./realtime')
      const onEvent = vi.fn()

      renderHook(() => useMenuAvailabilityChannel(undefined, onEvent))

      expect(ioMock).not.toHaveBeenCalled()
    })

    it('unsubscribes the exact handler on unmount', async () => {
      const { useMenuAvailabilityChannel } = await import('./realtime')
      const fakeSocket = buildFakeSocket()
      ioMock.mockReturnValue(fakeSocket)
      const onEvent = vi.fn()

      const view = renderHook(() => useMenuAvailabilityChannel('Kozhikode', onEvent))
      await waitFor(() => expect(fakeSocket.on).toHaveBeenCalled())

      view.unmount()
      await waitFor(() => expect(fakeSocket.off).toHaveBeenCalledWith('menu_availability_update_Kozhikode', expect.any(Function)))
    })

    it('silently swallows a subscribe failure instead of throwing', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('down')))
      const { useMenuAvailabilityChannel } = await import('./realtime')
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      expect(() => renderHook(() => useMenuAvailabilityChannel('Kozhikode', vi.fn()))).not.toThrow()
      await waitFor(() =>
        expect(consoleSpy).toHaveBeenCalledWith('Failed to subscribe to menu availability channel:', expect.any(Error)),
      )
      consoleSpy.mockRestore()
    })
  })
})
