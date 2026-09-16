import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const getTableOrderContextMock = vi.fn();

vi.mock('../../lib/table-order-context-api', () => ({
  getTableOrderContext: (...args: unknown[]) => getTableOrderContextMock(...args),
}));

const setSelectedTableMock = vi.fn();
const clearTableOrderMock = vi.fn();

// The real pos-store is a zustand store consumed as `usePOSStore(selector)`.
// A plain mutable object read through the selector, combined with
// renderHook's own `rerender()`, is enough to simulate store updates across
// renders without pulling in zustand's own test harness.
let storeState = {
  orderLoading: false,
  activeOrders: [] as OrderItem[],
  setSelectedTable: setSelectedTableMock,
  clearTableOrder: clearTableOrderMock,
};

vi.mock('../../store/pos-store', () => ({
  usePOSStore: (selector: (s: typeof storeState) => unknown) => selector(storeState),
}));

import { useTableOrderContext } from './useTableOrderContext';
import type { TableOrderContext } from '../../lib/table-order-context-api';
import type { OrderItem } from '../../store/pos-store';

const buildContext = (overrides: Partial<TableOrderContext> = {}): TableOrderContext => ({
  table: { name: 'T-1', branch: 'Kozhikode', restaurant_room: 'Main Hall' },
  order: null,
  assignment: null,
  permissions: {
    view: true,
    modify: true,
    reduce_items: true,
    remove_items: true,
    transfer_table: true,
    transfer_captain: true,
    print_bill: true,
    reprint_kot: true,
    settle: true,
    cancel: true,
  },
  ...overrides,
});

const buildOrderItem = (overrides: Record<string, unknown> = {}) => ({
  uniqueId: 'u1',
  id: 'ITEM-1',
  name: 'Item 1',
  price: 100,
  quantity: 2,
  comment: undefined,
  ...overrides,
});

describe('useTableOrderContext', () => {
  beforeEach(() => {
    getTableOrderContextMock.mockReset();
    setSelectedTableMock.mockClear();
    clearTableOrderMock.mockClear();
    storeState = {
      orderLoading: false,
      activeOrders: [],
      setSelectedTable: setSelectedTableMock,
      clearTableOrder: clearTableOrderMock,
    };
  });

  it('does nothing when table is undefined: no fetch, stays in initial loading state', () => {
    const { result } = renderHook(() => useTableOrderContext(undefined));

    expect(getTableOrderContextMock).not.toHaveBeenCalled();
    expect(result.current.isContextLoading).toBe(true);
    expect(result.current.context).toBeNull();
    expect(result.current.isOrderReady).toBe(false);
  });

  it('fetches the table order context on mount and wires the table into pos-store when view is allowed', async () => {
    const ctx = buildContext();
    getTableOrderContextMock.mockResolvedValueOnce(ctx);

    const { result } = renderHook(() => useTableOrderContext('T-1'));

    await waitFor(() => expect(result.current.isContextLoading).toBe(false));

    expect(getTableOrderContextMock).toHaveBeenCalledWith('T-1');
    expect(result.current.context).toEqual(ctx);
    expect(result.current.permissions).toEqual(ctx.permissions);
    expect(setSelectedTableMock).toHaveBeenCalledWith('T-1', 'Main Hall');
  });

  it('does not wire the table into pos-store when the permission context denies view', async () => {
    const ctx = buildContext({
      permissions: { ...buildContext().permissions, view: false },
    });
    getTableOrderContextMock.mockResolvedValueOnce(ctx);

    const { result } = renderHook(() => useTableOrderContext('T-1'));
    await waitFor(() => expect(result.current.isContextLoading).toBe(false));

    expect(setSelectedTableMock).not.toHaveBeenCalled();
  });

  it('surfaces a fetch error and clears context, without touching pos-store', async () => {
    getTableOrderContextMock.mockRejectedValueOnce(new Error('403 Forbidden'));

    const { result } = renderHook(() => useTableOrderContext('T-1'));
    await waitFor(() => expect(result.current.isContextLoading).toBe(false));

    expect(result.current.contextError).toBe('403 Forbidden');
    expect(result.current.context).toBeNull();
    expect(setSelectedTableMock).not.toHaveBeenCalled();
  });

  it('falls back to a generic error message when the rejection has no message', async () => {
    getTableOrderContextMock.mockRejectedValueOnce({});

    const { result } = renderHook(() => useTableOrderContext('T-1'));
    await waitFor(() => expect(result.current.isContextLoading).toBe(false));

    expect(result.current.contextError).toBe('Failed to load table order context.');
  });

  it('captures a baseline once orderLoading falls from true to false while view is allowed, then computes delta lines', async () => {
    storeState.orderLoading = true;
    const ctx = buildContext();
    getTableOrderContextMock.mockResolvedValueOnce(ctx);

    const { result, rerender } = renderHook(({ table }) => useTableOrderContext(table), {
      initialProps: { table: 'T-1' as string | undefined },
    });

    await waitFor(() => expect(result.current.context).toEqual(ctx));
    expect(result.current.isOrderReady).toBe(false);

    // Simulate loadTableOrder() finishing: orderLoading flips true -> false
    // with the baseline items now present in activeOrders.
    storeState.activeOrders = [buildOrderItem({ uniqueId: 'u1', quantity: 2 })];
    storeState.orderLoading = false;
    rerender({ table: 'T-1' });

    await waitFor(() => expect(result.current.isOrderReady).toBe(true));
    // No divergence yet between baseline and current -> counts as "already ordered".
    expect(result.current.alreadyOrderedLines).toHaveLength(1);
    expect(result.current.alreadyOrderedLines[0]).toMatchObject({
      uniqueId: 'u1',
      baseQty: 2,
      curQty: 2,
      delta: 0,
      confirmedQty: 2,
    });
    expect(result.current.newOrChangedLines).toHaveLength(0);
    expect(result.current.reductionPendingLines).toHaveLength(0);

    // Now the captain increases the quantity and adds a brand-new item.
    storeState.activeOrders = [
      buildOrderItem({ uniqueId: 'u1', quantity: 3 }),
      buildOrderItem({ uniqueId: 'u2', id: 'ITEM-2', name: 'Item 2', quantity: 1 }),
    ];
    rerender({ table: 'T-1' });

    await waitFor(() =>
      expect(result.current.newOrChangedLines.map((l) => l.uniqueId).sort()).toEqual(['u1', 'u2']),
    );
    const u1Line = result.current.newOrChangedLines.find((l) => l.uniqueId === 'u1')!;
    expect(u1Line).toMatchObject({ baseQty: 2, curQty: 3, delta: 1, confirmedQty: 2 });
    const u2Line = result.current.newOrChangedLines.find((l) => l.uniqueId === 'u2')!;
    expect(u2Line).toMatchObject({ baseQty: 0, curQty: 1, delta: 1, confirmedQty: 0 });
    // u1 still has a confirmed portion, so it also still counts as already-ordered.
    expect(result.current.alreadyOrderedLines.map((l) => l.uniqueId)).toContain('u1');

    // Reduce u1 below baseline -> should show as a reduction-pending line and
    // drop out of already-ordered once its confirmed portion hits 0.
    storeState.activeOrders = [buildOrderItem({ uniqueId: 'u1', quantity: 0 })];
    rerender({ table: 'T-1' });

    await waitFor(() =>
      expect(result.current.reductionPendingLines.map((l) => l.uniqueId)).toEqual(['u1']),
    );
    expect(result.current.reductionPendingLines[0]).toMatchObject({
      baseQty: 2,
      curQty: 0,
      delta: -2,
      confirmedQty: 0,
    });
    expect(result.current.alreadyOrderedLines).toHaveLength(0);
  });

  it('refetchContext() re-runs the fetch without touching pos-store', async () => {
    const ctx = buildContext();
    getTableOrderContextMock.mockResolvedValueOnce(ctx);

    const { result } = renderHook(() => useTableOrderContext('T-1'));
    await waitFor(() => expect(result.current.isContextLoading).toBe(false));
    setSelectedTableMock.mockClear();
    getTableOrderContextMock.mockResolvedValueOnce(buildContext({ order: null }));

    await act(async () => {
      await result.current.refetchContext();
    });

    expect(getTableOrderContextMock).toHaveBeenCalledTimes(2);
    expect(setSelectedTableMock).not.toHaveBeenCalled();
  });

  it('clears the table order in pos-store on unmount / table change cleanup', async () => {
    const ctx = buildContext();
    getTableOrderContextMock.mockResolvedValueOnce(ctx);

    const { unmount, result } = renderHook(() => useTableOrderContext('T-1'));
    await waitFor(() => expect(result.current.isContextLoading).toBe(false));

    unmount();

    expect(clearTableOrderMock).toHaveBeenCalled();
  });
});
