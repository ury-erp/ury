import { io, type Socket } from 'socket.io-client'

// Mirrors the connection pattern used by the POS app
// (pos/src/lib/realtime.ts): the socket.io server is namespaced per site,
// so we resolve the site name from the backend before connecting.
let socket: Socket | null = null
let socketPromise: Promise<Socket> | null = null
let globalSiteName = ''

async function fetchSiteName(): Promise<string> {
  try {
    const response = await fetch(
      '/api/method/ury.ury.api.ury_kot_display.get_site_name',
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    )
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

  globalSiteName = site
  const newSocket = io(siteUrl, { withCredentials: true })

  newSocket.on('connect_error', (err) => {
    console.error('Socket connection error:', err)
  })
  newSocket.on('connect', () => {
    console.log('Socket connected:', newSocket.connected)
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

export function getGlobalSiteName(): string {
  return globalSiteName
}
