import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronLeft, ClipboardList, Loader2, UtensilsCrossed } from 'lucide-react';
import { Button, Spinner, cn, showToast } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import { usePOSStore } from '../../store/pos-store';
import { useRootStore, RootState } from '../../store/root-store';
import {
  captainTransfer,
  reprintKot,
  syncOrder,
  SyncOrderRequest,
  tableTransfer,
} from '../../lib/order-api';
import { printOrder } from '../../lib/print';
import { resolvePrintFormat } from '../../lib/invoice-api';
import { getVacantTablesForBranch, Table } from '../../lib/table-api';
import { DINE_IN } from '../../data/order-types';
import { useTableOrderContext, OrderDeltaLine } from '../hooks/useTableOrderContext';
import CaptainMenu from '../components/CaptainMenu';
import CaptainOrderLine from '../components/CaptainOrderLine';
import CaptainActionsMenu from '../components/CaptainActionsMenu';
import ProductDialog from '../../components/ProductDialog';
import CommentDialog from '../../components/CommentDialog';
import TableTransferDialog from '../../components/TableTransferDialog';
import CaptainTransferDialog from '../../components/CaptainTransferDialog';
import { CustomerSelect } from '../../components/CustomerSelect';

type Mode = 'menu' | 'order';

/**
 * Captain order screen (PLAN.md §7/§8): menu-vs-current-order toggle
 * (mobile-first, one task per screen — no fixed side panel like the
 * Cashier `OrderPanel`), delta-aware order grouping, and Send/Update.
 *
 * Per-table authorization comes from `get_table_order_context()` via
 * `useTableOrderContext` — NOT from `useCaptainContext()`'s session-level
 * `capabilities`, which know nothing about ownership/billed-state for this
 * specific table. This screen re-checks `permissions.view`/`modify` itself
 * (belt-and-suspenders) rather than trusting that `CaptainTables.tsx`'s tap
 * guard was airtight.
 */
export default function CaptainOrder() {
  const { table } = useParams<{ table: string }>();
  const navigate = useNavigate();
  const user = useRootStore((state: RootState) => state.user);

  const {
    context,
    permissions,
    isContextLoading,
    contextError,
    isOrderReady,
    alreadyOrderedLines,
    newOrChangedLines,
    reductionPendingLines,
  } = useTableOrderContext(table);

  const {
    activeOrders,
    removeFromOrder,
    updateQuantity,
    updateItemComment,
    setSelectedItem,
    isUpdatingOrder,
    orderId,
    posProfile,
    paymentModes,
    orderComment,
    noOfPax,
    setNoOfPax,
    lastModifiedTime,
    selectedRoom,
    selectedCustomer,
    clearTableOrder,
    isOrderInteractionDisabled,
  } = usePOSStore();

  const [mode, setMode] = useState<Mode>('order');
  const [hasSetInitialMode, setHasSetInitialMode] = useState(false);
  const [editingItemUniqueId, setEditingItemUniqueId] = useState<string | null>(null);
  const [noteEditingLine, setNoteEditingLine] = useState<OrderDeltaLine | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Secondary actions (PLAN.md §5/§6/§10): overflow menu state + the two
  // picker dialogs, reused as-is from the Cashier `Table.tsx` flow.
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [isReprintingKot, setIsReprintingKot] = useState(false);
  const [isPrintingBill, setIsPrintingBill] = useState(false);
  const [isTransferTableOpen, setIsTransferTableOpen] = useState(false);
  const [transferDestinations, setTransferDestinations] = useState<Table[]>([]);
  const [isTransferDestinationsLoading, setIsTransferDestinationsLoading] = useState(false);
  const [isTransferCaptainOpen, setIsTransferCaptainOpen] = useState(false);

  // Default to the Order view for a table that already has a baseline
  // order, Menu for a fresh table — matches PLAN §5 ("free table: menu
  // opens directly" / "occupied + mine: open with existing order loaded").
  useEffect(() => {
    if (hasSetInitialMode || !isOrderReady) return;
    setMode(alreadyOrderedLines.length > 0 || reductionPendingLines.length > 0 ? 'order' : 'menu');
    setHasSetInitialMode(true);
  }, [hasSetInitialMode, isOrderReady, alreadyOrderedLines.length, reductionPendingLines.length]);

  const editingItem = useMemo(
    () => (editingItemUniqueId ? activeOrders.find((i) => i.uniqueId === editingItemUniqueId) ?? null : null),
    [editingItemUniqueId, activeOrders]
  );

  const total = activeOrders.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const isInteractionDisabled = isOrderInteractionDisabled() || isSubmitting;

  const canView = permissions?.view ?? false;
  const canModify = permissions?.modify ?? false;
  const canReduce = permissions?.reduce_items ?? false;
  const canRemove = permissions?.remove_items ?? false;

  const handleDeltaIncrement = (line: OrderDeltaLine) => {
    if (isInteractionDisabled) return;
    updateQuantity(line.uniqueId, line.curQty + 1);
  };

  const handleDeltaDecrement = (line: OrderDeltaLine) => {
    if (isInteractionDisabled) return;
    const newQty = line.curQty - 1;
    if (newQty <= 0) removeFromOrder(line.uniqueId);
    else updateQuantity(line.uniqueId, newQty);
  };

  const handleConfirmedReduce = (line: OrderDeltaLine) => {
    if (isInteractionDisabled) return;
    // reduce_items (without remove_items) only scales the line down, it
    // never fully removes it — that requires remove_items (the Trash
    // control below).
    const floor = canRemove ? 0 : 1;
    const newQty = Math.max(floor, line.curQty - 1);
    if (newQty <= 0) removeFromOrder(line.uniqueId);
    else updateQuantity(line.uniqueId, newQty);
  };

  const handleConfirmedRemove = (line: OrderDeltaLine) => {
    if (isInteractionDisabled) return;
    removeFromOrder(line.uniqueId);
  };

  const handleRestoreReduction = (line: OrderDeltaLine) => {
    if (isInteractionDisabled) return;
    const restored = Math.min(line.curQty + 1, line.baseQty);
    updateQuantity(line.uniqueId, restored);
  };

  const handleEditNewOrChanged = (line: OrderDeltaLine) => {
    if (isInteractionDisabled) return;
    const item = activeOrders.find((i) => i.uniqueId === line.uniqueId);
    if (!item) return;
    setSelectedItem({ ...item, variants: item.variants, addons: item.addons });
    setEditingItemUniqueId(item.uniqueId!);
  };

  const handleEditConfirmedNote = (line: OrderDeltaLine) => {
    if (isInteractionDisabled || !canModify) return;
    setNoteEditingLine(line);
  };

  const handleSaveConfirmedNote = (comment: string) => {
    if (noteEditingLine) {
      updateItemComment(noteEditingLine.uniqueId, comment);
    }
    setNoteEditingLine(null);
  };

  const handleSend = async () => {
    if (!table) return;
    try {
      if (!posProfile) {
        showToast.error('POS profile not found.');
        return;
      }
      if (!user?.name) {
        showToast.error('You are not logged in.');
        return;
      }
      if (!canModify) {
        showToast.error('You do not have permission to modify this order.');
        return;
      }
      if (activeOrders.length === 0) {
        showToast.error('Add at least one item before sending the order.');
        return;
      }
      // sync_order requires `customer` as a hard backend parameter (found via
      // live E2E test — a 500 "missing 1 required positional argument:
      // 'customer'" — not just a Cashier-UI convention). Match OrderPanel's
      // exact validate-before-submit gate rather than only omitting the field.
      if (!selectedCustomer?.name) {
        showToast.error('Please select a customer before sending the order.');
        return;
      }

      setIsSubmitting(true);

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
        order_type: DINE_IN,
        table,
        room: selectedRoom || undefined,
        customer: selectedCustomer.name,
        cashier: posProfile.cashier,
        owner: posProfile.owner,
        mode_of_payment: paymentModes[0],
        last_invoice: isUpdatingOrder ? orderId : null,
        last_modified_time: isUpdatingOrder ? (lastModifiedTime || undefined) : undefined,
        invoice: isUpdatingOrder ? orderId : null,
        waiter: user.name,
        comments: orderComment || undefined,
      };

      const result = await syncOrder(orderData);

      if (result?.message && typeof result.message === 'object' && 'status' in result.message && result.message.status === 'Failure') {
        showToast.error(
          isUpdatingOrder
            ? 'This order was modified by someone else. Please reopen the table and try again.'
            : 'Failed to send the order. Please try again.'
        );
        return;
      }

      clearTableOrder();
      showToast.success(isUpdatingOrder ? 'Order updated.' : 'Order sent to kitchen.');
      navigate('/pos/order');
    } catch (error) {
      console.error('Failed to sync order:', error);
      const serverMessages =
        error && typeof error === 'object' && '_server_messages' in error
          ? (error as { _server_messages?: unknown })._server_messages
          : undefined;
      if (typeof serverMessages === 'string') {
        try {
          const messages = JSON.parse(serverMessages);
          const messageObj = JSON.parse(messages[0]);
          showToast.error(messageObj.message || 'API error');
        } catch {
          showToast.error('API error');
        }
      } else if (error instanceof Error) {
        showToast.error(error.message);
      } else {
        showToast.error('Failed to send the order.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  // Secondary actions operate on the confirmed/baseline invoice for this
  // table (not the in-progress working cart) — `orderId` from `pos-store`
  // (kept in sync with `context.order.name` by `useTableOrderContext`) is
  // the source of truth, matching what `handleSend`'s `last_invoice` uses.
  const invoiceId = orderId ?? context?.order?.name ?? null;
  const canReprintKot = permissions?.reprint_kot ?? false;
  const canTransferTable = permissions?.transfer_table ?? false;
  const canTransferCaptain = permissions?.transfer_captain ?? false;
  const canPrintBill = permissions?.print_bill ?? false;

  const handleReprintKot = async () => {
    if (!invoiceId) {
      showToast.error('No active order to reprint.');
      return;
    }
    setIsReprintingKot(true);
    try {
      await reprintKot(invoiceId);
      showToast.success('KOT reprinted.');
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to reprint KOT.');
    } finally {
      setIsReprintingKot(false);
    }
  };

  const handlePrintBill = async () => {
    if (!invoiceId) {
      showToast.error('No active order to print.');
      return;
    }
    if (!posProfile) {
      showToast.error('POS profile not found.');
      return;
    }
    setIsPrintingBill(true);
    try {
      await printOrder({
        orderId: invoiceId,
        posProfile,
        printFormat: resolvePrintFormat(context?.order ?? {}, posProfile.print_format),
      });
      showToast.success('Printed successfully.');
    } catch (error) {
      showToast.error(error instanceof Error ? error.message : 'Failed to print bill.');
    } finally {
      setIsPrintingBill(false);
    }
  };

  const handleOpenTransferTable = async () => {
    if (!invoiceId || !table) {
      showToast.error('No active order to transfer.');
      return;
    }
    const branch = posProfile?.branch;
    if (!branch) {
      showToast.error('Unable to transfer this table.');
      return;
    }
    setTransferDestinations([]);
    setIsTransferDestinationsLoading(true);
    setIsTransferTableOpen(true);
    try {
      const destinations = await getVacantTablesForBranch(branch, table);
      setTransferDestinations(destinations);
    } catch (error) {
      setIsTransferTableOpen(false);
      showToast.error(error instanceof Error ? error.message : 'Failed to load destination tables.');
    } finally {
      setIsTransferDestinationsLoading(false);
    }
  };

  const handleTableTransferConfirm = async (newTable: string) => {
    if (!table || !invoiceId) return;
    await tableTransfer(table, newTable, invoiceId);
    clearTableOrder();
    showToast.success('Table transferred.');
    navigate('/pos/order');
  };

  const currentCaptain = context?.assignment?.waiter ?? '';

  const handleOpenTransferCaptain = () => {
    if (!invoiceId) {
      showToast.error('No active order to transfer.');
      return;
    }
    setIsTransferCaptainOpen(true);
  };

  const handleCaptainTransferConfirm = async (newCaptain: string) => {
    if (!invoiceId) return;
    await captainTransfer(currentCaptain, newCaptain, invoiceId);
    clearTableOrder();
    showToast.success('Captain transferred.');
    navigate('/pos/order');
  };

  const MIN_PAX = 1;
  const MAX_PAX = 50;

  // Render order list content — shared between mobile toggle view and tablet side pane
  const OrderListContent = () => (
    <div className="flex-1 overflow-y-auto p-3 space-y-5 pb-32">
      {canModify && (
        // sync_order requires customer server-side (§handleSend) — surfaced
        // here so a Captain can satisfy it before hitting the send-time
        // validation error. Reused as-is from the Cashier OrderPanel.
        <CustomerSelect disabled={isInteractionDisabled} />
      )}

      {!canModify && (
        <div className="flex items-center justify-between bg-white border border-border rounded-lg px-3 py-3">
          <span className="text-sm font-medium text-muted-foreground">Pax</span>
          <span className="text-sm text-foreground">{noOfPax}</span>
        </div>
      )}

      {canModify && (
        <div className="flex items-center justify-between bg-white border border-border rounded-lg px-3 py-3">
          <span className="text-sm font-medium text-muted-foreground">Pax</span>
          <div className="flex items-center gap-3">
            <Button
              onClick={() => setNoOfPax(Math.max(MIN_PAX, noOfPax - 1))}
              variant="outline"
              size="icon"
              className="w-8 h-8 rounded-full"
              disabled={isInteractionDisabled || noOfPax <= MIN_PAX}
            >
              -
            </Button>
            <span className="w-6 text-center">{noOfPax}</span>
            <Button
              onClick={() => setNoOfPax(Math.min(MAX_PAX, noOfPax + 1))}
              variant="outline"
              size="icon"
              className="w-8 h-8 rounded-full"
              disabled={isInteractionDisabled || noOfPax >= MAX_PAX}
            >
              +
            </Button>
          </div>
        </div>
      )}

      {activeOrders.length === 0 && alreadyOrderedLines.length === 0 ? (
        <div className="flex flex-col items-center justify-center text-center py-16">
          <ClipboardList className="w-10 h-10 text-text-tertiary mb-3" />
          <p className="text-text-tertiary text-sm">No items yet.</p>
          {canModify && (
            <Button onClick={() => setMode('menu')} variant="outline" size="sm" className="mt-3 lg:hidden">
              Browse menu
            </Button>
          )}
        </div>
      ) : (
        <>
          {alreadyOrderedLines.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wide mb-2 px-1">
                Already Ordered
              </h2>
              <div className="space-y-2">
                {alreadyOrderedLines.map((line) => (
                  <CaptainOrderLine
                    key={`confirmed-${line.uniqueId}`}
                    line={line}
                    variant="confirmed"
                    disabled={isInteractionDisabled}
                    onDecrement={canModify && canReduce ? () => handleConfirmedReduce(line) : undefined}
                    onRemove={canModify && canRemove ? () => handleConfirmedRemove(line) : undefined}
                    onEditNote={canModify ? () => handleEditConfirmedNote(line) : undefined}
                  />
                ))}
              </div>
            </section>
          )}

          {newOrChangedLines.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-primary uppercase tracking-wide mb-2 px-1">
                New / Changed
              </h2>
              <div className="space-y-2">
                {newOrChangedLines.map((line) => (
                  <CaptainOrderLine
                    key={`delta-${line.uniqueId}`}
                    line={line}
                    variant="delta"
                    disabled={isInteractionDisabled}
                    onIncrement={() => handleDeltaIncrement(line)}
                    onDecrement={() => handleDeltaDecrement(line)}
                    onEditNote={() => handleEditNewOrChanged(line)}
                  />
                ))}
              </div>
            </section>
          )}

          {reductionPendingLines.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-destructive uppercase tracking-wide mb-2 px-1">
                Reduction Pending
              </h2>
              <div className="space-y-2">
                {reductionPendingLines.map((line) => (
                  <CaptainOrderLine
                    key={`reduction-${line.uniqueId}`}
                    line={line}
                    variant="reduction"
                    disabled={isInteractionDisabled}
                    onRestore={canModify ? () => handleRestoreReduction(line) : undefined}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );

  if (isContextLoading || !isOrderReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <Spinner message="Loading table…" />
      </div>
    );
  }

  if (contextError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted p-6">
        <div className="text-center">
          <p className="text-lg font-semibold text-destructive mb-2">Unable to load this table</p>
          <p className="text-muted-foreground text-sm">{contextError}</p>
          <Button onClick={() => navigate('/pos/order')} variant="outline" className="mt-4">
            Back to Tables
          </Button>
        </div>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted p-6">
        <div className="text-center max-w-sm">
          <p className="text-lg font-semibold text-foreground mb-2">Not permitted</p>
          <p className="text-muted-foreground text-sm">
            You don't have access to view this table's order. It may belong to another captain.
          </p>
          <Button onClick={() => navigate('/pos/order')} variant="outline" className="mt-4">
            Back to Tables
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white border-b border-border px-3 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate('/pos/order')} variant="ghost" size="icon" aria-label="Back to Tables">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="font-semibold text-foreground leading-tight">Table {table}</h1>
            <p className="text-xs text-text-tertiary">{isUpdatingOrder ? 'Updating order' : 'New order'}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {canModify && (
            <div className="flex items-center gap-1 bg-muted rounded-full p-1 lg:hidden">
              <button
                onClick={() => setMode('menu')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
                  mode === 'menu' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'
                )}
              >
                <UtensilsCrossed className="w-4 h-4" />
                Menu
              </button>
              <button
                onClick={() => setMode('order')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium',
                  mode === 'order' ? 'bg-white shadow-sm text-foreground' : 'text-muted-foreground'
                )}
              >
                <ClipboardList className="w-4 h-4" />
                Order
                {activeOrders.length > 0 && (
                  <span className="ms-0.5 inline-flex items-center justify-center min-w-[1.25rem] h-5 px-1 rounded-full bg-primary text-white text-xs">
                    {activeOrders.length}
                  </span>
                )}
              </button>
            </div>
          )}

          <CaptainActionsMenu
            isOpen={isActionsMenuOpen}
            onOpenChange={setIsActionsMenuOpen}
            showReprintKot={canReprintKot}
            onReprintKot={handleReprintKot}
            isReprintingKot={isReprintingKot}
            showTransferTable={canTransferTable}
            onTransferTable={handleOpenTransferTable}
            showTransferCaptain={canTransferCaptain}
            onTransferCaptain={handleOpenTransferCaptain}
            showPrintBill={canPrintBill}
            onPrintBill={handlePrintBill}
            isPrintingBill={isPrintingBill}
          />
        </div>
      </div>

      {!canModify && (
        <div className="px-3 pt-3">
          <p className="text-sm text-warning bg-warning-tint border border-amber-200 rounded-lg px-3 py-2">
            View only — you don't have permission to modify this table's order right now.
          </p>
        </div>
      )}

      {/* Mobile layout: toggle-driven single-pane view */}
      <div className="flex-1 flex flex-col overflow-hidden lg:hidden">
        {canModify && mode === 'menu' ? (
          <CaptainMenu canAddItems={canModify} />
        ) : (
          <OrderListContent />
        )}
      </div>

      {/* Tablet layout: side-by-side Menu | Order with primary action */}
      <div className="hidden lg:flex lg:flex-col lg:flex-1 lg:overflow-hidden">
        <div className="flex flex-row gap-4 flex-1 overflow-hidden p-3">
          {canModify && (
            <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-border bg-white">
              <CaptainMenu canAddItems={canModify} />
            </div>
          )}
          <div className="flex-1 min-h-0 overflow-hidden rounded-lg border border-border bg-white">
            <OrderListContent />
          </div>
        </div>

        {/* Primary action for tablet */}
        {canModify && (
          <div className="bg-white border-t border-border p-3 mx-3 mb-3 rounded-lg">
            <div className="flex items-center justify-between mb-2 px-1">
              <span className="text-sm font-semibold text-muted-foreground">Total</span>
              <span className="text-lg font-semibold text-foreground">{formatCurrency(total)}</span>
            </div>
            <Button
              onClick={handleSend}
              variant="default"
              size="lg"
              className="w-full h-12 text-base"
              disabled={isInteractionDisabled || activeOrders.length === 0}
            >
              {isSubmitting ? (
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {isUpdatingOrder ? 'Updating…' : 'Sending…'}
                </div>
              ) : isUpdatingOrder ? (
                'Update Order'
              ) : (
                'Send Order'
              )}
            </Button>
          </div>
        )}
      </div>

      {/* Primary action for mobile */}
      {canModify && (
        <div className="sticky bottom-0 lg:hidden bg-white border-t border-border p-3">
          <div className="flex items-center justify-between mb-2 px-1">
            <span className="text-sm font-semibold text-muted-foreground">Total</span>
            <span className="text-lg font-semibold text-foreground">{formatCurrency(total)}</span>
          </div>
          <Button
            onClick={handleSend}
            variant="default"
            size="lg"
            className="w-full h-12 text-base"
            disabled={isInteractionDisabled || activeOrders.length === 0}
          >
            {isSubmitting ? (
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                {isUpdatingOrder ? 'Updating…' : 'Sending…'}
              </div>
            ) : isUpdatingOrder ? (
              'Update Order'
            ) : (
              'Send Order'
            )}
          </Button>
        </div>
      )}

      {editingItem && (
        <ProductDialog
          onClose={() => {
            setEditingItemUniqueId(null);
            setSelectedItem(null);
          }}
          editMode
          initialVariant={editingItem.selectedVariant}
          initialAddons={editingItem.selectedAddons}
          initialQuantity={editingItem.quantity}
          itemToReplace={editingItem}
        />
      )}

      <CommentDialog
        isOpen={noteEditingLine !== null}
        onClose={() => setNoteEditingLine(null)}
        onSave={handleSaveConfirmedNote}
        initialComment={noteEditingLine?.comment || ''}
      />

      <TableTransferDialog
        open={isTransferTableOpen}
        onOpenChange={(open) => {
          if (!open) {
            setIsTransferTableOpen(false);
            setTransferDestinations([]);
          }
        }}
        sourceTable={
          table
            ? {
                name: table,
                occupied: 1,
                latest_invoice_time: null,
                is_take_away: 0,
                restaurant_room: context?.table?.restaurant_room ?? selectedRoom ?? '',
                table_shape: 'Rectangle',
              }
            : null
        }
        destinationTables={transferDestinations}
        loading={isTransferDestinationsLoading}
        onConfirm={handleTableTransferConfirm}
      />

      <CaptainTransferDialog
        open={isTransferCaptainOpen}
        onOpenChange={setIsTransferCaptainOpen}
        currentCaptain={currentCaptain}
        onConfirm={handleCaptainTransferConfirm}
      />
    </div>
  );
}
