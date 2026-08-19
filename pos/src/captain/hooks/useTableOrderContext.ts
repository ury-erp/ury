import { useCallback, useEffect, useRef, useState } from 'react';
import { usePOSStore, OrderItem } from '../../store/pos-store';
import {
  getTableOrderContext,
  TableOrderContext,
  TableOrderPermissions,
} from '../../lib/table-order-context-api';

export interface BaselineItem {
  uniqueId: string;
  id: string;
  name: string;
  price: number;
  quantity: number;
  comment?: string;
}

export interface OrderDeltaLine {
  uniqueId: string;
  id: string;
  name: string;
  price: number;
  comment?: string;
  /** Quantity already sent/confirmed on the server for this line (0 if this round's addition). */
  baseQty: number;
  /** Current editable quantity in the working cart (0 if fully removed). */
  curQty: number;
  /** `curQty - baseQty`. Positive = new/increased, negative = reduced/removed. */
  delta: number;
  /**
   * `min(baseQty, curQty)` — the portion still standing as originally sent.
   * This, not `baseQty`, is what "Already Ordered" displays: once a line is
   * reduced below its baseline, only the remaining confirmed portion still
   * belongs in that group; the rest shows as a distinct reduction line.
   */
  confirmedQty: number;
}

export interface UseTableOrderContextResult {
  context: TableOrderContext | null;
  permissions: TableOrderPermissions | null;
  isContextLoading: boolean;
  contextError: string | null;
  /** True once the initial table order (baseline) has finished loading into the store. */
  isOrderReady: boolean;
  /** Delta lines for items still at (or above) their originally-sent quantity. */
  alreadyOrderedLines: OrderDeltaLine[];
  /** Delta lines for brand-new items or quantity increases this round (`delta > 0`). */
  newOrChangedLines: OrderDeltaLine[];
  /** Delta lines for quantity reductions/removals against the baseline (`delta < 0`). */
  reductionPendingLines: OrderDeltaLine[];
  /** Re-fetches the per-table permission context (does not reload the order). */
  refetchContext: () => Promise<void>;
}

/**
 * Fetches `get_table_order_context(table)` — the server-authoritative
 * permission map + order snapshot for THIS Captain on THIS table (PLAN.md
 * §8) — and, when viewing is allowed, wires the table into the existing
 * Cashier `pos-store` (`setSelectedTable`) so `loadTableOrder()`/menu
 * fetching are reused rather than reimplemented.
 *
 * Delta grouping (PLAN.md §7/§8: baselineItems / workingItems / pendingChanges)
 * is computed here, locally, from a snapshot of `pos-store`'s `activeOrders`
 * taken right after the initial load completes ("baseline"), diffed against
 * the live `activeOrders` ("working"). This deliberately does NOT change
 * `pos-store`'s `activeOrders` shape — Cashier `OrderPanel` keeps its flat
 * cart model unchanged. See CaptainOrder.tsx's report notes for why this
 * was kept local instead of adding baseline/working state to the store.
 */
export const useTableOrderContext = (table: string | undefined): UseTableOrderContextResult => {
  const [context, setContext] = useState<TableOrderContext | null>(null);
  const [isContextLoading, setIsContextLoading] = useState(true);
  const [contextError, setContextError] = useState<string | null>(null);
  const [baselineItems, setBaselineItems] = useState<BaselineItem[] | null>(null);

  const orderLoading = usePOSStore((s) => s.orderLoading);
  const activeOrders = usePOSStore((s) => s.activeOrders);
  const setSelectedTable = usePOSStore((s) => s.setSelectedTable);
  const clearTableOrder = usePOSStore((s) => s.clearTableOrder);

  const prevOrderLoadingRef = useRef(true);
  const baselineCapturedForRef = useRef<string | null>(null);

  const fetchContext = useCallback(async () => {
    if (!table) return;
    try {
      setIsContextLoading(true);
      setContextError(null);
      const result = await getTableOrderContext(table);
      setContext(result);
    } catch (err) {
      setContextError((err as Error).message || 'Failed to load table order context.');
      setContext(null);
    } finally {
      setIsContextLoading(false);
    }
  }, [table]);

  // Fetch the permission context whenever the table changes, and wire the
  // table into pos-store (loadTableOrder + menu fetch) only once we know
  // viewing is actually allowed.
  useEffect(() => {
    if (!table) return;
    baselineCapturedForRef.current = null;
    prevOrderLoadingRef.current = true;
    setBaselineItems(null);

    let cancelled = false;
    (async () => {
      setIsContextLoading(true);
      setContextError(null);
      try {
        const result = await getTableOrderContext(table);
        if (cancelled) return;
        setContext(result);
        if (result.permissions.view) {
          const room = result.table?.restaurant_room ?? null;
          setSelectedTable(table, room);
        }
      } catch (err) {
        if (cancelled) return;
        setContextError((err as Error).message || 'Failed to load table order context.');
        setContext(null);
      } finally {
        if (!cancelled) setIsContextLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      clearTableOrder();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table]);

  // Capture the baseline snapshot on the falling edge of orderLoading, i.e.
  // right after loadTableOrder() (triggered by setSelectedTable above)
  // finishes populating activeOrders.
  useEffect(() => {
    const wasLoading = prevOrderLoadingRef.current;
    prevOrderLoadingRef.current = orderLoading;

    if (!context?.permissions.view) return;
    if (!(wasLoading && !orderLoading)) return;
    if (baselineCapturedForRef.current === table) return;

    baselineCapturedForRef.current = table ?? null;
    setBaselineItems(
      activeOrders.map((item: OrderItem) => ({
        uniqueId: item.uniqueId!,
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        comment: item.comment,
      }))
    );
  }, [orderLoading, activeOrders, context, table]);

  const isOrderReady = baselineItems !== null;

  const deltaLines: OrderDeltaLine[] = [];
  if (baselineItems) {
    const baselineMap = new Map(baselineItems.map((b) => [b.uniqueId, b]));
    const currentMap = new Map(activeOrders.map((i) => [i.uniqueId!, i]));
    const uniqueIds = new Set<string>([...baselineMap.keys(), ...currentMap.keys()]);

    uniqueIds.forEach((uid) => {
      const base = baselineMap.get(uid);
      const cur = currentMap.get(uid);
      const baseQty = base?.quantity ?? 0;
      const curQty = cur?.quantity ?? 0;
      const source = cur ?? base!;
      deltaLines.push({
        uniqueId: uid,
        id: source.id,
        name: source.name,
        price: cur?.price ?? base?.price ?? 0,
        comment: cur?.comment ?? base?.comment,
        baseQty,
        curQty,
        delta: curQty - baseQty,
        confirmedQty: Math.min(baseQty, curQty),
      });
    });
  }

  return {
    context,
    permissions: context?.permissions ?? null,
    isContextLoading,
    contextError,
    isOrderReady,
    alreadyOrderedLines: deltaLines.filter((l) => l.confirmedQty > 0),
    newOrChangedLines: deltaLines.filter((l) => l.delta > 0),
    reductionPendingLines: deltaLines.filter((l) => l.delta < 0),
    refetchContext: fetchContext,
  };
};

export default useTableOrderContext;
