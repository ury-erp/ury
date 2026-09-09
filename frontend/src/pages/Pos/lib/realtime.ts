import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';

// Mirrors the connection pattern used by the legacy Vue KDS app
// (mosaic/src/components/kot.vue): the socket.io server is namespaced per
// site, so we resolve the site name from the backend before connecting.
let socket: Socket | null = null;
let socketPromise: Promise<Socket> | null = null;
let globalSiteName = '';

async function fetchSiteName(): Promise<string> {
  try {
    const response = await fetch('/api/method/ury.ury.api.ury_kot_display.get_site_name', {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    const data = await response.json();
    return data.message?.site_name ?? '';
  } catch (error) {
    console.error('Failed to fetch site name:', error);
    return '';
  }
}

async function createSocket(): Promise<Socket> {
  const site = await fetchSiteName();
  if (!site) {
    throw new Error('Site name is not set. Socket cannot be initialized.');
  }

  const host = window.location.hostname;
  const port = window.location.port;
  const protocol = window.location.protocol;
  const url = port ? `${protocol}//${host}:${port}` : `${protocol}//${host}`;
  const siteUrl = `${url}/${site}`;

  globalSiteName = site;
  const newSocket = io(siteUrl, { withCredentials: true });

  newSocket.on('connect_error', (err) => {
    console.error('Socket connection error:', err);
  });
  newSocket.on('connect', () => {
    console.log('Socket connected:', newSocket.connected);
  });

  return newSocket;
}

/**
 * Lazily creates and returns the singleton realtime socket connection.
 * Subsequent calls return the same in-flight/connected socket instance.
 */
export function getRealtimeSocket(): Promise<Socket> {
  if (socket) {
    return Promise.resolve(socket);
  }
  if (!socketPromise) {
    socketPromise = createSocket()
      .then((s) => {
        socket = s;
        return s;
      })
      .catch((error) => {
        socketPromise = null;
        throw error;
      });
  }
  return socketPromise;
}

export function getGlobalSiteName(): string {
  return globalSiteName;
}

export type KotErrorPayload = Record<string, unknown>;

/**
 * Subscribes to the "kot_error_<branch>_<production>" realtime channel
 * (added by backend task B3) for the lifetime of the mounted component.
 *
 * NOTE: this is a distinct channel from "kot_update_...", which carries
 * incompatible payloads and must not be used here.
 */
export function useKotErrorChannel(
  branch: string,
  production: string,
  onError: (payload: KotErrorPayload) => void,
): void {
  useEffect(() => {
    if (!branch || !production) {
      return;
    }

    const channelName = `kot_error_${branch}_${production}`;
    let activeSocket: Socket | null = null;
    let cancelled = false;

    getRealtimeSocket()
      .then((s) => {
        if (cancelled) {
          return;
        }
        activeSocket = s;
        s.on(channelName, onError);
      })
      .catch((error) => {
        console.error('Failed to subscribe to KOT error channel:', error);
      });

    return () => {
      cancelled = true;
      activeSocket?.off(channelName, onError);
    };
  }, [branch, production, onError]);
}

export interface MenuAvailabilityEventPayload {
  affected_items: string[];
  component_item: string;
  branch: string;
  department: string | null;
}

/**
 * Subscribes to the "menu_availability_update_<branch>" realtime channel
 * (published by H1's `publish_component_stock_fanout`, see
 * ury/ury/api/ury_bom_compiler.py) for the lifetime of the mounted component.
 *
 * Scoped per-branch: the channel name already filters to the current branch,
 * so callers only need to check `affected_items` against the item(s) they
 * render before triggering a `skipCache: true` refetch.
 *
 * Mirrors `useKotErrorChannel` above — if the socket never connects, drops,
 * or the subscribe call rejects, this silently no-ops (logs and returns)
 * rather than throwing, so menu tiles keep working without live updates.
 */
export function useMenuAvailabilityChannel(
  branch: string | undefined,
  onEvent: (payload: MenuAvailabilityEventPayload) => void,
): void {
  const onEventRef = useRef(onEvent);

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!branch) {
      return;
    }

    const channelName = `menu_availability_update_${branch}`;
    const handler = (payload: MenuAvailabilityEventPayload) => onEventRef.current(payload);
    let activeSocket: Socket | null = null;
    let cancelled = false;

    getRealtimeSocket()
      .then((s) => {
        if (cancelled) {
          return;
        }
        activeSocket = s;
        s.on(channelName, handler);
      })
      .catch((error) => {
        // Defensive: never let a failed/absent realtime connection break the
        // menu — it just keeps rendering whatever availability it last fetched.
        console.error('Failed to subscribe to menu availability channel:', error);
      });

    return () => {
      cancelled = true;
      activeSocket?.off(channelName, handler);
    };
  }, [branch]);
}

/**
 * Subscribes to multiple KOT error channels (one per production unit).
 * Use this when a terminal needs to monitor errors from multiple production units.
 *
 * A single effect attaches/detaches every channel listener on the shared
 * socket, so the number of hook calls stays constant across renders no matter
 * how many production units are passed in (the array is typically empty on the
 * first render and populated once the fetch resolves).
 */
export function useKotErrorChannels(
  branch: string,
  productions: string[],
  onError: (payload: KotErrorPayload) => void,
): void {
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  // Stable primitive dependency: the subscription must not tear down and
  // re-attach just because the caller passed a new array with the same items.
  const productionKey = productions.join(' ');

  useEffect(() => {
    const productionList = productionKey.split(' ').filter(Boolean);
    if (!branch || productionList.length === 0) {
      return;
    }

    const channelNames = productionList.map(
      (production) => `kot_error_${branch}_${production}`,
    );
    const handler = (payload: KotErrorPayload) => onErrorRef.current(payload);
    let activeSocket: Socket | null = null;
    let cancelled = false;

    getRealtimeSocket()
      .then((s) => {
        if (cancelled) {
          return;
        }
        activeSocket = s;
        channelNames.forEach((channelName) => s.on(channelName, handler));
      })
      .catch((error) => {
        console.error('Failed to subscribe to KOT error channels:', error);
      });

    return () => {
      cancelled = true;
      channelNames.forEach((channelName) => activeSocket?.off(channelName, handler));
    };
  }, [branch, productionKey]);
}
