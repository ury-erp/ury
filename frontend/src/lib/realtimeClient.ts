/**
 * Frappe realtime client for the URY frontend SPA.
 *
 * The /ury SPA is a standalone Vite bundle that does NOT load Frappe's own
 * socketio_client.js, so `window.frappe.realtime` is never initialised here.
 * Instead we create a Socket.IO connection directly to the Frappe realtime
 * server, mirroring Frappe desk's get_host() (including the dedicated
 * socketio_port used by `bench start`).
 *
 * The site name is taken from `frappe.boot.sitename` which is injected into
 * index.html at request time:
 *   frappe.boot = JSON.parse({{ boot }});
 */

import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;
let connectPromise: Promise<Socket> | null = null;

function getBoot(): Record<string, any> {
  try {
    return (window as any).frappe?.boot ?? {};
  } catch {
    return {};
  }
}

function getSiteName(): string {
  return getBoot().sitename ?? '';
}

/**
 * Same rules as frappe/public/js/frappe/socketio_client.js get_host():
 * on the dev server, socket.io listens on boot.socketio_port (usually 9000),
 * not on the web port.
 */
function buildSocketUrl(): string {
  const boot = getBoot();
  const siteName = getSiteName();
  const { protocol, hostname } = window.location;
  const devServer = Boolean((window as any).dev_server);
  const socketioPort = boot.socketio_port;

  let host = `${protocol}//${hostname}`;
  if (devServer && socketioPort) {
    host = `${protocol}//${hostname}:${socketioPort}`;
  } else if (window.location.port) {
    host = `${protocol}//${hostname}:${window.location.port}`;
  }

  return siteName ? `${host}/${siteName}` : host;
}

/**
 * Returns (and lazily creates) the singleton Socket.IO connection to the
 * Frappe realtime server.  The same socket instance is reused across the
 * entire SPA lifetime.
 */
export function getSetupSocket(): Promise<Socket> {
  if (socket?.connected) {
    return Promise.resolve(socket);
  }

  if (!connectPromise) {
    connectPromise = new Promise<Socket>((resolve, reject) => {
      const url = buildSocketUrl();
      const s = io(url, {
        withCredentials: true,
        reconnectionAttempts: 5,
        transports: ['websocket', 'polling'],
      });

      s.on('connect', () => {
        socket = s;
        resolve(s);
      });

      s.on('connect_error', (err) => {
        console.error('[URY realtime] Socket connect error:', err.message);
        connectPromise = null; // allow retry on next call
        reject(err);
      });

      // If no connect event in 10 s, reject so callers don't hang forever
      const timeout = setTimeout(() => {
        connectPromise = null;
        reject(new Error('[URY realtime] Socket connection timed out'));
      }, 10_000);

      s.once('connect', () => clearTimeout(timeout));
    });
  }

  return connectPromise;
}

/**
 * Subscribe to a single realtime event for the lifetime of a React component.
 *
 * Returns a cleanup function (pass to useEffect return).
 *
 * @param eventName    Frappe realtime event name
 * @param handler      Callback receiving the event payload
 * @param onSubscribed Optional callback fired once the listener is attached to
 *                     the live socket — use this to start the backend API call
 *                     so no events can be missed.
 */
export function subscribeRealtimeEvent(
  eventName: string,
  handler: (data: unknown) => void,
  onSubscribed?: () => void,
): () => void {
  let cancelled = false;
  let activeSocket: Socket | null = null;

  getSetupSocket()
    .then((s) => {
      if (cancelled) return;
      activeSocket = s;
      s.on(eventName, handler);
      onSubscribed?.();
    })
    .catch((err) => {
      console.error(`[URY realtime] Failed to subscribe to "${eventName}":`, err);
      // Even on socket error, call onSubscribed so the API call is not blocked
      // forever — the progress UI will stay static but setup still completes.
      if (!cancelled) onSubscribed?.();
    });

  return () => {
    cancelled = true;
    activeSocket?.off(eventName, handler);
  };
}
