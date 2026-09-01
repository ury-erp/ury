import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

function getSiteName(): string {
  if (typeof window === 'undefined') return '';
  const bootSite = (window as any).frappe?.boot?.sitename || (window as any).site_name;
  if (bootSite) return bootSite;
  const hostname = window.location.hostname;
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return 'ury.localhost';
  }
  return hostname;
}

export function getFrappeSocket(hostUrl?: string): Socket {
  if (!socket) {
    const origin = hostUrl || import.meta.env?.VITE_FRAPPE_BASE_URL || window.location.origin;
    const siteName = getSiteName();
    const namespaceUrl = siteName ? `${origin}/${siteName}` : origin;

    socket = io(namespaceUrl, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Frappe Realtime Socket] Connected:', socket?.id, 'Namespace:', namespaceUrl);
    });

    socket.on('connect_error', (error) => {
      console.error('[Frappe Realtime Socket] Connection error:', error);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Frappe Realtime Socket] Disconnected:', reason);
    });
  }
  return socket;
}
