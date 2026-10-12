import { useEffect, useState } from 'react';

/**
 * Whether the POS can currently reach the server.
 *
 * 'checking' is a real state, not a loading spinner: it is what we know
 * after the browser claims to be online but before anything has actually
 * answered. Treating that claim as "online" is the whole reason a cashier
 * discovers the network is down by pressing Pay.
 */
export type ConnectionState = 'online' | 'offline' | 'checking';

/**
 * What we learned, and from where.
 *
 * `navigator.onLine` is only trustworthy when it says false — that means the
 * machine has no network interface at all. When it says true it means only
 * that an interface exists, which is exactly what a restaurant router still
 * reports while its uplink is dead. So a browser-online event downgrades us
 * to 'checking' and waits for the server to answer, rather than declaring
 * victory.
 */
export type ConnectivitySignal =
  | 'browser-offline'
  | 'browser-online'
  | 'probe-ok'
  | 'probe-failed';

/** Pure state transition, kept separate from timers and the network so it can be reasoned about and tested. */
export function nextConnectionState(
  current: ConnectionState,
  signal: ConnectivitySignal,
): ConnectionState {
  switch (signal) {
    case 'browser-offline':
      return 'offline';
    case 'browser-online':
      // Never promote straight to 'online': the interface being up says
      // nothing about the server being reachable.
      return current === 'online' ? 'online' : 'checking';
    case 'probe-ok':
      return 'online';
    case 'probe-failed':
      return 'offline';
    default:
      return current;
  }
}

/** How often to ask the server whether it is there. */
export function probeIntervalMs(state: ConnectionState): number {
  // While down, ask often: the cashier is standing still until it comes
  // back. While up, ask rarely: this runs all day on every terminal.
  return state === 'online' ? 30_000 : 5_000;
}

const PROBE_URL = '/api/method/frappe.ping';
const PROBE_TIMEOUT_MS = 6_000;

/**
 * One round trip to the server.
 *
 * Any answer at all counts as reachable, including an HTTP error: a 403 or a
 * 500 means the server is there and talking, which is the question being
 * asked here. Only a transport failure or a timeout is "offline".
 */
export async function probeServer(timeoutMs = PROBE_TIMEOUT_MS): Promise<boolean> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    await fetch(PROBE_URL, {
      method: 'GET',
      cache: 'no-store',
      credentials: 'same-origin',
      signal: controller.signal,
    });
    return true;
  } catch {
    return false;
  } finally {
    window.clearTimeout(timer);
  }
}

type Listener = (state: ConnectionState) => void;

class ConnectivityMonitor {
  private state: ConnectionState = 'checking';
  private listeners = new Set<Listener>();
  private timer: number | null = null;
  private started = false;
  private lastOnlineAt: number | null = null;

  getState(): ConnectionState {
    return this.state;
  }

  getLastOnlineAt(): number | null {
    return this.lastOnlineAt;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    this.start();
    return () => {
      this.listeners.delete(listener);
    };
  }

  private apply(signal: ConnectivitySignal) {
    const next = nextConnectionState(this.state, signal);
    if (next === 'online') {
      this.lastOnlineAt = Date.now();
    }
    if (next === this.state) {
      return;
    }
    this.state = next;
    this.listeners.forEach((listener) => listener(next));
    // The cadence depends on the state, so a change reschedules the loop.
    this.schedule();
  }

  /** Probe now, e.g. because the cashier pressed "check again". */
  async checkNow(): Promise<ConnectionState> {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.apply('browser-offline');
      return this.state;
    }
    const reachable = await probeServer();
    this.apply(reachable ? 'probe-ok' : 'probe-failed');
    return this.state;
  }

  private schedule() {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
    }
    this.timer = window.setTimeout(() => {
      this.checkNow();
    }, probeIntervalMs(this.state));
  }

  private start() {
    if (this.started) {
      return;
    }
    this.started = true;

    window.addEventListener('offline', () => this.apply('browser-offline'));
    window.addEventListener('online', () => {
      this.apply('browser-online');
      // Confirm immediately rather than waiting for the next tick: the
      // cashier is watching the banner and wants it gone.
      this.checkNow();
    });
    // A backgrounded tab's timers are throttled, so what it believes on
    // return can be minutes stale.
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        this.checkNow();
      }
    });

    this.checkNow();
  }
}

export const connectivity = new ConnectivityMonitor();

export function useConnectivity(): {
  state: ConnectionState;
  isOffline: boolean;
  checkNow: () => Promise<ConnectionState>;
} {
  const [state, setState] = useState<ConnectionState>(connectivity.getState());

  useEffect(() => connectivity.subscribe(setState), []);

  return {
    state,
    // 'checking' is deliberately NOT offline. Blocking the till every time a
    // probe is in flight would make the POS unusable on a slow connection,
    // and an unconfirmed link is not a known-broken one.
    isOffline: state === 'offline',
    checkNow: () => connectivity.checkNow(),
  };
}
