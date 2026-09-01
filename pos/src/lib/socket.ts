import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

function getSocketEndpoint(hostUrl?: string): string {
  if (typeof window === 'undefined') return '';

  const siteName =
    (window as any).frappe?.boot?.sitename ||
    (window as any).site_name ||
    (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
      ? 'ury.localhost'
      : window.location.hostname);

  if (hostUrl) {
    return `${hostUrl}/${siteName}`;
  }

  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const currentPort = window.location.port;

  let baseOrigin = window.location.origin;

  // In Frappe development (bench start), webserver runs on port 8000 while Socket.IO server runs on port 9000
  if (currentPort === '8000' || (window as any).dev_server) {
    const socketioPort = (window as any).frappe?.boot?.socketio_port || '9000';
    baseOrigin = `${protocol}//${hostname}:${socketioPort}`;
  }

  return `${baseOrigin}/${siteName}`;
}

export function getFrappeSocket(hostUrl?: string): Socket {
  if (!socket) {
    const endpoint = getSocketEndpoint(hostUrl);

    socket = io(endpoint, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Frappe Realtime Socket] Connected successfully:', socket?.id, 'Endpoint:', endpoint);
    });

    socket.on('connect_error', (error) => {
      console.error('[Frappe Realtime Socket] Connection error:', error?.message || error);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Frappe Realtime Socket] Disconnected:', reason);
    });
  }
  return socket;
}
