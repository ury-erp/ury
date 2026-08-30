import React, { useEffect, useMemo, useRef } from 'react';
import { Clock, User, UserCheck, Receipt, Printer, Pencil, X, GitBranch, GitMerge } from 'lucide-react';
import { Badge, Button, DataTable, type DataTableColumn } from '@ury/ui';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@ury/ui';
import { showToast } from '@ury/ui';
import { cn } from '@ury/ui';
import OrderStatusSidebar from '../components/OrderStatusSidebar';
import { useRootStore } from '../store/root-store';
import { formatCurrency } from '@ury/core';
import { Spinner } from '@ury/ui';
import { Textarea } from '@ury/ui';
import { usePOSStore } from '../store/pos-store';
import { useNavigate } from 'react-router-dom';
import PaymentDialog from '../components/PaymentDialog';
import BillSplitDialog from '../components/BillSplitDialog';
import BillMergeDialog from '../components/BillMergeDialog';
import OrderActionsMenu from '../components/OrderActionsMenu';
import SplitGroupPanel from '../components/SplitGroupPanel';
import MergedBillPanel from '../components/MergedBillPanel';
import { printOrder } from '../lib/print';
import { call } from '@ury/core';
import { splitBill } from '../lib/order-api';
import {
  getOrdersTabForInvoice,
  getSplitGroup,
  getCombinedOrderTotals,
  isMergedBill,
  resolvePrintFormat,
  mapSplitGroupInvoiceToPOSInvoice,
  type POSInvoice,
  type SplitGroupInvoice,
} from '../lib/invoice-api';
import { formatMergedTableLabel } from '../lib/table-utils';
import { t } from '../i18n';

function getOrderTableLabel(order: Pick<POSInvoice, 'restaurant_table' | 'custom_merged_tables'>) {
  if (!order.restaurant_table) return null;
  return formatMergedTableLabel(order.restaurant_table, order.custom_merged_tables);
}

function isOrderEditable(status: string) {
  return status === 'Draft' || status === 'Unbilled' || status === 'Recently Paid';
}

function isSplitBill(order: Pick<POSInvoice, 'split_total' | 'custom_split_group' | 'custom_split_from'>) {
  return (
    (order.split_total ?? 0) >= 2 ||
    !!order.custom_split_group ||
    !!order.custom_split_from
  );
}

type StatusTone = 'neutral' | 'success' | 'destructive';

function getStatusTone(status: string): StatusTone {
  if (status === 'Recently Paid' || status === 'Paid' || status === 'Consolidated') return 'success';
  if (status === 'Return') return 'destructive';
  return 'neutral';
}

const statusToneClasses: Record<StatusTone, string> = {
  neutral: 'border-hair bg-muted text-muted-foreground',
  success: 'border-success-tint-border bg-success-tint text-success',
  destructive: 'border-destructive-tint-border bg-destructive-tint text-destructive',
};

const statusDotClasses: Record<StatusTone, string> = {
  neutral: 'bg-muted-foreground',
  success: 'bg-success',
  destructive: 'bg-destructive',
};

function StatusTag({ status, label }: { status: string; label: string }) {
  const tone = getStatusTone(status);
  return (
    <span
      className={cn(
        'inline-flex h-[19px] shrink-0 items-center gap-1.5 rounded-[5px] border px-[7px] text-[11px] font-medium whitespace-nowrap',
        statusToneClasses[tone]
      )}
    >
      <span className={cn('h-[5px] w-[5px] shrink-0 rounded-full', statusDotClasses[tone])} />
      {label}
    </span>
  );
}

function LinkTag({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <span className="inline-flex h-[19px] shrink-0 items-center gap-1 rounded-[5px] border border-primary-tint-border bg-primary-tint px-[7px] text-[11px] font-medium text-primary whitespace-nowrap">
      <Icon className="h-2.5 w-2.5" />
      {children}
    </span>
  );
}

export default function Orders() {
  const { 
    orders,
    orderLoading,
    error,
    selectedStatus,
    pagination,
    selectedOrder,
    selectedOrderItems,
    selectedOrderTaxes,
    selectedOrderLoading,
    selectedOrderError,
    fetchOrders,
    setSelectedStatus,
    goToNextPage,
    goToPreviousPage,
    selectOrder,
    clearSelectedOrder,
    orderSearchQuery
  } = useRootStore();

  const posStore = usePOSStore();
  const navigate = useNavigate();
  const mounted = useRef(false);
  const [cancelDialogOpen, setCancelDialogOpen] = React.useState(false);
  const [cancelReason, setCancelReason] = React.useState('');
  const [cancelLoading, setCancelLoading] = React.useState(false);
  const [editLoading, setEditLoading] = React.useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = React.useState(false);
  const [showSplitDialog, setShowSplitDialog] = React.useState(false);
  const [showMergeDialog, setShowMergeDialog] = React.useState(false);
  const [orderActionsMenuOpen, setOrderActionsMenuOpen] = React.useState(false);
  const [isPrinting, setIsPrinting] = React.useState(false);

  const canSplitBill = useMemo(() => {
    if (!selectedOrder || selectedOrderItems.length === 0) return false;

    const hasSplittableItems =
      selectedOrderItems.length >= 2 ||
      selectedOrderItems.some((item) => item.qty > 1);
    if (!hasSplittableItems) return false;

    // Tab label (Unbilled/Draft) is a UI filter; doc status is always "Draft" for open bills.
    // Use invoice_printed to distinguish pre-print vs post-print split eligibility.
    const invoicePrinted = String(selectedOrder.invoice_printed);
    return invoicePrinted === '0' || invoicePrinted === '1';
  }, [selectedOrder, selectedOrderItems]);

  const isSecondaryMergedBill = useMemo(() => {
    if (!selectedOrder) return false;
    return orders.some((order) => order.custom_merged_pos_invoice === selectedOrder.name);
  }, [orders, selectedOrder]);

  const canMergeBill = useMemo(() => {
    if (!selectedOrder || selectedOrderItems.length === 0) return false;
    if (!isOrderEditable(selectedOrder.status)) return false;
    if (isMergedBill(selectedOrder)) return false;
    if (isSecondaryMergedBill) return false;
    return true;
  }, [selectedOrder, selectedOrderItems, isSecondaryMergedBill]);

  const selectedOrderTotals = useMemo(() => {
    if (!selectedOrder) {
      return { grandTotal: 0, roundedTotal: 0 };
    }
    return getCombinedOrderTotals(selectedOrder);
  }, [selectedOrder]);

  useEffect(() => {
    setOrderActionsMenuOpen(false);
  }, [selectedOrder?.name]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      return; // Skip the first run
    }
    fetchOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderSearchQuery]);


  // Function to format the date and time
  const formatDateTime = (date: string, time: string) => {
    const formattedDate = new Date(date + ' ' + time).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });
    return formattedDate;
  };

  const handleOrderClick = (order: any) => {
    selectOrder(order);
  };

  // Helper function to get badge variant based on order status
  const getBadgeVariant = (status: string) => {
    switch (status) {
      case 'Draft':
      case 'Unbilled':
        return 'secondary';
      case 'Recently Paid':
      case 'Paid':
      case 'Consolidated':
        return 'default';
      case 'Return':
        return 'destructive';
      default:
        return 'default';
    }
  };

  async function handleCancelOrder() {
    if (!selectedOrder) return;
    if (!cancelReason.trim()) {
      showToast.error(t('errors.enter_cancel_reason'));
      return;
    }
    setCancelLoading(true);
    try {
      await call.post('ury.ury.doctype.ury_order.ury_order.cancel_order', {
        invoice_id: selectedOrder.name,
        reason: cancelReason
      })
      showToast.success(t('success.order_cancelled'));
      setCancelDialogOpen(false);
      setCancelReason('');
      clearSelectedOrder();
      fetchOrders();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : t('errors.failed_cancel_order'));
    } finally {
      setCancelLoading(false);
    }
  }

  async function handleEditOrder() {
    if (!selectedOrder) return;
    setEditLoading(true);
    try {
      const res = await fetch(`/api/method/frappe.client.get?doctype=POS+Invoice&name=${selectedOrder.name}`);
      if (!res.ok) throw new Error('Failed to fetch order details');
      const data = await res.json();
      const order = data.message;
      // Fill POS store
      posStore.resetOrderState();
      posStore.setSelectedOrderType(order.order_type);
      posStore.setOrderForUpdate(order.name);
      if (order.restaurant_table) {
        posStore.setSelectedTable(order.restaurant_table, order.custom_restaurant_room || null,true);
      }
      posStore.setSelectedCustomer({ id: order.customer, name: order.customer_name, phone: order.mobile_number });
      // Fill cart
      const items = (order.items || []).map((item: any) => ({
        id: item.item_code,
        name: item.item_name,
        price: item.rate,
        quantity: item.qty,
        amount: item.amount,
        image: item.image || null,
        uniqueId: item.name,
        item: item.item_code,
        item_name: item.item_name,
        item_image: null,
        course: '',
        description: item.description || '',
        special_dish: 0,
        tax_rate: 0,
      }));
      for (const cartItem of items) {
        await posStore.addToOrder(cartItem);
      }
      // Redirect to POS page
      navigate('/pos/pos');
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : t('errors.failed_edit_order'));
    } finally {
      setEditLoading(false);
    }
  }

  async function handlePrintOrder() {
    if (!selectedOrder || !posStore.posProfile) return;
    setIsPrinting(true);
    try {
      await printOrder({
        orderId: selectedOrder.name,
        posProfile: posStore.posProfile,
        printFormat: resolvePrintFormat(selectedOrder, posStore.posProfile.print_format),
      });
      showToast.success(t('success.printed'));
      // Locally update selectedOrder.invoice_printed to 1
      if (selectedOrder && typeof selectedOrder === 'object') {
        selectOrder({ ...selectedOrder, invoice_printed: 1 });
      }
      // If order was Unbilled, set to Draft and reload draft orders
      if (selectedStatus === 'Unbilled') {
        showToast.info(t('success.order_moved_to_draft'));
        setSelectedStatus('Draft');
        fetchOrders();
      }
    } catch (err: any) {
      showToast.error(t('errors.print_failed', { reason: err?.message || String(err) }));
    } finally {
      setIsPrinting(false);
    }
  }

  async function handleSplitBill(payload: {
    itemsToMove: Array<{ name: string; qty: number }>;
    customer?: string;
  }) {
    if (!selectedOrder) return;
    const result = await splitBill(selectedOrder.name, payload.itemsToMove, payload.customer);
    showToast.success(t('bill_split.split_success', { invoice: result.new_invoice }));

    const childOnUnbilledTab =
      !!selectedOrder.restaurant_table &&
      String(selectedOrder.invoice_printed) === '1';

    if (childOnUnbilledTab) {
      await setSelectedStatus('Unbilled');
    } else {
      await fetchOrders();
    }

    const splitGroup = await getSplitGroup(result.new_invoice).catch(() => null);
    if (splitGroup?.invoices?.length) {
      const enriched = new Map(
        splitGroup.invoices.map((inv) => [inv.name, mapSplitGroupInvoiceToPOSInvoice(inv)])
      );
      useRootStore.setState((state) => ({
        orders: state.orders.map((o) => enriched.get(o.name) ?? o),
      }));
    }

    const newInvoice = splitGroup?.invoices.find((inv) => inv.name === result.new_invoice);
    if (newInvoice) {
      await selectOrder(mapSplitGroupInvoiceToPOSInvoice(newInvoice));
      return;
    }

    const newOrder = useRootStore.getState().orders.find((o) => o.name === result.new_invoice);
    if (newOrder) {
      await selectOrder(newOrder);
    }
  }

  async function handleMergeBill() {
    if (!selectedOrder) return;
    await fetchOrders();
    const updated = useRootStore.getState().orders.find((o) => o.name === selectedOrder.name);
    if (updated) {
      await selectOrder(updated);
    }
  }

  async function openSecondaryInvoice(invoiceName: string) {
    const inList = orders.find((o) => o.name === invoiceName);
    if (inList) {
      await selectOrder(inList);
      return;
    }
    await fetchOrders();
    const refreshed = useRootStore.getState().orders.find((o) => o.name === invoiceName);
    if (refreshed) {
      await selectOrder(refreshed);
    }
  }

  async function openRelatedInvoice(sibling: SplitGroupInvoice) {
    const tab = getOrdersTabForInvoice(sibling, {
      paidLimit: posStore.posProfile?.paid_limit,
      viewAllStatus: posStore.posProfile?.view_all_status,
    });

    if (tab !== selectedStatus) {
      await setSelectedStatus(tab);
    }

    const inList = useRootStore.getState().orders.find((o) => o.name === sibling.name);
    await selectOrder(inList ?? mapSplitGroupInvoiceToPOSInvoice(sibling));
  }

  const orderColumns: DataTableColumn<POSInvoice>[] = [
    {
      key: 'order',
      header: 'Order',
      render: (order) => {
        const splitBill = isSplitBill(order);
        const mergedBill = isMergedBill(order);
        const isSelected = selectedOrder?.name === order.name;
        return (
          <div className="min-w-0 max-w-[13rem]">
            <div className="flex items-center gap-1.5">
              <span
                className={cn(
                  'truncate font-medium',
                  isSelected ? 'text-primary' : 'text-foreground'
                )}
                title={order.name}
              >
                {order.name}
              </span>
              {mergedBill && <LinkTag icon={GitMerge}>{t('bill_merge.merged_bill')}</LinkTag>}
              {splitBill && (
                <LinkTag icon={GitBranch}>
                  {(order.split_total ?? 0) >= 2
                    ? t('bill_split.split_indicator', {
                        index: order.split_index ?? 0,
                        total: order.split_total ?? 0,
                      })
                    : t('bill_split.split_bill')}
                </LinkTag>
              )}
            </div>
            {mergedBill && order.custom_merged_pos_invoice && (
              <p className="truncate text-[11px] text-text-tertiary">
                {t('bill_merge.includes_bill', { invoice: order.custom_merged_pos_invoice })}
              </p>
            )}
            {splitBill && order.custom_split_from && (
              <p className="truncate text-[11px] text-text-tertiary">
                {t('bill_split.split_from', { invoice: order.custom_split_from })}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'type',
      header: 'Table / Type',
      render: (order) => {
        const tableLabel = getOrderTableLabel(order);
        return (
          <div className="min-w-0 max-w-[9rem]">
            <p className="truncate text-foreground">
              {t(`order_types.${order.order_type.toLowerCase().replace(/ /g, '_')}`)}
            </p>
            {tableLabel && (
              <p className="truncate text-[11px] text-text-tertiary">
                {`Table ${tableLabel}`}
              </p>
            )}
          </div>
        );
      },
    },
    {
      key: 'customer',
      header: 'Customer',
      render: (order) => <span className="block max-w-[8rem] truncate text-foreground">{order.customer}</span>,
    },
    {
      key: 'waiter',
      header: 'Server',
      render: (order) => <span className="block max-w-[7rem] truncate text-muted-foreground">{order.waiter || '—'}</span>,
    },
    {
      key: 'time',
      header: 'Time',
      render: (order) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(order.posting_date, order.posting_time)}
        </span>
      ),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'right',
      render: (order) => {
        const mergedBill = isMergedBill(order);
        const rowTotal = mergedBill
          ? order.rounded_total + Math.round(order.custom_merged_total ?? 0)
          : order.rounded_total;
        return (
          <span className="font-mono tabular-nums text-foreground font-semibold">
            {formatCurrency(rowTotal)}
          </span>
        );
      },
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => (
        <StatusTag
          status={order.status}
          label={t(`order_status_types.${order.status.toLowerCase().replace(/ /g, '_')}`)}
        />
      ),
    },
  ];

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <p className="text-xl font-semibold text-destructive mb-2">Failed to load orders</p>
          <p className="text-muted-foreground">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Left Sidebar - Order Types */}
      <OrderStatusSidebar
        selectedStatus={selectedStatus}
        setSelectedStatus={setSelectedStatus}
      />

      {/* Middle Section - Order Table */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden pe-96">
        <div className="flex-1 overflow-y-auto bg-muted p-4 pb-40">
          {orderLoading ? (
            <div className="flex items-center justify-center h-full">
              <Spinner  message={t('common.loading')} />
            </div>
          ) : orders.length === 0 ? (
            <div className="panel flex items-center rounded-[9px] border border-hair bg-card px-4 py-[18px] text-xs text-text-tertiary max-w-screen-xl mx-auto">
              {t('orders.no_orders_found')}
            </div>
          ) : (
            <div className="max-w-screen-xl mx-auto">
              <DataTable<POSInvoice>
                columns={orderColumns}
                rows={orders}
                onRowClick={handleOrderClick}
                rowTone={(order) => (getStatusTone(order.status) === 'destructive' ? 'danger' : undefined)}
                emptyMessage={t('orders.no_orders_found')}
                className="bg-card"
              />
            </div>
          )}
          {/* Pagination Controls */}
          {!orderLoading && (
            <div className="py-4">
              <div className="flex justify-center items-center gap-x-4 max-w-screen-xl mx-auto">
                <Button
                  onClick={goToPreviousPage}
                  disabled={pagination.currentPage === 1}
                  variant="outline"
                  className='w-20'
                  size="xs"
                >
                  {t('orders.pagination.previous')}
                </Button>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">
                    {t('orders.pagination.page', { number: pagination.currentPage.toString() })}
                  </span>
                </div>
                <Button
                  onClick={goToNextPage}
                  disabled={!pagination.hasNextPage}
                  variant="outline"
                  className='w-20'
                  size="xs"
                >
                  {t('orders.pagination.next')}
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Section - Order Details */}
      <div className="w-96 bg-card border-s border-border flex flex-col h-[calc(100vh-4rem)] fixed end-0 z-10">
        {!selectedOrder ? (
          <div className="flex items-center px-4 py-[18px] text-xs text-text-tertiary">
            {t('order.select_to_view')} — {t('orders.click_to_view')}
          </div>
        ) : selectedOrderLoading ? (
          <div className="flex items-center justify-center h-full">
            <Spinner  message={t('common.loading')} />
          </div>
        ) : selectedOrderError ? (
          <div className="flex items-center px-4 py-[18px] text-xs text-destructive">
            Failed to load order details — {selectedOrderError}
          </div>
        ) : (
          <>
            {/* Fixed Header */}
            <div className="sticky top-0 start-0 end-0 z-20 border-b border-border bg-card px-6 py-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="min-w-0 flex-1 truncate text-xl font-semibold text-foreground">
                  {selectedOrder.name}
                </h2>
                <div className="flex shrink-0 items-center gap-2">
                  {isOrderEditable(selectedOrder.status) && (
                    <>
                      <OrderActionsMenu
                        isOpen={orderActionsMenuOpen}
                        onOpenChange={setOrderActionsMenuOpen}
                        showMergeBill={canMergeBill}
                        onMergeBill={() => setShowMergeDialog(true)}
                        showSplitBill={canSplitBill}
                        onSplitBill={() => setShowSplitDialog(true)}
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="focus:ring-primary"
                        aria-label="Edit order"
                        onClick={handleEditOrder}
                        disabled={editLoading}
                      >
                        <Pencil className="w-4 h-4" />
                        {editLoading && <span className="ms-2 text-xs">{t('common.loading')}</span>}
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="text-destructive focus:ring-destructive"
                        aria-label="Cancel order"
                        onClick={() => setCancelDialogOpen(true)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </>
                  )}
                  <Badge variant={getBadgeVariant(selectedOrder.status)}>
                    {t(`order_status_types.${selectedOrder.status.toLowerCase().replace(/ /g, '_')}`)}
                  </Badge>
                </div>
              </div>
              {((selectedOrder.split_total ?? 0) >= 2 ||
                isSplitBill(selectedOrder) ||
                isMergedBill(selectedOrder)) && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {(selectedOrder.split_total ?? 0) >= 2 || isSplitBill(selectedOrder) ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-primary-tint-border bg-primary-tint text-primary hover:bg-primary-tint"
                    >
                      <GitBranch className="h-3 w-3" />
                      {(selectedOrder.split_total ?? 0) >= 2
                        ? t('bill_split.split_indicator', {
                            index: selectedOrder.split_index ?? 0,
                            total: selectedOrder.split_total ?? 0,
                          })
                        : t('bill_split.split_bill')}
                    </Badge>
                  ) : null}
                  {isMergedBill(selectedOrder) ? (
                    <Badge
                      variant="outline"
                      className="gap-1 border-primary-tint-border bg-primary-tint text-primary hover:bg-primary-tint"
                    >
                      <GitMerge className="h-3 w-3" />
                      {t('bill_merge.merged_bill')}
                    </Badge>
                  ) : null}
                </div>
              )}
            </div>
            {/* Cancel Order Dialog */}
            <Dialog open={cancelDialogOpen} onOpenChange={setCancelDialogOpen}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{t('order.cancel_order')}</DialogTitle>
                  <DialogDescription>
                    {t('errors.enter_cancel_reason')}
                  </DialogDescription>
                </DialogHeader>
                <div className="px-6 mb-3">
                <Textarea
                  placeholder={t('order.enter_cancel_reason')}
                  value={cancelReason}
                  onChange={e => setCancelReason(e.target.value)}
                  disabled={cancelLoading}
                  autoFocus
                />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCancelDialogOpen(false)} disabled={cancelLoading}>
                    {t('common.cancel')}
                  </Button>
                  <Button variant="danger" onClick={handleCancelOrder} disabled={cancelLoading}>
                    {cancelLoading ? t('common.cancelling') : t('common.confirm_cancel')}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            {/* Scrollable Content Area */}
            <div className="flex-1 overflow-y-auto p-6 pb-40">
              <SplitGroupPanel
                invoiceName={selectedOrder.name}
                onOpenInvoice={openRelatedInvoice}
              />

              <MergedBillPanel
                order={selectedOrder}
                onOpenSecondary={openSecondaryInvoice}
              />

              <div className="mb-6">
                <div className="grid grid-cols-2 gap-4">
                  {/* First column: customer and time */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <User className="w-4 h-4 text-text-tertiary" />
                      <span className="text-foreground font-medium">{selectedOrder.customer}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Clock className="w-4 h-4 text-text-tertiary" />
                      <span className="text-muted-foreground">{formatDateTime(selectedOrder.posting_date, selectedOrder.posting_time)}</span>
                    </div>
                  </div>
                  {/* Second column: waiter and table */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <UserCheck className="w-4 h-4 text-text-tertiary" />
                      <span className="text-muted-foreground">{selectedOrder.waiter}</span>
                    </div>
                    {selectedOrder.restaurant_table && (
                      <div className="flex items-center gap-3 text-sm">
                        <Receipt className="w-4 h-4 text-text-tertiary" />
                        <span className="text-muted-foreground">{getOrderTableLabel(selectedOrder)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Order Items */}
              <div className="mb-6">
                <h3 className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-2">{t('order.items_title')}</h3>
                <div>
                  {selectedOrderItems.map((item, index) => (
                    <div key={index} className="flex py-1.5 border-b border-hair last:border-0">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{item.item_name}</p>
                        <p className="text-xs text-text-tertiary font-mono tabular-nums">Qty: {item.qty}</p>
                      </div>
                      <p className="ml-auto font-mono text-xs font-semibold text-foreground tabular-nums self-center">
                        {formatCurrency(item.amount)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Taxes */}
              {selectedOrderTaxes.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-[10.5px] font-medium uppercase tracking-[0.05em] text-text-tertiary mb-2">{t('order.taxes_charges')}</h3>
                  <div>
                    {selectedOrderTaxes.map((tax, index) => (
                      <div key={index} className="flex py-1.5 border-b border-hair last:border-0">
                        <span className="text-sm text-muted-foreground">{tax.description}</span>
                        <span className="ml-auto font-mono text-xs font-medium text-foreground tabular-nums">
                          {formatCurrency(tax.rate)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Bottom Section - Single Row: Print | Payment | Total */}
            <div className="border-t border-border p-6 bg-muted sticky bottom-0 start-0 end-0 z-10">
              <div className="flex items-center gap-3 w-full">
                {/* Print Icon Button */}
                <Button
                  variant="outline"
                  size="icon"
                  className="flex-shrink-0"
                  onClick={handlePrintOrder}
                  aria-label="Print"
                  disabled={isPrinting}
                >
                  {isPrinting ? <Spinner className="w-5 h-5" hideMessage  message={t('common.loading')} /> : <Printer className="w-5 h-5" />}
                </Button>
                {/* Payment Button - Only show for Draft, Unbilled, and Recently Paid orders */}
                {isOrderEditable(selectedOrder.status) && (
                  <Button
                    className="flex-1"
                    onClick={() => {
                      if (String(selectedOrder.invoice_printed) === '0') {
                        showToast.error(t('errors.please_print_first'));
                        return;
                      }
                      setShowPaymentDialog(true);
                    }}
                  >
                    {t('order.payment')}
                  </Button>
                )}
                {/* Total */}
                <span className="ms-auto text-xl font-bold text-foreground whitespace-nowrap">
                  {isMergedBill(selectedOrder) ? (
                    <span className="flex flex-col items-end leading-tight">
                      <span className="text-xs font-medium text-text-tertiary">{t('bill_merge.combined_total')}</span>
                      <span>{formatCurrency(selectedOrderTotals.roundedTotal)}</span>
                    </span>
                  ) : (
                    formatCurrency(selectedOrder.rounded_total)
                  )}
                </span>
              </div>
            </div>
          </>
        )}
      </div>
      {showPaymentDialog && selectedOrder && (
        <PaymentDialog
          onClose={() => setShowPaymentDialog(false)}
          grandTotal={selectedOrderTotals.grandTotal}
          roundedTotal={selectedOrderTotals.roundedTotal}
          invoice={selectedOrder.name}
          customer={selectedOrder.customer}
          posProfile={posStore.posProfile?.name || ''}
          table={selectedOrder.restaurant_table || null}
          tableLabel={getOrderTableLabel(selectedOrder)}
          cashier={posStore.posProfile?.cashier || ''}
          owner={posStore.posProfile?.cashier || ''}
          fetchOrders={fetchOrders}
          clearSelectedOrder={clearSelectedOrder}
          discountPercentage={selectedOrder.additional_discount_percentage}
          discountAmount={selectedOrder.discount_amount}
        />
      )}
      {selectedOrder && (
        <BillMergeDialog
          open={showMergeDialog}
          onOpenChange={setShowMergeDialog}
          invoiceName={selectedOrder.name}
          onConfirm={handleMergeBill}
        />
      )}
      {selectedOrder && (
        <BillSplitDialog
          open={showSplitDialog}
          onOpenChange={setShowSplitDialog}
          invoiceName={selectedOrder.name}
          items={selectedOrderItems}
          sourceCustomer={
            selectedOrder.customer
              ? { id: selectedOrder.customer, name: selectedOrder.customer, phone: selectedOrder.mobile_number }
              : null
          }
          onConfirm={handleSplitBill}
        />
      )}
    </div>
  );
};
