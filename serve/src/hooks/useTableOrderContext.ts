import { useCallback, useEffect, useRef, useState } from 'react'
import { useServeStore, type OrderItem } from '../store/serve-store'
import {
  getTableOrderContext,
  type TableOrderContext,
  type TableOrderPermissions,
} from '../lib/table-order-context-api'

export interface BaselineItem {
  uniqueId: string
  id: string
  name: string
  price: number
  quantity: number
  comment?: string
}

export interface OrderDeltaLine {
  uniqueId: string
  id: string
  name: string
  price: number
  comment?: string
  baseQty: number
  curQty: number
  delta: number
  confirmedQty: number
}

export interface UseTableOrderContextResult {
  context: TableOrderContext | null
  permissions: TableOrderPermissions | null
  isContextLoading: boolean
  isContextRefreshing: boolean
  contextError: string | null
  isOrderReady: boolean
  alreadyOrderedLines: OrderDeltaLine[]
  newOrChangedLines: OrderDeltaLine[]
  reductionPendingLines: OrderDeltaLine[]
  refetchContext: () => Promise<void>
  /** Silent refresh: updates context on success, never toggles isContextLoading. */
  refreshContext: () => Promise<TableOrderContext | null>
}

export const useTableOrderContext = (table: string | undefined): UseTableOrderContextResult => {
  const [context, setContext] = useState<TableOrderContext | null>(null)
  const [isContextLoading, setIsContextLoading] = useState(Boolean(table))
  const [isContextRefreshing, setIsContextRefreshing] = useState(false)
  const [contextError, setContextError] = useState<string | null>(null)
  const [baselineItems, setBaselineItems] = useState<BaselineItem[] | null>(table ? null : [])

  const orderLoading = useServeStore((s) => s.orderLoading)
  const activeOrders = useServeStore((s) => s.activeOrders)
  const setSelectedTable = useServeStore((s) => s.setSelectedTable)
  const clearTableOrder = useServeStore((s) => s.clearTableOrder)

  const prevOrderLoadingRef = useRef(true)
  const baselineCapturedForRef = useRef<string | null>(null)

  const fetchContext = useCallback(async () => {
    if (!table) return
    try {
      setIsContextLoading(true)
      setContextError(null)
      const result = await getTableOrderContext(table)
      setContext(result)
    } catch (err) {
      setContextError((err as Error).message || 'Failed to load table order context.')
      setContext(null)
    } finally {
      setIsContextLoading(false)
    }
  }, [table])

  const refreshContext = useCallback(async (): Promise<TableOrderContext | null> => {
    if (!table) return null
    setIsContextRefreshing(true)
    try {
      const result = await getTableOrderContext(table)
      setContext(result)
      return result
    } catch {
      // Keep existing context and contextError; caller decides whether to proceed.
      return null
    } finally {
      setIsContextRefreshing(false)
    }
  }, [table])

  useEffect(() => {
    if (!table) {
      setIsContextLoading(false)
      setContext(null)
      setContextError(null)
      setBaselineItems([])
      return
    }
    baselineCapturedForRef.current = null
    prevOrderLoadingRef.current = true
    setBaselineItems(null)

    let cancelled = false
    ;(async () => {
      setIsContextLoading(true)
      setContextError(null)
      try {
        const result = await getTableOrderContext(table)
        if (cancelled) return
        setContext(result)
        if (result.permissions.view) {
          const room = result.table?.restaurant_room ?? null
          setSelectedTable(table, room)
        }
      } catch (err) {
        if (cancelled) return
        setContextError((err as Error).message || 'Failed to load table order context.')
        setContext(null)
      } finally {
        if (!cancelled) setIsContextLoading(false)
      }
    })()

    return () => {
      cancelled = true
      clearTableOrder({ preserveDraft: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table])

  useEffect(() => {
    const wasLoading = prevOrderLoadingRef.current
    prevOrderLoadingRef.current = orderLoading
    if (!context?.permissions.view) return
    if (!(wasLoading && !orderLoading)) return
    if (baselineCapturedForRef.current === table) return
    baselineCapturedForRef.current = table ?? null
    setBaselineItems(
      activeOrders.map((item: OrderItem) => ({
        uniqueId: item.uniqueId!,
        id: item.id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        comment: item.comment,
      }))
    )
  }, [orderLoading, activeOrders, context, table])

  const isOrderReady = baselineItems !== null
  const deltaLines: OrderDeltaLine[] = []
  if (baselineItems) {
    const baselineMap = new Map(baselineItems.map((b) => [b.uniqueId, b]))
    const currentMap = new Map(activeOrders.map((i) => [i.uniqueId!, i]))
    const uniqueIds = new Set<string>([...baselineMap.keys(), ...currentMap.keys()])
    uniqueIds.forEach((uid) => {
      const base = baselineMap.get(uid)
      const cur = currentMap.get(uid)
      const baseQty = base?.quantity ?? 0
      const curQty = cur?.quantity ?? 0
      const source = cur ?? base!
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
      })
    })
  }

  return {
    context,
    permissions: context?.permissions ?? null,
    isContextLoading,
    isContextRefreshing,
    contextError,
    isOrderReady,
    alreadyOrderedLines: deltaLines.filter((l) => l.confirmedQty > 0),
    newOrChangedLines: deltaLines.filter((l) => l.delta > 0),
    reductionPendingLines: deltaLines.filter((l) => l.delta < 0),
    refetchContext: fetchContext,
    refreshContext,
  }
}

export default useTableOrderContext
