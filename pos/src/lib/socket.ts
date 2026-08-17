import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getFrappeSocket(hostUrl?: string): Socket {
  if (!socket) {
    const url = hostUrl || import.meta.env?.VITE_FRAPPE_BASE_URL || window.location.origin;
    socket = io(url, {
      withCredentials: true,
      transports: ['websocket', 'polling'],
      path: '/socket.io',
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
    });

    socket.on('connect', () => {
      console.log('[Frappe Realtime Socket] Connected:', socket?.id);
    });

    socket.on('disconnect', (reason) => {
      console.warn('[Frappe Realtime Socket] Disconnected:', reason);
    });
  }
  return socket;
}
