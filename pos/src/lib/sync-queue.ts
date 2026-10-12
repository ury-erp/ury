import { syncOrder, type SyncOrderRequest, type SyncOrderResponse } from './order-api';
import { connectivity } from './connectivity';

/**
 * Orders taken while the server was unreachable, held until it answers again.
 *
 * Two things make this safe rather than a way to duplicate food:
 *
 * 1. Every entry carries a `request_id` minted once, when the cashier pressed
 *    send. The server records applied keys (`URY Sync Request`) and answers a
 *    replay with the original invoice instead of cooking it again. Without
 *    that key this queue would be a bug generator, which is why it did not
 *    exist until the server could recognise a repeat.
 *
 * 2. Entries are replayed strictly in order, one at a time, and the head is
 *    only dropped once the server has answered it. A later order can add
 *    items to the same table as an earlier one, so playing them out of order
 *    would rewrite a table's order with a stale version of itself.
 *
 * The queue lives in localStorage because the reason it exists is that things
 * are going wrong: a browser crash or a reload during an outage must not take
 * the evening's orders with it.
 */

const STORAGE_KEY = 'ury_offline_order_queue';

export interface QueuedOrder {
  request_id: string;
  /** Epoch ms, for showing the cashier how old the backlog is. */
  queued_at: number;
  /** What the cashier will recognise it by — table name, or the order type. */
  label: string;
  payload: SyncOrderRequest & { request_id: string };
}

export function newRequestId(): string {
  // crypto.randomUUID is unavailable on http:// origins in some browsers,
  // which is exactly where this POS runs today, so it cannot be relied on.
  const random = Math.random().toString(36).slice(2);
  return `${Date.now().toString(36)}-${random}-${Math.random().toString(36).slice(2)}`;
}

export function readQueue(): QueuedOrder[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    // Corrupt or blocked storage. An unreadable queue is an empty one; the
    // alternative is a POS that will not start.
    return [];
  }
}

function writeQueue(queue: QueuedOrder[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(queue));
  } catch {
    // Out of quota or blocked. Nothing useful to do here, and throwing would
    // lose the order the cashier just took.
  }
  notify();
}

type Listener = (queue: QueuedOrder[]) => void;
const listeners = new Set<Listener>();

function notify() {
  const queue = readQueue();
  listeners.forEach((listener) => listener(queue));
}

export function subscribeToQueue(listener: Listener): () => void {
  listeners.add(listener);
  listener(readQueue());
  return () => {
    listeners.delete(listener);
  };
}

export function enqueueOrder(entry: QueuedOrder): void {
  writeQueue([...readQueue(), entry]);
}

export function queueLength(): number {
  return readQueue().length;
}

/** True when the response means "the server has this order". */
function isAccepted(response: { message: SyncOrderResponse } | undefined): boolean {
  const message = response?.message;
  if (!message || typeof message !== 'object') return false;
  // sync_order answers a rejection with { status: 'Failure' } rather than
  // throwing, so a 200 is not on its own an acceptance.
  return !('status' in message && message.status === 'Failure');
}

export interface FlushResult {
  sent: number;
  /** Entries the server refused outright; they are dropped, not retried forever. */
  rejected: QueuedOrder[];
  remaining: number;
}

let flushing = false;

/**
 * What a flush needs from the outside world.
 *
 * Injected with real defaults rather than imported directly so the ordering
 * and retry rules above can be exercised without a server or a browser —
 * they are the rules that keep this from duplicating food, so they are worth
 * being able to check.
 */
export interface FlushDeps {
  send: (payload: SyncOrderRequest & { request_id: string }) => Promise<{ message: SyncOrderResponse }>;
  isOffline: () => boolean;
}

const defaultDeps: FlushDeps = {
  send: (payload) => syncOrder(payload),
  isOffline: () => connectivity.getState() === 'offline',
};

/**
 * Replay the backlog, oldest first, stopping at the first entry that cannot
 * be delivered.
 *
 * Stopping rather than skipping is deliberate: the entries behind a stuck one
 * may depend on it having been applied.
 */
export async function flushQueue(deps: FlushDeps = defaultDeps): Promise<FlushResult> {
  if (flushing) {
    return { sent: 0, rejected: [], remaining: queueLength() };
  }
  flushing = true;

  let sent = 0;
  const rejected: QueuedOrder[] = [];

  try {
    for (;;) {
      const queue = readQueue();
      if (queue.length === 0) break;
      if (deps.isOffline()) break;

      const head = queue[0];
      let response: { message: SyncOrderResponse } | undefined;
      try {
        response = await deps.send(head.payload);
      } catch {
        // A transport failure: the link is down again. Leave the head in
        // place — it is the same request_id next time, so a delivery we
        // did not hear about will be recognised rather than repeated.
        break;
      }

      if (!isAccepted(response)) {
        // The server understood and said no (a stale edit, a table taken by
        // someone else). Retrying cannot change that answer, so the entry is
        // surfaced to the cashier instead of blocking everything behind it.
        rejected.push(head);
      } else {
        sent += 1;
      }

      writeQueue(readQueue().slice(1));
    }
  } finally {
    flushing = false;
  }

  return { sent, rejected, remaining: queueLength() };
}
