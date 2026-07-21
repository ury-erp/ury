import { io, type Socket } from "socket.io-client";

type RealtimeHandler<T = unknown> = (payload: T) => void;

declare global {
  interface Window {
    frappe?: {
      boot?: { socketio_port?: number };
    };
  }
}

let socket: Socket | null = null;

/**
 * Lazily connect to the Frappe realtime (socket.io) server.
 * The POS SPA has no frappe socket client of its own, so we own the
 * connection here: boot.socketio_port when available (dev benches),
 * otherwise same-origin (production reverse proxy forwards /socket.io).
 */
function getSocket(): Socket | null {
  if (socket) return socket;
  try {
    const port = window.frappe?.boot?.socketio_port;
    const url = port
      ? `${location.protocol}//${location.hostname}:${port}`
      : location.origin;
    socket = io(url, { withCredentials: true });
    return socket;
  } catch {
    return null;
  }
}

export function subscribeRealtimeEvent<T = unknown>(
  event: string,
  handler: RealtimeHandler<T>
) {
  const s = getSocket();
  if (!s) {
    return () => {};
  }

  const wrappedHandler: RealtimeHandler = (payload) => handler(payload as T);
  s.on(event, wrappedHandler);

  return () => {
    s.off(event, wrappedHandler);
  };
}
