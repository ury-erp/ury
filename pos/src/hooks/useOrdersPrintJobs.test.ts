import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useOrdersPrintJobs } from './useOrdersPrintJobs';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';

const { fakeSocket } = vi.hoisted(() => {
  const listeners = new Map<string, Set<(payload: unknown) => void>>();
  const fakeSocket = {
    connected: true,
    on(event: string, cb: (payload: unknown) => void) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(cb);
    },
    off(event: string, cb: (payload: unknown) => void) {
      listeners.get(event)?.delete(cb);
    },
    emit(event: string, payload: unknown) {
      listeners.get(event)?.forEach((cb) => cb(payload));
    },
    listenerCount(event: string) {
      return listeners.get(event)?.size ?? 0;
    },
  };
  return { fakeSocket };
});

vi.mock('../lib/realtime', () => ({
  getRealtimeSocket: () => Promise.resolve(fakeSocket),
}));

function mockFetchEmpty() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ data: [] }),
    })
  );
}

describe('useOrdersPrintJobs', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    mockFetchEmpty();
    useRootStore.setState({ user: { name: 'cashier@example.com', roles: [] } });
    usePOSStore.setState({ posProfile: null });
  });

  it('drops failure events owned by another user', async () => {
    const { result } = renderHook(() => useOrdersPrintJobs());

    await waitFor(() => expect(fakeSocket.listenerCount('print_failure_alert')).toBe(1));

    act(() => {
      fakeSocket.emit('print_failure_alert', {
        invoice: 'INV-OTHER',
        print_job_id: 'PJ-OTHER',
        job_owner: 'captain@example.com',
        table: 'T-9',
      });
    });

    expect(result.current.hasInvoiceFailed('INV-OTHER')).toBe(false);
    expect(result.current.hasTableFailed('T-9')).toBe(false);
  });

  it('applies failure events owned by the current user (case-insensitive)', async () => {
    const { result } = renderHook(() => useOrdersPrintJobs());

    await waitFor(() => expect(fakeSocket.listenerCount('print_failure_alert')).toBe(1));

    act(() => {
      fakeSocket.emit('print_failure_alert', {
        invoice: 'INV-MINE',
        print_job_id: 'PJ-MINE',
        job_owner: 'CASHIER@example.com',
      });
    });

    expect(result.current.hasInvoiceFailed('INV-MINE')).toBe(true);
  });

  it('applies failure events that carry no job owner', async () => {
    const { result } = renderHook(() => useOrdersPrintJobs());

    await waitFor(() => expect(fakeSocket.listenerCount('print_failure_alert')).toBe(1));

    act(() => {
      fakeSocket.emit('kot_print_failed', {
        invoice: 'INV-UNOWNED',
        print_job_id: 'PJ-UNOWNED',
        table: 'T-3',
      });
    });

    expect(result.current.hasInvoiceFailed('INV-UNOWNED')).toBe(true);
    expect(result.current.hasTableFailed('T-3')).toBe(true);
  });
});
