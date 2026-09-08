import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Square } from 'lucide-react'
import {
  Button,
  MultiSelectTableDialog,
  ConfirmDialog,
  Spinner,
  showToast,
  TablePickerDialog,
  UserPickerDialog,
} from '@ury/ui'
import { useCaptainContext } from '../hooks/useCaptainContext'
import { useServeStore } from '../store/serve-store'
import {
  getRooms,
  getTables,
  getVacantTablesForBranch,
  mergeTablesBatch,
  resolveAllowedRooms,
  unmergeTables,
  type Room,
  type Table,
} from '../lib/table-api'
import {
  getMergeGroupMembers,
  getTableMergeActions,
  sortTablesByMergeGroups,
} from '../lib/table-utils'
import {
  getActiveTableOrders,
  getBranchCaptains,
  getUserFullNames,
  type ActiveTableOrder,
  type BranchCaptain,
} from '../lib/captain-table-api'
import { captainTransfer, tableTransfer } from '../lib/order-api'
import CaptainTableCard, { type CaptainTableOwnership } from '../components/CaptainTableCard'
import { OperationalTools } from '../operations'

const POLL_MS = 15000

export default function TablesPage() {
  const navigate = useNavigate()
  const {
    context,
    capabilities,
    branch,
    rooms: assignedRooms,
    isLoading: contextLoading,
    error: contextError,
    refetch,
  } = useCaptainContext()
  const { hasUnsentDraft, draftTable, discardDraft, startTakeaway, getDraftDestination, needsReconcile } =
    useServeStore()

  const currentUser = context?.user ?? null
  const canAccessOther = Boolean(capabilities?.canAccessOtherCaptainsTables)
  const canTransferCaptain = Boolean(capabilities?.canTransferCaptain)
  const multipleCashier = Boolean(context?.pos_profile?.custom_enable_multiple_cashier)

  const [selectedRoom, setSelectedRoom] = useState<string | null>(null)
  const [branchRooms, setBranchRooms] = useState<Room[]>([])
  const [roomsLoading, setRoomsLoading] = useState(false)
  const [roomsError, setRoomsError] = useState<string | null>(null)
  const [roomsReloadKey, setRoomsReloadKey] = useState(0)
  const [tables, setTables] = useState<Table[]>([])
  const [activeOrders, setActiveOrders] = useState<Map<string, ActiveTableOrder>>(new Map())
  const [ownerNames, setOwnerNames] = useState<Map<string, string>>(new Map())
  const [tablesLoading, setTablesLoading] = useState(false)
  const [tablesError, setTablesError] = useState<string | null>(null)
  const [mergeSource, setMergeSource] = useState<Table | null>(null)
  const [unmergeSource, setUnmergeSource] = useState<Table | null>(null)
  const [unmergeSubmitting, setUnmergeSubmitting] = useState(false)
  const [menuOpenForTable, setMenuOpenForTable] = useState<string | null>(null)
  /** Pending navigation target after draft discard confirm (`takeaway` or table name). */
  const [pendingDestination, setPendingDestination] = useState<string | null>(null)

  const [transferSource, setTransferSource] = useState<Table | null>(null)
  const [transferInvoiceName, setTransferInvoiceName] = useState<string | null>(null)
  const [transferDestinations, setTransferDestinations] = useState<Table[]>([])
  const [transferLoading, setTransferLoading] = useState(false)

  const [captainTransferSource, setCaptainTransferSource] = useState<{
    table: Table
    invoiceName: string
    currentCaptain: string
  } | null>(null)
  const [captainOptions, setCaptainOptions] = useState<BranchCaptain[]>([])
  const [captainLoading, setCaptainLoading] = useState(false)
  const [captainSearch, setCaptainSearch] = useState('')

  const roomsRequestIdRef = useRef(0)
  const tablesRequestIdRef = useRef(0)
  const ordersRequestIdRef = useRef(0)

  const loadBranchRooms = useCallback(async (branchName: string) => {
    const requestId = ++roomsRequestIdRef.current
    setRoomsLoading(true)
    setRoomsError(null)
    try {
      const fetched = await getRooms(branchName)
      if (requestId !== roomsRequestIdRef.current) return
      setBranchRooms(fetched)
    } catch (err) {
      if (requestId !== roomsRequestIdRef.current) return
      setBranchRooms([])
      setRoomsError(err instanceof Error ? err.message : 'Failed to load rooms')
    } finally {
      if (requestId === roomsRequestIdRef.current) {
        setRoomsLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    if (!branch) return
    void loadBranchRooms(branch)
  }, [branch, roomsReloadKey, loadBranchRooms])

  const selectableRooms = useMemo(
    () =>
      resolveAllowedRooms({
        multipleCashier,
        assignedRooms: assignedRooms.map((room) => ({
          name: room.name ?? null,
          branch: room.branch,
        })),
        branchRooms,
      }),
    [multipleCashier, assignedRooms, branchRooms]
  )

  useEffect(() => {
    if (selectableRooms.length === 0) {
      setSelectedRoom(null)
      return
    }
    if (selectedRoom && selectableRooms.some((room) => room.name === selectedRoom)) {
      return
    }
    const assignedName = assignedRooms.find((room) => room.name)?.name ?? null
    const defaultRoom =
      selectableRooms.find((room) => room.name === assignedName) ?? selectableRooms[0]
    setSelectedRoom(defaultRoom.name)
  }, [selectableRooms, assignedRooms, selectedRoom])

  const loadTables = useCallback(async (roomName: string) => {
    const requestId = ++tablesRequestIdRef.current
    setTablesLoading(true)
    setTablesError(null)
    try {
      const fetched = await getTables(roomName)
      if (requestId !== tablesRequestIdRef.current) return
      setTables(sortTablesByMergeGroups(fetched))
    } catch {
      if (requestId !== tablesRequestIdRef.current) return
      setTablesError('Failed to load tables')
      setTables([])
    } finally {
      if (requestId === tablesRequestIdRef.current) {
        setTablesLoading(false)
      }
    }
  }, [])

  const loadActiveOrders = useCallback(async (branchName: string) => {
    const requestId = ++ordersRequestIdRef.current
    try {
      const orders = await getActiveTableOrders(branchName)
      if (requestId !== ordersRequestIdRef.current) return
      setActiveOrders(orders)
      const waiters = Array.from(orders.values()).map((order) => order.waiter)
      const names = await getUserFullNames(waiters)
      if (requestId !== ordersRequestIdRef.current) return
      setOwnerNames(names)
    } catch (err) {
      if (requestId !== ordersRequestIdRef.current) return
      console.error(err)
    }
  }, [])

  const refreshSelectedRoom = useCallback(() => {
    if (selectedRoom) void loadTables(selectedRoom)
    if (branch) void loadActiveOrders(branch)
  }, [selectedRoom, branch, loadTables, loadActiveOrders])

  useEffect(() => {
    if (selectedRoom) void loadTables(selectedRoom)
  }, [selectedRoom, loadTables])

  useEffect(() => {
    if (branch) void loadActiveOrders(branch)
  }, [branch, loadActiveOrders])

  useEffect(() => {
    const id = window.setInterval(() => {
      if (selectedRoom) void loadTables(selectedRoom)
      if (branch) void loadActiveOrders(branch)
    }, POLL_MS)
    return () => window.clearInterval(id)
  }, [selectedRoom, branch, loadTables, loadActiveOrders])

  useEffect(() => {
    if (!captainTransferSource || !branch) return
    let cancelled = false
    setCaptainLoading(true)
    getBranchCaptains(branch, {
      search: captainSearch,
      exclude: currentUser ?? undefined,
      limit: 20,
    })
      .then((rows) => {
        if (!cancelled) setCaptainOptions(rows)
      })
      .catch(() => {
        if (!cancelled) setCaptainOptions([])
      })
      .finally(() => {
        if (!cancelled) setCaptainLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [captainTransferSource, captainSearch, currentUser, branch])

  const resolveOwnership = useCallback(
    (table: Table, order: ActiveTableOrder | undefined): CaptainTableOwnership => {
      if (table.occupied !== 1) return 'free'
      if (!order) return 'occupied-unknown'
      return order.waiter === currentUser ? 'mine' : 'other'
    },
    [currentUser]
  )

  const navigateToDestination = (destination: string) => {
    if (destination === 'takeaway') {
      startTakeaway()
      navigate('/takeaway')
      return
    }
    navigate(`/table/${destination}`)
  }

  const openDestination = (destination: string) => {
    const draftDest = getDraftDestination()

    if (hasUnsentDraft() && needsReconcile) {
      if (draftDest === destination) {
        navigateToDestination(destination)
        return
      }
      // Uncertain sync: require explicit leave/discard from the order screen — never auto-discard here.
      showToast.error(
        'Send result unclear. Open the existing order and leave without resending before starting another.'
      )
      return
    }

    if (hasUnsentDraft() && draftDest && draftDest !== destination) {
      setPendingDestination(destination)
      return
    }

    navigateToDestination(destination)
  }

  const openTable = (tableName: string) => {
    openDestination(tableName)
  }

  const openTakeaway = () => {
    openDestination('takeaway')
  }

  const handleTableTap = (table: Table, order: ActiveTableOrder | undefined) => {
    const ownership = resolveOwnership(table, order)
    // Elevated access only when backend-derived capabilities say so
    // (`canCaptainTransfer` / billing → canAccessOtherCaptainsTables).
    if (ownership === 'free' || ownership === 'mine' || canAccessOther) {
      openTable(table.name)
      return
    }
    const ownerName = order ? ownerNames.get(order.waiter) ?? order.waiter : null
    showToast.error(ownerName ? `Assigned to ${ownerName}` : 'This table is occupied')
  }

  const validateActiveOrder = (order: ActiveTableOrder | undefined) => {
    if (!order?.invoiceName) {
      throw new Error('No active order on this table')
    }
    if (order.invoicePrinted) {
      throw new Error('Order already billed')
    }
    return order
  }

  const handleOpenTransferTable = async (table: Table) => {
    setMenuOpenForTable(null)
    if (getMergeGroupMembers(table, tables).length > 1) {
      showToast.error('Unmerge tables before transferring')
      return
    }
    if (!branch) {
      showToast.error('Transfer failed')
      return
    }

    const order = activeOrders.get(table.name)
    setTransferSource(table)
    setTransferInvoiceName(null)
    setTransferDestinations([])
    setTransferLoading(true)
    try {
      const active = validateActiveOrder(order)
      setTransferDestinations(await getVacantTablesForBranch(branch, table.name))
      setTransferInvoiceName(active.invoiceName)
    } catch (err) {
      setTransferSource(null)
      setTransferInvoiceName(null)
      setTransferDestinations([])
      showToast.error(err instanceof Error ? err.message : 'Failed to load tables')
    } finally {
      setTransferLoading(false)
    }
  }

  const handleOpenCaptainTransfer = (table: Table) => {
    setMenuOpenForTable(null)
    try {
      const order = validateActiveOrder(activeOrders.get(table.name))
      if (!order.waiter) {
        throw new Error('No active order on this table')
      }
      setCaptainSearch('')
      setCaptainTransferSource({
        table,
        invoiceName: order.invoiceName,
        currentCaptain: order.waiter,
      })
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : 'Transfer failed')
    }
  }

  const retryFailedLoad = () => {
    if (roomsError && branch) {
      setRoomsReloadKey((key) => key + 1)
    }
    if (contextError) {
      void refetch()
    }
  }

  const tableGroups = useMemo(() => sortTablesByMergeGroups(tables), [tables])
  const mergeOptions = useMemo(() => {
    if (!mergeSource) return []
    const cluster = new Set(getMergeGroupMembers(mergeSource, tables))
    return tables
      .filter((table) => table.name !== mergeSource.name && !cluster.has(table.name))
      .map((table) => ({ name: table.name, occupied: table.occupied }))
  }, [mergeSource, tables])

  const isLoading = contextLoading || (roomsLoading && selectableRooms.length === 0 && !roomsError)

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner message="Loading tables…" />
      </div>
    )
  }

  if (contextError || roomsError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <AlertTriangle className="mx-auto mb-3 h-8 w-8 text-red-600" />
          <h2 className="mb-1 text-lg font-semibold">Unable to load tables</h2>
          <p className="text-sm text-gray-600">{contextError || roomsError}</p>
          <Button className="mt-4" onClick={retryFailedLoad}>
            Retry
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="sticky top-0 z-10 border-b border-border bg-white p-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-bold text-gray-900">Tables</h1>
          <div className="flex items-center gap-1">
            {currentUser && context?.pos_profile?.name && (
              <OperationalTools
                user={currentUser}
                posProfile={context.pos_profile.name}
                branch={branch ?? undefined}
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              className="min-h-11 px-3"
              onClick={() => {
                if (selectedRoom) void loadTables(selectedRoom)
                if (branch) void loadActiveOrders(branch)
              }}
            >
              Refresh
            </Button>
          </div>
        </div>

        {capabilities?.canSettlePayment && (
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
              className="min-h-11"
              onClick={openTakeaway}
            >
              Takeaway order
            </Button>
          </div>
        )}

        {selectableRooms.length > 0 && (
          <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
            {selectableRooms.map((room) => (
              <Button
                key={room.name}
                variant="tab"
                size="sm"
                data-selected={selectedRoom === room.name}
                onClick={() => setSelectedRoom(room.name)}
                className="min-h-11 shrink-0 px-4 text-sm"
              >
                {room.name}
              </Button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 p-3">
        {selectableRooms.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-500">
            <AlertTriangle className="h-8 w-8" />
            <p className="text-sm">No rooms available for your account.</p>
          </div>
        ) : tablesError ? (
          <div className="py-16 text-center">
            <p className="text-sm text-red-500">{tablesError}</p>
            <Button
              className="mt-3 min-h-11"
              variant="outline"
              onClick={() => selectedRoom && void loadTables(selectedRoom)}
            >
              Retry
            </Button>
          </div>
        ) : tablesLoading ? (
          <Spinner message="Loading tables…" />
        ) : tableGroups.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-gray-500">
            <Square className="h-8 w-8" />
            <p className="text-sm">No tables found in this room.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {tableGroups.map((table) => {
              const order = activeOrders.get(table.name)
              const ownership = resolveOwnership(table, order)
              const mergePartners = getMergeGroupMembers(table, tables).filter((n) => n !== table.name)
              const { showMerge, showUnmerge } = getTableMergeActions(table, tables)
              const canTransferTable =
                table.occupied === 1 && getMergeGroupMembers(table, tables).length <= 1
              return (
                <CaptainTableCard
                  key={table.name}
                  table={table}
                  order={order}
                  ownership={ownership}
                  ownerName={ownership === 'mine' ? undefined : ownerNames.get(order?.waiter ?? '')}
                  mergePartners={mergePartners}
                  onTap={() => handleTableTap(table, order)}
                  menuOpen={menuOpenForTable === table.name}
                  onMenuOpenChange={(open) => setMenuOpenForTable(open ? table.name : null)}
                  onMerge={showMerge ? () => setMergeSource(table) : undefined}
                  onUnmerge={showUnmerge ? () => setUnmergeSource(table) : undefined}
                  canUnmerge={showUnmerge}
                  onTransferTable={
                    canTransferTable ? () => void handleOpenTransferTable(table) : undefined
                  }
                  onTransferCaptain={
                    canTransferCaptain ? () => handleOpenCaptainTransfer(table) : undefined
                  }
                  showCaptainTransfer={canTransferCaptain}
                />
              )
            })}
          </div>
        )}
      </div>

      {mergeSource && (
        <MultiSelectTableDialog
          open={Boolean(mergeSource)}
          onOpenChange={(open) => !open && setMergeSource(null)}
          sourceName={mergeSource.name}
          options={mergeOptions}
          onConfirm={async (names) => {
            // Table merge only — `merge_tables_batch` (never bill merge).
            await mergeTablesBatch(mergeSource.name, names)
            showToast.success('Tables merged')
            if (selectedRoom) void loadTables(selectedRoom)
          }}
          labels={{
            title: `Merge with ${mergeSource.name}`,
            description: 'Select free tables to merge',
            empty: 'No tables available',
            cancel: 'Cancel',
            confirm: 'Merge',
            merging: 'Merging…',
            done: 'Merged',
            selectedCount: (n) => `${n} selected`,
          }}
        />
      )}

      {unmergeSource && (
        <ConfirmDialog
          open={Boolean(unmergeSource)}
          onOpenChange={(open) => !open && setUnmergeSource(null)}
          title="Unmerge tables"
          description={`Unmerge ${getMergeGroupMembers(unmergeSource, tables).join(', ')}?`}
          confirmVariant="danger"
          confirmLabel="Unmerge"
          isSubmitting={unmergeSubmitting}
          onConfirm={async () => {
            setUnmergeSubmitting(true)
            try {
              await unmergeTables(unmergeSource.name)
              showToast.success('Tables unmerged')
              setUnmergeSource(null)
              if (selectedRoom) void loadTables(selectedRoom)
            } finally {
              setUnmergeSubmitting(false)
            }
          }}
        />
      )}

      <TablePickerDialog
        open={Boolean(transferSource)}
        onOpenChange={(open) => {
          if (!open) {
            setTransferSource(null)
            setTransferInvoiceName(null)
            setTransferDestinations([])
          }
        }}
        sourceName={transferSource?.name || ''}
        options={transferDestinations.map((t) => ({
          name: t.name,
          room: t.restaurant_room,
        }))}
        loading={transferLoading}
        onConfirm={async (newTable) => {
          if (!transferSource || !transferInvoiceName) return
          try {
            await tableTransfer(transferSource.name, newTable, transferInvoiceName)
            showToast.success('Table transferred')
            setTransferSource(null)
            setTransferInvoiceName(null)
            setTransferDestinations([])
            refreshSelectedRoom()
          } catch (e) {
            showToast.error(e instanceof Error ? e.message : 'Transfer failed')
            throw e
          }
        }}
        labels={{
          title: 'Transfer table',
          description: 'Pick a free destination table',
          currentLabel: 'Current table',
          searchPlaceholder: 'Search tables',
          empty: 'No free tables',
          cancel: 'Cancel',
          confirm: 'Transfer',
          loading: 'Loading…',
        }}
      />

      <UserPickerDialog
        open={Boolean(captainTransferSource)}
        onOpenChange={(open) => {
          if (!open) {
            setCaptainTransferSource(null)
            setCaptainSearch('')
            setCaptainOptions([])
          }
        }}
        options={captainOptions}
        loading={captainLoading}
        search={captainSearch}
        onSearchChange={setCaptainSearch}
        sourceValue={
          captainTransferSource
            ? ownerNames.get(captainTransferSource.currentCaptain) ??
              captainTransferSource.currentCaptain
            : undefined
        }
        onConfirm={async (newCaptain) => {
          if (!captainTransferSource) return
          try {
            await captainTransfer(
              captainTransferSource.currentCaptain,
              newCaptain,
              captainTransferSource.invoiceName
            )
            showToast.success('Captain transferred')
            setCaptainTransferSource(null)
            setCaptainSearch('')
            setCaptainOptions([])
            refreshSelectedRoom()
          } catch (e) {
            showToast.error(e instanceof Error ? e.message : 'Captain transfer failed')
            throw e
          }
        }}
        labels={{
          title: 'Transfer captain',
          description: 'Choose the new captain',
          searchPlaceholder: 'Search users',
          empty: 'No users found',
          cancel: 'Cancel',
          confirm: 'Transfer',
          loading: 'Loading…',
          currentLabel: 'Current captain',
        }}
      />

      <ConfirmDialog
        open={Boolean(pendingDestination)}
        onOpenChange={(open) => !open && setPendingDestination(null)}
        title="Discard unsent draft?"
        description={`You have unsent changes on ${draftLabel(draftTable ?? getDraftDestination())}. Open ${draftLabel(pendingDestination)} and discard the draft?`}
        confirmVariant="danger"
        confirmLabel="Discard & open"
        onConfirm={() => {
          discardDraft()
          const next = pendingDestination
          setPendingDestination(null)
          if (next) navigateToDestination(next)
        }}
      />
    </div>
  )
}

function draftLabel(destination: string | null | undefined): string {
  if (!destination) return 'another order'
  if (destination === 'takeaway') return 'Takeaway'
  return destination
}
