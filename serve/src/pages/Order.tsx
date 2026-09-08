import { apiErrorMessage } from '../lib/api-error'
import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronLeft, ClipboardList, Loader2, UtensilsCrossed } from 'lucide-react'
import {
  Button,
  CommentDialog,
  CustomerPicker,
  Spinner,
  TablePickerDialog,
  UserPickerDialog,
  ConfirmDialog,
  cn,
  showToast,
} from '@ury/ui'
import { formatCurrency } from '@ury/core'
import { useServeStore } from '../store/serve-store'
import { useRootStore, type RootState } from '../store/root-store'
import {
  captainTransfer,
  reprintKot,
  syncOrder,
  type SyncOrderRequest,
  tableTransfer,
} from '../lib/order-api'
import {
  classifySyncOutcome,
  mayClearReconcileGate,
  reconcileBannerCopy,
  type ReconcileReason,
} from '../lib/sync-outcome'
import { printOrder } from '../lib/print'
import { resolvePrintFormat } from '../lib/invoice-api'
import { getVacantTablesForBranch, type Table } from '../lib/table-api'
import { DINE_IN, TAKEAWAY } from '../data/order-types'
import { useTableOrderContext, type OrderDeltaLine } from '../hooks/useTableOrderContext'
import ServeMenu from '../components/ServeMenu'
import CaptainOrderLine from '../components/CaptainOrderLine'
import CaptainActionsMenu from '../components/CaptainActionsMenu'
import { canCancelOrder, cancelOrder } from '../lib/cancel-api'
import { getCustomerFavouriteItems } from '../lib/serve-extras-api'
import { addCustomer, searchCustomers } from '../lib/customer-api'
import { getBranchCaptains } from '../lib/captain-table-api'
import { parseMergedWith } from '../lib/table-utils'
import { useCaptainContext } from '../hooks/useCaptainContext'
import { getCaptainContext } from '../lib/captain-context-api'
import { SplitOrderDialog } from '../components/SplitOrderDialog'
import { canSplitBill } from '../lib/split-eligibility'
import { validateCartAgainstMenu } from '../lib/cart-validation'

type Mode = 'menu' | 'order'

function parseCustomer(row: { name: string; content?: string }) {
  return {
    id: row.name,
    name: row.content?.match(/Customer Name : ([^|]+)/)?.[1]?.trim() || row.name,
    phone: row.content?.match(/Mobile Number : ([^|]+)/)?.[1]?.trim() || '',
  }
}

export default function OrderPage() {
  const { table } = useParams<{ table: string }>()
  const navigate = useNavigate()
  const user = useRootStore((s: RootState) => s.user)
  const isTakeaway = !table || table === 'takeaway'
  const {
    capabilities,
    context: captainContext,
  } = useCaptainContext()
  const canTakeawayBilling = Boolean(capabilities?.canSettlePayment)

  const {
    context,
    permissions,
    isContextLoading,
    contextError,
    isOrderReady,
    alreadyOrderedLines,
    newOrChangedLines,
    reductionPendingLines,
    refetchContext,
    refreshContext,
  } = useTableOrderContext(isTakeaway ? undefined : table)

  const {
    activeOrders,
    menuItems,
    addToOrder,
    removeFromOrder,
    updateQuantity,
    updateItemComment,
    isUpdatingOrder,
    orderId,
    posProfile,
    orderComment,
    setOrderComment,
    noOfPax,
    setNoOfPax,
    lastModifiedTime,
    selectedRoom,
    selectedCustomer,
    setSelectedCustomer,
    clearTableOrder,
    loadTableOrder,
    isOrderInteractionDisabled,
    submitting,
    setSubmitting,
    selectedOrderType,
    startTakeaway,
    hasUnsentDraft,
  } = useServeStore()

  const [orderNoteOpen, setOrderNoteOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('order')
  const initializedTable = useRef<string | null>(null)
  const [noteLine, setNoteLine] = useState<OrderDeltaLine | null>(null)
  const [isActionsOpen, setIsActionsOpen] = useState(false)
  const [isReprintingKot, setIsReprintingKot] = useState(false)
  const [isPrintingBill, setIsPrintingBill] = useState(false)
  const [transferOpen, setTransferOpen] = useState(false)
  const [transferDestinations, setTransferDestinations] = useState<Table[]>([])
  const [transferLoading, setTransferLoading] = useState(false)
  const [captainOpen, setCaptainOpen] = useState(false)
  const [captainSearch, setCaptainSearch] = useState('')
  const [captainOptions, setCaptainOptions] = useState<Array<{ name: string; label: string }>>([])
  const [captainLoading, setCaptainLoading] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelAllowed, setCancelAllowed] = useState(false)
  const [customerResults, setCustomerResults] = useState<Array<{ id: string; name: string; phone: string }>>([])
  const [customerSearching, setCustomerSearching] = useState(false)
  const [favourites, setFavourites] = useState<Array<{ name: string; onSelect: () => void }>>([])
  const [splitOpen, setSplitOpen] = useState(false)
  const needsReconcile = useServeStore((state) => state.needsReconcile)
  const setNeedsReconcile = useServeStore((state) => state.setNeedsReconcile)
  const [reconcileDetail, setReconcileDetail] = useState('')
  const [reconcileReason, setReconcileReason] = useState<ReconcileReason>('uncertain')

  useEffect(() => {
    if (isTakeaway) {
      startTakeaway()
      setMode('menu')
    }
  }, [isTakeaway, startTakeaway])

  useEffect(() => {
    if (!table || !isOrderReady || isContextLoading || context?.table?.name !== table) return
    if (initializedTable.current === table) return
    initializedTable.current = table
    setMode(context.order ? 'order' : 'menu')
  }, [table, isOrderReady, isContextLoading, context])

  useEffect(() => {
    canCancelOrder().then(setCancelAllowed).catch(() => setCancelAllowed(false))
  }, [])

  useEffect(() => {
    if (!selectedCustomer?.id) {
      setFavourites([])
      return
    }
    getCustomerFavouriteItems(selectedCustomer.id)
      .then((items) => {
        setFavourites(
          (items as Array<{ item_name?: string; item?: string; item_code?: string }>).slice(0, 8).map((fav) => {
            const code = fav.item_code || fav.item || ''
            const label = fav.item_name || code || 'Favourite'
            return {
              name: label,
              onSelect: () => {
                const menuItem = menuItems.find((m) => m.item === code || m.id === code)
                if (!menuItem || menuItem.disabled) {
                  showToast.error(menuItem?.disabled ? `${label} is unavailable` : `${label} is not on this menu`)
                  return
                }
                void addToOrder({ ...menuItem, quantity: 1 })
                showToast.success(`Added ${menuItem.name}`)
              },
            }
          })
        )
      })
      .catch(() => setFavourites([]))
  }, [selectedCustomer?.id, menuItems, addToOrder])

  useEffect(() => {
    if (!captainOpen) return
    let cancelled = false
    setCaptainLoading(true)
    const branchName = posProfile?.branch
    if (!branchName) {
      setCaptainOptions([])
      setCaptainLoading(false)
      return
    }
    getBranchCaptains(branchName, {
      search: captainSearch,
      exclude: user?.name,
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
  }, [captainOpen, captainSearch, user?.name, posProfile?.branch])

  const total = activeOrders.reduce((sum, item) => sum + item.price * item.quantity, 0)
  const isInteractionDisabled = isOrderInteractionDisabled() || submitting || needsReconcile
  const canView = isTakeaway ? canTakeawayBilling : (permissions?.view ?? false)
  const canModify = isTakeaway ? canTakeawayBilling : (permissions?.modify ?? false)
  const profileAllowsRemove = Boolean(captainContext?.pos_profile?.remove_items)
  const canReduce = isTakeaway ? profileAllowsRemove : (permissions?.reduce_items ?? false)
  const canRemove = isTakeaway ? profileAllowsRemove : (permissions?.remove_items ?? false)
  const invoiceId = orderId ?? context?.order?.name ?? null
  const splitServerItems = context?.order?.items ?? []
  const splitEligible =
    Boolean(invoiceId) && canSplitBill(context?.order, splitServerItems, invoiceId)

  const handleOpenSplit = () => {
    if (submitting || needsReconcile || !invoiceId) return
    if (hasUnsentDraft()) {
      showToast.error('Update the order before splitting.')
      return
    }
    if (!splitEligible) {
      showToast.error('This bill cannot be split')
      return
    }
    setSplitOpen(true)
    // Silent refresh so the open Split dialog is not unmounted by isContextLoading.
    void refreshContext().then((fresh) => {
      if (!fresh) {
        showToast.error('Could not refresh order items. Review quantities before splitting.')
      }
    })
  }

  const enterReconcileGate = (reason: ReconcileReason, toastMessage: string) => {
    setReconcileReason(reason)
    setReconcileDetail(toastMessage)
    setNeedsReconcile(true)
    showToast.error(toastMessage)
  }

  /** Table only: replace local draft with server order after an explicit user action. */
  const reconcileFromServer = async () => {
    if (isTakeaway || !table) {
      showToast.error('Cannot reload takeaway from a table. Verify in POS, then leave without resending.')
      return
    }
    try {
      setSubmitting(true)
      await refetchContext()
      await loadTableOrder(table, { force: true })
      if (!mayClearReconcileGate({ isTakeaway: false, reloadSucceeded: true })) {
        return
      }
      setNeedsReconcile(false)
      showToast.success('Order reloaded from server. Review before sending again.')
    } catch (error) {
      // Fail closed: keep gate + draft
      showToast.error(error instanceof Error ? error.message : 'Failed to reload order. Draft kept.')
    } finally {
      setSubmitting(false)
    }
  }

  const leaveWithoutResending = () => {
    clearTableOrder()
    setNeedsReconcile(false)
    navigate('/')
  }

  const handleSend = async () => {
    if (submitting || needsReconcile) return
    try {
      if (!posProfile || !user?.name) {
        showToast.error('Session or POS profile missing.')
        return
      }
      if (isTakeaway && !canTakeawayBilling) {
        showToast.error('Takeaway requires billing permission.')
        return
      }
      if (!canModify) {
        showToast.error('You cannot modify this order.')
        return
      }
      if (activeOrders.length === 0) {
        showToast.error('Add at least one item.')
        return
      }
      if (!selectedCustomer?.id) {
        showToast.error('Select a customer first.')
        return
      }
      if (!isTakeaway && (!Number.isInteger(noOfPax) || noOfPax < 1)) {
        showToast.error('Enter number of guests.')
        return
      }

      const menuCheck = validateCartAgainstMenu(activeOrders, menuItems)
      if (!menuCheck.ok) {
        showToast.error(menuCheck.message)
        return
      }

      // Opening preflight + fresh modify permission (table only). Do not use
      // useCaptainContext().refetch — its isLoading unmounts Order via ServeRouteGuard.
      const openingPreflight = getCaptainContext()
        .then((ctx) => ({ ok: true as const, ctx }))
        .catch(() => ({ ok: false as const }))

      if (isTakeaway) {
        const opening = await openingPreflight
        if (opening.ok && opening.ctx.opening_state?.pos_open === false) {
          showToast.error('POS is closed. Ask a cashier or manager to open it.')
          return
        }
        // Reject / null opening_state: proceed — server is authoritative; blocking on a
        // transient network blip would be worse than the existing reconcile gate.
      } else {
        const [opening, freshContext] = await Promise.all([openingPreflight, refreshContext()])
        if (opening.ok && opening.ctx.opening_state?.pos_open === false) {
          showToast.error('POS is closed. Ask a cashier or manager to open it.')
          return
        }
        // Reject / null opening_state: proceed — server is authoritative; blocking on a
        // transient network blip would be worse than the existing reconcile gate.
        if (freshContext && !freshContext.permissions.modify) {
          showToast.error('This order is no longer yours to edit.')
          return
        }
      }

      setSubmitting(true)

      const orderData: SyncOrderRequest = {
        items: activeOrders.map((item) => ({
          item: item.id,
          item_name: item.name,
          rate: item.selectedVariant?.price || item.price,
          qty: item.quantity,
          comment: item.comment || undefined,
        })),
        no_of_pax: noOfPax,
        pos_profile: posProfile.name,
        order_type: isTakeaway ? selectedOrderType || TAKEAWAY : DINE_IN,
        table: isTakeaway ? undefined : table,
        room: selectedRoom || undefined,
        customer: selectedCustomer.id,
        cashier: posProfile.cashier,
        owner: posProfile.owner,
        mode_of_payment: 'Cash',
        last_invoice: isUpdatingOrder ? orderId : null,
        last_modified_time: isUpdatingOrder ? lastModifiedTime || undefined : undefined,
        invoice: isUpdatingOrder ? orderId : null,
        waiter: user.name,
        comments: orderComment ?? '',
      }

      let result: Awaited<ReturnType<typeof syncOrder>>
      try {
        result = await syncOrder(orderData)
      } catch (error) {
        enterReconcileGate(
          'uncertain',
          apiErrorMessage(error, 'Send result unclear. Do not resend until verified.')
        )
        return
      }

      const outcome = classifySyncOutcome(result)
      if (outcome.kind === 'failure') {
        enterReconcileGate(
          'failure',
          isTakeaway
            ? 'Send failed. Do not resend — verify in POS, then leave.'
            : 'Send failed. Draft kept — reload from server when ready.'
        )
        return
      }
      if (outcome.kind === 'uncertain') {
        enterReconcileGate(
          'uncertain',
          isTakeaway
            ? 'Send result unclear. Do not resend — verify in POS, then leave.'
            : 'Send result unclear. Draft kept — reload before sending again.'
        )
        return
      }

      // Success only when backend returned invoice.as_dict() with name
      clearTableOrder()
      showToast.success(isUpdatingOrder ? 'Order updated.' : 'Order sent to kitchen.')
      navigate('/')
    } catch (error) {
      console.error(error)
      enterReconcileGate(
        'uncertain',
        error instanceof Error ? error.message : 'Failed to send order.'
      )
    } finally {
      setSubmitting(false)
    }
  }

  const lineImageUrl = (itemCode: string) => {
    const match = menuItems.find((m) => m.item === itemCode || m.id === itemCode)
    return match?.image ?? null
  }

  const renderOrderList = () => (
    <div className="space-y-4 p-3">
      {canModify && (
        <CustomerPicker
          value={selectedCustomer}
          onChange={setSelectedCustomer}
          results={customerResults}
          searching={customerSearching}
          favourites={favourites}
          onSearch={(query) => {
            if (!query.trim()) {
              setCustomerResults([])
              return
            }
            setCustomerSearching(true)
            searchCustomers(query)
              .then((rows) => setCustomerResults(rows.map(parseCustomer)))
              .catch(() => setCustomerResults([]))
              .finally(() => setCustomerSearching(false))
          }}
          onCreate={async ({ name, phone }) => {
            const response = await addCustomer({ customer_name: name, mobile_number: phone })
            const created = response.data
            if (!created.name) {
              throw new Error('Customer created without document id')
            }
            return {
              id: created.name,
              name: created.customer_name,
              phone: created.mobile_number,
            }
          }}
          disabled={isInteractionDisabled}
          labels={{
            placeholder: 'Search customer',
            addNew: 'Add customer',
            nameLabel: 'Name',
            phoneLabel: 'Phone',
            addButton: 'Add',
            adding: 'Adding…',
            cancel: 'Cancel',
            changeLabel: 'Change',
            noResults: 'No customers found',
            searching: 'Searching…',
            createTitle: 'New customer',
          }}
        />
      )}

      {canModify && !isTakeaway && (
        <div className="flex items-center justify-between rounded-lg border border-border bg-white px-3 py-3">
          <span className="text-sm font-medium text-gray-700">Pax</span>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setNoOfPax(Math.max(1, noOfPax - 1))}
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full"
              disabled={isInteractionDisabled}
            >
              -
            </Button>
            <span className="w-6 text-center">{noOfPax}</span>
            <Button
              onClick={() => setNoOfPax(Math.min(50, noOfPax + 1))}
              variant="outline"
              size="icon"
              className="h-11 w-11 rounded-full"
              disabled={isInteractionDisabled}
            >
              +
            </Button>
          </div>
        </div>
      )}

      {canModify && (
        <Button variant="outline" className="w-full justify-start" disabled={isInteractionDisabled} onClick={() => setOrderNoteOpen(true)}>
          <span className="truncate">{orderComment ? `Order note: ${orderComment}` : 'Add order note'}</span>
        </Button>
      )}

      {activeOrders.length === 0 && alreadyOrderedLines.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center">
          <ClipboardList className="mb-3 h-10 w-10 text-gray-300" />
          <p className="text-sm text-gray-500">No items yet.</p>
        </div>
      ) : (
        <>
          {alreadyOrderedLines.map((line) => (
            <CaptainOrderLine
              key={`c-${line.uniqueId}`}
              line={line}
              variant="confirmed"
              disabled={isInteractionDisabled}
              imageUrl={lineImageUrl(line.id)}
              onIncrement={canModify ? () => updateQuantity(line.uniqueId, line.curQty + 1) : undefined}
              onDecrement={canModify && canReduce ? () => updateQuantity(line.uniqueId, Math.max(canRemove ? 0 : 1, line.curQty - 1)) : undefined}
              onRemove={canModify && canRemove ? () => removeFromOrder(line.uniqueId) : undefined}
              removeBlocked={canModify && !canRemove}
              onEditNote={canModify ? () => setNoteLine(line) : undefined}
            />
          ))}
          {newOrChangedLines.map((line) => (
            <CaptainOrderLine
              key={`n-${line.uniqueId}`}
              line={line}
              variant="delta"
              disabled={isInteractionDisabled}
              imageUrl={lineImageUrl(line.id)}
              onIncrement={() => updateQuantity(line.uniqueId, line.curQty + 1)}
              onDecrement={() => {
                if (line.curQty <= 1) removeFromOrder(line.uniqueId)
                else updateQuantity(line.uniqueId, line.curQty - 1)
              }}
              onEditNote={() => setNoteLine(line)}
            />
          ))}
          {reductionPendingLines.map((line) => (
            <CaptainOrderLine
              key={`r-${line.uniqueId}`}
              line={line}
              variant="reduction"
              disabled={isInteractionDisabled}
              imageUrl={lineImageUrl(line.id)}
              onRestore={() => updateQuantity(line.uniqueId, Math.min(line.curQty + 1, line.baseQty))}
            />
          ))}
        </>
      )}
    </div>
  )

  if (!isTakeaway && (isContextLoading || !isOrderReady)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <Spinner message="Loading table…" />
      </div>
    )
  }

  if (!isTakeaway && contextError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <p className="mb-2 text-lg font-semibold text-red-600">Unable to load this table</p>
          <p className="text-sm text-gray-600">{contextError}</p>
          <Button onClick={() => navigate('/')} variant="outline" className="mt-4">
            Back
          </Button>
        </div>
      </div>
    )
  }

  if (isTakeaway && !canTakeawayBilling) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="mb-2 text-lg font-semibold">Takeaway not permitted</p>
          <p className="text-sm text-gray-600">
            Takeaway orders require a billing role on this POS profile.
          </p>
          <Button onClick={() => navigate('/')} variant="outline" className="mt-4">
            Back
          </Button>
        </div>
      </div>
    )
  }

  if (!canView) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="max-w-sm text-center">
          <p className="mb-2 text-lg font-semibold">Not permitted</p>
          <Button onClick={() => navigate('/')} variant="outline" className="mt-4">
            Back
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <div className="sticky top-0 z-20 flex items-center justify-between border-b border-border bg-white px-3 py-3">
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/')} variant="ghost" size="icon" aria-label="Back">
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="font-semibold leading-tight text-gray-900">
              {isTakeaway ? 'Takeaway' : `Table ${table}`}
            </h1>
            <p className="text-xs text-gray-500">{isUpdatingOrder ? 'Updating order' : 'New order'}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canModify && (
            <div className="flex items-center gap-1 rounded-full bg-gray-100 p-1 lg:hidden">
              <button
                type="button"
                onClick={() => setMode('menu')}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium',
                  mode === 'menu' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                )}
              >
                <UtensilsCrossed className="h-4 w-4" />
                Menu
              </button>
              <button
                type="button"
                onClick={() => setMode('order')}
                className={cn(
                  'flex min-h-11 items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium',
                  mode === 'order' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-600'
                )}
              >
                <ClipboardList className="h-4 w-4" />
                Order
              </button>
            </div>
          )}
          {!isTakeaway && (
            <CaptainActionsMenu
              isOpen={isActionsOpen}
              onOpenChange={setIsActionsOpen}
              showReprintKot={permissions?.reprint_kot}
              onReprintKot={async () => {
                if (!invoiceId || submitting) return
                setIsReprintingKot(true)
                try {
                  await reprintKot(invoiceId)
                  showToast.success('KOT reprinted')
                } catch (e) {
                  showToast.error(e instanceof Error ? e.message : 'KOT reprint failed')
                } finally {
                  setIsReprintingKot(false)
                }
              }}
              isReprintingKot={isReprintingKot}
              showTransferTable={
                Boolean(permissions?.transfer_table) &&
                parseMergedWith(context?.order?.custom_merged_tables).length === 0
              }
              onTransferTable={async () => {
                if (submitting || !invoiceId || !table || !posProfile?.branch) return
                if (parseMergedWith(context?.order?.custom_merged_tables).length > 0) {
                  showToast.error('Unmerge tables before transferring')
                  return
                }
                setTransferLoading(true)
                setTransferOpen(true)
                try {
                  setTransferDestinations(await getVacantTablesForBranch(posProfile.branch, table))
                } catch (e) {
                  setTransferOpen(false)
                  showToast.error(e instanceof Error ? e.message : 'Failed to load tables')
                } finally {
                  setTransferLoading(false)
                }
              }}
              showTransferCaptain={permissions?.transfer_captain}
              onTransferCaptain={() => setCaptainOpen(true)}
              showPrintBill={permissions?.print_bill}
              onPrintBill={async () => {
                if (!invoiceId || !posProfile || submitting) return
                setIsPrintingBill(true)
                try {
                  await printOrder({
                    orderId: invoiceId,
                    posProfile,
                    printFormat: resolvePrintFormat(context?.order ?? {}, posProfile.print_format),
                  })
                  showToast.success('Printed')
                  const refreshed = await refreshContext()
                  if (!refreshed) {
                    showToast.error(
                      'Printed, but could not refresh permissions. Reload the table.'
                    )
                  }
                } catch (e) {
                  showToast.error(e instanceof Error ? e.message : 'Print failed')
                } finally {
                  setIsPrintingBill(false)
                }
              }}
              isPrintingBill={isPrintingBill}
            />
          )}
        </div>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden lg:hidden">
        {canModify && mode === 'menu' ? <ServeMenu canAddItems={canModify && !isInteractionDisabled} canReduce={canReduce} canRemove={canRemove} /> : renderOrderList()}
      </div>

      <div className="hidden flex-1 overflow-hidden lg:flex lg:flex-col">
        <div className="flex flex-1 gap-4 overflow-hidden p-3">
          {canModify && (
            <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-white">
              <ServeMenu canAddItems={canModify && !isInteractionDisabled} canReduce={canReduce} canRemove={canRemove} />
            </div>
          )}
          <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-border bg-white">
            {renderOrderList()}
          </div>
        </div>
      </div>

      {canModify && (
        <div className="sticky bottom-0 space-y-2 border-t border-border bg-white p-3">
          {needsReconcile && (() => {
            const copy = reconcileBannerCopy({ isTakeaway, reason: reconcileReason })
            return (
              <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between">
                <span>{reconcileDetail && <strong className="block">{reconcileDetail}</strong>}{copy.title}</span>
                {copy.action === 'reload' ? (
                  <Button size="sm" variant="outline" onClick={() => void reconcileFromServer()} disabled={submitting}>
                    Reload from server
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={leaveWithoutResending} disabled={submitting}>
                    Leave without resending
                  </Button>
                )}
              </div>
            )
          })()}
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-gray-700">Total</span>
            <span className="text-lg font-semibold">{formatCurrency(total)}</span>
          </div>
          <div className="flex gap-2">
            {cancelAllowed && invoiceId && (
              <Button variant="outline" onClick={() => setCancelOpen(true)} disabled={submitting}>
                Cancel
              </Button>
            )}
            {invoiceId && (isTakeaway ? canModify : permissions?.modify) && (
              <Button
                variant="outline"
                onClick={handleOpenSplit}
                disabled={submitting || needsReconcile || !splitEligible}
              >
                Split
              </Button>
            )}
            <Button
              className="flex-1"
              size="lg"
              onClick={mode === 'menu' ? () => setMode('order') : handleSend}
              disabled={isInteractionDisabled || activeOrders.length === 0}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </span>
              ) : mode === 'menu' ? (
                'Review Order'
              ) : isUpdatingOrder ? (
                'Update Order'
              ) : (
                'Send Order'
              )}
            </Button>
          </div>
        </div>
      )}

      <CommentDialog
        open={orderNoteOpen}
        onOpenChange={setOrderNoteOpen}
        onSave={setOrderComment}
        initialComment={orderComment}
        title="Order note"
        label="Comment"
        placeholder="Instructions for this order…"
        cancelLabel="Cancel"
        saveLabel="Save"
      />

      <CommentDialog
        open={noteLine !== null}
        onOpenChange={(open) => !open && setNoteLine(null)}
        onSave={(comment) => {
          if (noteLine) updateItemComment(noteLine.uniqueId, comment)
        }}
        initialComment={noteLine?.comment || ''}
        title="Item note"
        label="Comment"
        placeholder="Kitchen note…"
        cancelLabel="Cancel"
        saveLabel="Save"
      />

      <TablePickerDialog
        open={transferOpen}
        onOpenChange={setTransferOpen}
        sourceName={table || ''}
        options={transferDestinations.map((t) => ({
          name: t.name,
          room: t.restaurant_room,
        }))}
        loading={transferLoading}
        onConfirm={async (newTable) => {
          if (!table || !invoiceId || submitting) return
          const fresh = await refreshContext()
          if (fresh && !fresh.permissions.transfer_table) {
            showToast.error('You can no longer transfer this table.')
            return
          }
          setSubmitting(true)
          try {
            await tableTransfer(table, newTable, invoiceId)
            clearTableOrder()
            showToast.success('Table transferred')
            navigate('/')
          } catch (e) {
            showToast.error(e instanceof Error ? e.message : 'Transfer failed')
          } finally {
            setSubmitting(false)
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
        open={captainOpen}
        onOpenChange={setCaptainOpen}
        options={captainOptions}
        loading={captainLoading}
        search={captainSearch}
        onSearchChange={setCaptainSearch}
        onConfirm={async (newCaptain) => {
          if (!invoiceId || submitting) return
          const fresh = await refreshContext()
          if (fresh && !fresh.permissions.transfer_captain) {
            showToast.error('You can no longer transfer this order.')
            return
          }
          setSubmitting(true)
          try {
            await captainTransfer(
              context?.assignment?.waiter || context?.order?.waiter || user?.name || '',
              newCaptain,
              invoiceId
            )
            clearTableOrder()
            showToast.success('Captain transferred')
            navigate('/')
          } catch (e) {
            showToast.error(e instanceof Error ? e.message : 'Captain transfer failed')
          } finally {
            setSubmitting(false)
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
        }}
      />

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel order"
        description="This cancels the draft invoice and frees the table."
        confirmVariant="danger"
        confirmLabel="Cancel order"
        onConfirm={async () => {
          if (!invoiceId || submitting) return
          setSubmitting(true)
          try {
            await cancelOrder(invoiceId, 'Cancelled from Serve')
            clearTableOrder()
            showToast.success('Order cancelled')
            navigate('/')
          } catch (e) {
            showToast.error(e instanceof Error ? e.message : 'Cancel failed')
          } finally {
            setSubmitting(false)
          }
        }}
      />

      {invoiceId && (
        <SplitOrderDialog
          open={splitOpen}
          onOpenChange={setSplitOpen}
          invoiceId={invoiceId}
          items={splitServerItems.map((item) => ({
            name: item.name,
            item_name: item.item_name,
            qty: item.qty,
            item_code: item.item_code,
            rate: item.rate,
          }))}
          customerId={selectedCustomer?.id}
          onSuccess={() => {
            showToast.success('Bill split')
            clearTableOrder()
            navigate('/')
          }}
        />
      )}
    </div>
  )
}
