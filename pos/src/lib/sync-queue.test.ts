import { beforeEach, describe, expect, it } from 'vitest';
import {
  enqueueOrder,
  flushQueue,
  newRequestId,
  readQueue,
  type FlushDeps,
  type QueuedOrder,
} from './sync-queue';

/**
 * The queue's two promises: order is preserved, and nothing leaves until the
 * server has answered for it.
 *
 * These are the properties that stop an offline backlog from becoming a way
 * to cook the same dish twice, so they are checked rather than assumed.
 */

const entry = (id: string): QueuedOrder => ({
  request_id: id,
  queued_at: Date.now(),
  label: 'T1',
  payload: { request_id: id } as QueuedOrder['payload'],
});

function deps(
  send: (payload: QueuedOrder['payload']) => Promise<{ message: unknown }>,
  offline = false,
): FlushDeps {
  return { send, isOffline: () => offline } as FlushDeps;
}

const ok = { message: { name: 'INV-1' } };

beforeEach(() => {
  localStorage.clear();
});

describe('newRequestId', () => {
  it('does not collide', () => {
    // A shared id would make two different orders look like retries of each
    // other, and the server would silently drop the second.
    const ids = new Set(Array.from({ length: 500 }, () => newRequestId()));
    expect(ids.size).toBe(500);
  });
});

describe('flushQueue', () => {
  it('delivers oldest first', async () => {
    // A later order can add items to the same table as an earlier one, so
    // replaying out of order rewrites a table's order with a stale version.
    const seen: string[] = [];
    enqueueOrder(entry('a'));
    enqueueOrder(entry('b'));
    enqueueOrder(entry('c'));

    const result = await flushQueue(
      deps(async (p) => {
        seen.push(p.request_id);
        return ok;
      }),
    );

    expect(seen).toEqual(['a', 'b', 'c']);
    expect(result.sent).toBe(3);
    expect(readQueue()).toHaveLength(0);
  });

  it('keeps the head when the link drops mid-flush', async () => {
    // The same request_id goes out next time, so a delivery whose reply was
    // lost is recognised by the server rather than repeated.
    enqueueOrder(entry('x'));
    enqueueOrder(entry('y'));
    enqueueOrder(entry('z'));

    const result = await flushQueue(
      deps(async (p) => {
        if (p.request_id === 'y') throw new Error('network down');
        return ok;
      }),
    );

    expect(result.sent).toBe(1);
    expect(readQueue().map((e) => e.request_id)).toEqual(['y', 'z']);
  });

  it('drops an order the server refuses instead of retrying it forever', async () => {
    // A refusal (a stale edit, a table taken by someone else) will not become
    // an acceptance on the next attempt, and must not block what is behind it.
    enqueueOrder(entry('q'));
    enqueueOrder(entry('r'));

    const result = await flushQueue(
      deps(async (p) => (p.request_id === 'q' ? { message: { status: 'Failure' } } : ok)),
    );

    expect(result.rejected).toHaveLength(1);
    expect(result.sent).toBe(1);
    expect(readQueue()).toHaveLength(0);
  });

  it('does not touch the server while the link is known to be down', async () => {
    let attempted = false;
    enqueueOrder(entry('offline-1'));

    const result = await flushQueue(
      deps(async () => {
        attempted = true;
        return ok;
      }, true),
    );

    expect(attempted).toBe(false);
    expect(result.remaining).toBe(1);
  });
});
