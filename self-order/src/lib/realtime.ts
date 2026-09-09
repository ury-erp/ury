import { useEffect, useRef } from 'react'
import { io, type Socket } from 'socket.io-client'

// Mirrors the connection pattern used by the frontend Pos app's
// `Pos/lib/realtime.ts` (itself mirroring the legacy Vue KDS app,
// mosaic/src/components/kot.vue): the socket.io server is namespaced per
// site, so we resolve the site name from the backend before connecting.
// self-order has no `frappe.boot` injected (it's a customer-facing SPA), so
// this cannot reuse `frontend/src/lib/realtimeClient.ts`'s boot-based
// site-name lookup either — it needs the same server round trip.
let socket: Socket | null = null
let socketPromise: Promise<Socket> | null = null

async function fetchSiteName(): Promise<string> {
  try {
    const response = await fetch('/api/method/ury.ury.api.ury_kot_display.get_site_name', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    })
    const data = await response.json()
    return data.message?.site_name ?? ''
  } catch (error) {
    console.error('Failed to fetch site name:', error)
    return ''
  }
}

async function createSocket(): Promise<Socket> {
  const site = await fetchSiteName()
  if (!site) {
    throw new Error('Site name is not set. Socket cannot be initialized.')
  }

  const host = window.location.hostname
  const port = window.location.port
  const protocol = window.location.protocol
  const url = port ? `${protocol}//${host}:${port}` : `${protocol}//${host}`
  const siteUrl = `${url}/${site}`

  const newSocket = io(siteUrl, { withCredentials: true })

  newSocket.on('connect_error', (err) => {
    console.error('Socket connection error:', err)
  })

  return newSocket
}

/**
 * Lazily creates and returns the singleton realtime socket connection.
 * Subsequent calls return the same in-flight/connected socket instance.
 */
export function getRealtimeSocket(): Promise<Socket> {
  if (socket) {
    return Promise.resolve(socket)
  }
  if (!socketPromise) {
    socketPromise = createSocket()
      .then((s) => {
        socket = s
        return s
      })
      .catch((error) => {
        socketPromise = null
        throw error
      })
  }
  return socketPromise
}

export interface MenuAvailabilityEventPayload {
  affected_items: string[]
  component_item: string
  branch: string
  department: string | null
}

/**
 * Subscribes to the "menu_availability_update_<branch>" realtime channel
 * (published by ury/ury/api/ury_bom_compiler.py's
 * `publish_component_stock_fanout`) for the lifetime of the mounted
 * component. Scoped per-branch: the channel name already filters to the
 * current branch, so callers only need to check `affected_items` against the
 * item(s) they render before triggering a `skipCache: true` refetch.
 *
 * Defensive by design: if the socket never connects, drops, or the subscribe
 * call rejects, this silently no-ops (logs and returns) rather than
 * throwing — menu tiles keep working without live updates.
 */
export function useMenuAvailabilityChannel(
  branch: string | undefined,
  onEvent: (payload: MenuAvailabilityEventPayload) => void,
): void {
  const onEventRef = useRef(onEvent)

  useEffect(() => {
    onEventRef.current = onEvent
  }, [onEvent])

  useEffect(() => {
    if (!branch) {
      return
    }

    const channelName = `menu_availability_update_${branch}`
    const handler = (payload: MenuAvailabilityEventPayload) => onEventRef.current(payload)
    let activeSocket: Socket | null = null
    let cancelled = false

    getRealtimeSocket()
      .then((s) => {
        if (cancelled) {
          return
        }
        activeSocket = s
        s.on(channelName, handler)
      })
      .catch((error) => {
        console.error('Failed to subscribe to menu availability channel:', error)
      })

    return () => {
      cancelled = true
      activeSocket?.off(channelName, handler)
    }
  }, [branch])
}
