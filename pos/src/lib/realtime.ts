type RealtimeHandler<T = unknown> = (payload: T) => void;

interface FrappeRealtime {
  on?: (event: string, handler: RealtimeHandler) => void;
  off?: (event: string, handler: RealtimeHandler) => void;
}

declare global {
  interface Window {
    frappe?: {
      realtime?: FrappeRealtime;
    };
  }
}

export function subscribeRealtimeEvent<T = unknown>(
  event: string,
  handler: RealtimeHandler<T>
) {
  const realtime = window.frappe?.realtime;
  if (!realtime?.on) {
    return () => {};
  }

  const wrappedHandler: RealtimeHandler = (payload) => handler(payload as T);
  realtime.on(event, wrappedHandler);

  return () => {
    realtime.off?.(event, wrappedHandler);
  };
}
