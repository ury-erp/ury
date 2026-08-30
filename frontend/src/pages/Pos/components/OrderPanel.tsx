import { useState } from 'react';
import { Trash2, Edit, FrownIcon, Loader2, MessageSquare } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { cn } from '@ury/ui';
import { formatCurrency } from '@ury/core';
import { CustomerSelect } from './CustomerSelect';
import ProductDialog from './ProductDialog';
import OrderTypeSelect from './OrderTypeSelect';
import CommentDialog from './CommentDialog';
import { Button } from '@ury/ui';
import { Spinner } from '@ury/ui';
import { syncOrder } from '../lib/order-api';
import { useRootStore } from '../store/root-store';
import type { RootState } from '../store/root-store';
import { showToast } from '@ury/ui';
import { DINE_IN } from '../data/order-types';
import { t } from '../i18n';

const OrderPanel = () => {
  const { 
    activeOrders, 
    removeFromOrder, 
    updateQuantity, 
    clearOrder, 
    setSelectedItem,
    orderLoading,
    isOrderInteractionDisabled,
    isUpdatingOrder,
    posProfile,
    selectedOrderType,
    selectedTable,
    selectedRoom,
    selectedCustomer,
    selectedAggregator,
    resetOrderState,
    paymentModes,
    orderId,
    orderComment,
    setOrderComment,
    noOfPax,
    setNoOfPax,
    lastModifiedTime
  } = usePOSStore();
  const user = useRootStore((state: RootState) => state.user);
  const [editingItem, setEditingItem] = useState<typeof activeOrders[0] | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showCommentDialog, setShowCommentDialog] = useState(false);

  const calculateItemTotal = (item: typeof activeOrders[0]) => {
    const basePrice = item.selectedVariant?.price || item.price;
    const addonsTotal = item.selectedAddons?.reduce((sum, addon) => sum + addon.price, 0) || 0;
    return (basePrice + addonsTotal) * item.quantity;
  };

  const total = activeOrders.reduce(
    (sum, item) => sum + calculateItemTotal(item),
    0
  );

  const handleEdit = (item: typeof activeOrders[0]) => {
    const menuItem = {
      ...item,
      variants: item.variants,
      addons: item.addons,
    };
    setSelectedItem(menuItem);
    setEditingItem(item);
  };

  const handleCommentSave = (comment: string) => {
    setOrderComment(comment);
  };

  const handleSubmit = async () => {
    try {
      if (!posProfile) {
        throw new Error(t('errors.pos_profile_not_found'));
      }

      if (!user?.name) {
        throw new Error(t('errors.user_not_logged_in'));
      }

      // Validate customer/aggregator details
      if (selectedOrderType === 'Aggregators') {
        if (!selectedAggregator?.customer) {
          showToast.error(t('errors.select_aggregator'));
          return;
        }
      } else if (!selectedCustomer?.name) {
        showToast.error(t('errors.select_customer'));
        return;
      }

      // Validate table selection for dine-in orders
      if (selectedOrderType === DINE_IN && !selectedTable) {
        showToast.error(t('errors.select_table', { order_type: DINE_IN }));
        return;
      }

      setIsSubmitting(true);
      
      const orderData = {
        items: activeOrders.map(item => ({
          item: item.id,
          item_name: item.name,
          rate: item.selectedVariant?.price || item.price,
          qty: item.quantity,
          comment: item.comment || undefined
        })),
        no_of_pax: noOfPax,
        pos_profile: posProfile.name,
        order_type: selectedOrderType,
        table: selectedTable || undefined,
        room: selectedRoom || undefined,
        customer: selectedOrderType === 'Aggregators' ? selectedAggregator?.customer : selectedCustomer?.name,
        aggregator_id: selectedOrderType === 'Aggregators' ? selectedAggregator?.customer : undefined,
        cashier: posProfile.cashier,
        owner: posProfile.owner,
        mode_of_payment: paymentModes[0],
        last_invoice: isUpdatingOrder ? orderId : null,
        last_modified_time: isUpdatingOrder ? (lastModifiedTime || undefined) : undefined,
        invoice: isUpdatingOrder ? orderId : null,
        waiter: user.name,
        comments: orderComment || undefined
      };

      const result = await syncOrder(orderData);

      // sync_order returns { status: 'Failure' } instead of throwing when the
      // write is rejected (stale last_modified_time, table already occupied,
      // or the invoice was already billed by another user).
      if (result?.message && typeof result.message === 'object' && 'status' in result.message && result.message.status === 'Failure') {
        showToast.error(isUpdatingOrder ? t('errors.order_modified') : t('errors.order_sync_failed'));
        return;
      }

      // Reset all states after successful order submission
      resetOrderState();
      showToast.success(isUpdatingOrder ? t('success.order_updated') : t('success.order_created'));
    } catch (error) {
      console.error('Failed to sync order:', error);
      // Frappe API error handling
      if (error && typeof error === 'object' && '_server_messages' in error && typeof (error as any)._server_messages === 'string') {
        try {
          const messages = JSON.parse((error as any)._server_messages);
          const messageObj = JSON.parse(messages[0]);
          showToast.error(messageObj.message || 'API error');
        } catch {
          showToast.error('API error');
        }
      } else if (error instanceof Error) {
        showToast.error(error.message);
      } else {
        showToast.error(t('errors.failed_process_order'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const MIN_PAX = 1;
  const MAX_PAX = 50;

  const handlePaxDecrement = () => {
    setNoOfPax(Math.max(MIN_PAX, noOfPax - 1));
  };

  const handlePaxIncrement = () => {
    setNoOfPax(Math.min(MAX_PAX, noOfPax + 1));
  };

  // The panel has two distinct empty cases: a dine-in order with no table
  // picked yet (table selection happens elsewhere, so this is text-only),
  // and a table/order-type already chosen but nothing added to the cart yet.
  const noTableSelected = selectedOrderType === DINE_IN && !selectedTable;

  const EmptyCartUI = () => (
    <div className="flex-1 flex flex-col justify-start">
      <div className="flex items-center gap-2.5 px-4 py-[18px] text-xs text-text-tertiary">
        <FrownIcon className="w-4 h-4 shrink-0" aria-hidden="true" />
        {noTableSelected ? (
          <span>{t('errors.select_table', { order_type: DINE_IN })}</span>
        ) : (
          <div>
            <p className="text-foreground font-medium text-[12.5px]">{t('cart.empty_title')}</p>
            <p className="text-text-tertiary text-[11.5px] mt-0.5">
              {t('cart.click_to_add')} — {t('cart.double_click_hint')}
            </p>
          </div>
        )}
      </div>
    </div>
  );

  const LoadingOrderUI = () => (
    <div className="h-96">
      <Spinner message={t('cart.loading_order')} />
    </div>
  );

  const isInteractionDisabled = isOrderInteractionDisabled() || isSubmitting;

  return (
    <div className="w-96 bg-card border-s border-border flex flex-col h-[calc(100vh-4rem)] fixed end-0 z-10">
      <div className="p-4 border-b border-border flex-shrink-0">
        <OrderTypeSelect disabled={isInteractionDisabled} />
        <div className="mt-3"><CustomerSelect disabled={isInteractionDisabled} /></div>
        <div className="mt-3 flex items-center justify-between">
          <span className="text-sm font-medium text-muted-foreground">{t('cart.pax')}</span>
          <div className="flex items-center gap-2">
            <Button
              onClick={handlePaxDecrement}
              variant="outline"
              size="icon"
              className="w-8 h-8 rounded-full"
              disabled={isInteractionDisabled || noOfPax <= MIN_PAX}
            >
              -
            </Button>
            <span className="w-6 text-center">{noOfPax}</span>
            <Button
              onClick={handlePaxIncrement}
              variant="outline"
              size="icon"
              className="w-8 h-8 rounded-full"
              disabled={isInteractionDisabled || noOfPax >= MAX_PAX}
            >
              +
            </Button>
          </div>
        </div>
      </div>
      
      {orderLoading ? (
        <LoadingOrderUI />
      ) : activeOrders.length === 0 ? (
        <EmptyCartUI />
      ) : (
        <>
          <div className="flex-1 overflow-y-auto px-6">
            {activeOrders.map((item) => (
              <div
                key={item.uniqueId}
                className={cn(
                  "flex gap-[10px] py-2 border-b border-hair text-[12.5px]",
                  isInteractionDisabled && "opacity-50"
                )}
              >
                <span className="font-mono tabular-nums text-muted-foreground w-[22px] shrink-0 pt-0.5">
                  {item.quantity}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium text-foreground">{item.name}</h3>
                    <span className="ml-auto font-mono tabular-nums text-xs shrink-0">
                      {formatCurrency(calculateItemTotal(item))}
                    </span>
                  </div>
                  {item.selectedVariant && (
                    <p className="text-text-tertiary text-[11.5px]">{item.selectedVariant.name}</p>
                  )}
                  {item.selectedAddons && item.selectedAddons.length > 0 && (
                    <p className="text-text-tertiary text-[11.5px]">
                      {item.selectedAddons.map(addon => addon.name).join(', ')}
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-2">
                    <Button
                      onClick={() => handleEdit(item)}
                      variant="ghost"
                      size="icon"
                      className="text-primary hover:text-primary h-7 w-7"
                      title={t('cart.edit_item')}
                      disabled={isInteractionDisabled}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <div className="flex items-center gap-2">
                      <Button
                        onClick={() => {
                          const newQuantity = Math.max(0, Math.round((item.quantity - 1) * 1000) / 1000);
                          if (newQuantity <= 0) {
                            removeFromOrder(item.uniqueId!);
                          } else {
                            updateQuantity(item.uniqueId!, newQuantity);
                          }
                        }}
                        variant="outline"
                        size="icon"
                        className="w-7 h-7 rounded-full"
                        disabled={isInteractionDisabled}
                      >
                        -
                      </Button>
                      <span className="w-6 text-center font-mono tabular-nums">{item.quantity}</span>
                      <Button
                        onClick={() => updateQuantity(item.uniqueId!, Math.round((item.quantity + 1) * 1000) / 1000)}
                        variant="outline"
                        size="icon"
                        className="w-7 h-7 rounded-full"
                        disabled={isInteractionDisabled}
                      >
                        +
                      </Button>
                    </div>

                    <Button
                      onClick={() => removeFromOrder(item.uniqueId!)}
                      variant="ghost"
                      size="icon"
                      className="text-destructive hover:text-destructive h-7 w-7 ml-auto"
                      disabled={isInteractionDisabled}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {activeOrders.length > 0 && (
              <Button
                onClick={clearOrder}
                variant="ghost"
                size="sm"
                className="w-full text-muted-foreground hover:text-foreground mt-4"
                disabled={isInteractionDisabled}
              >
                {t('cart.clear_cart')}
              </Button>
            )}
          </div>
          
          <div className="p-4 border-t border-border flex-shrink-0 bg-card">
            <div className="flex items-center py-1.5 last:border-0 text-[12.5px] font-[550] text-foreground">
              <Button
                onClick={() => setShowCommentDialog(true)}
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7 -ms-1 me-1",
                  orderComment ? "text-primary" : "text-text-tertiary hover:text-muted-foreground"
                )}
                disabled={isInteractionDisabled}
                title={orderComment ? t('cart.edit_comment') : t('cart.add_comment')}
              >
                <MessageSquare className="w-4 h-4" />
              </Button>
              <span>{t('cart.total')}</span>
              <span className="ml-auto font-mono tabular-nums text-sm">{formatCurrency(total)}</span>
            </div>
            <Button
              onClick={handleSubmit}
              variant="default"
              className="w-full h-9 px-3.5 text-[13px] rounded-[7px] mt-3"
              disabled={isInteractionDisabled}
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <Loader2 className="w-4 h-4 me-2 animate-spin" />

                  {isUpdatingOrder ? t('cart.updating_order') : t('cart.processing_order')}
                </div>
              ) : isUpdatingOrder ? (
                t('cart.update_order')
              ) : (
                t('cart.add_new_order')
              )}
            </Button>
          </div>
        </>
      )}

      {editingItem && (
        <ProductDialog
          onClose={() => {
            setEditingItem(null);
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
        isOpen={showCommentDialog}
        onClose={() => setShowCommentDialog(false)}
        onSave={handleCommentSave}
        initialComment={orderComment}
      />
    </div>
  );
};

export default OrderPanel; 