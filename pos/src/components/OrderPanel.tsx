import { useState } from 'react';
import { Trash2, Edit, FrownIcon, Plus, Loader2, MessageSquare, ShoppingBasket, Users, ReceiptText } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { cn } from '@ury/ui';
import { formatCurrency, parseFrappeError, flt } from '@ury/core';
import { AnimatedNumber } from '@ury/ui';
import { CustomerSelect } from './CustomerSelect';
import ProductDialog from './ProductDialog';
import OrderTypeSelect from './OrderTypeSelect';
import CommentDialog from './CommentDialog';
import OrderTabs from './OrderTabs';
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
    return flt((basePrice + addonsTotal) * item.quantity, 2);
  };

  const total = flt(
    activeOrders.reduce(
      (sum, item) => sum + calculateItemTotal(item),
      0
    ),
    2
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
      showToast.error(parseFrappeError(error, t('errors.failed_process_order')));
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

  const EmptyCartUI = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
        <FrownIcon className="w-12 h-12 text-gray-400" />
      </div>
      
      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {t('cart.empty_title')}
      </h3>

      <p className="text-gray-500 text-sm mb-6 max-w-xs leading-relaxed">
        {t('cart.empty_subtitle')}
      </p>

      <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-lg">
        <Plus className="w-4 h-4" />
        <span className="text-sm font-medium">{t('cart.click_to_add')}</span>
      </div>

      <div className="mt-4 text-xs text-gray-400">
        {t('cart.double_click_hint')}
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
    <div className="w-96 bg-[#fffdf8] border-s border-[#eadfce] flex flex-col h-[calc(100vh-4.5rem)] fixed end-0 z-10 shadow-[-10px_0_30px_rgba(74,48,30,0.06)]">
      <div className="p-5 border-b border-[#eadfce] flex-shrink-0 bg-[#fffaf0]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#f05b42] text-white shadow-[0_5px_12px_rgba(240,91,66,0.22)]">
              <ShoppingBasket className="w-4 h-4" />
            </span>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">{t('order_panel.current_ticket')}</p>
              <h2 className="text-base font-bold text-[#3f2a20]">{t('order_panel.your_order')}</h2>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs font-medium text-[#9a7e6b]">
            <ReceiptText className="w-3.5 h-3.5" /> {activeOrders.length} items
          </div>
        </div>
        <OrderTabs disabled={isInteractionDisabled} />
        <OrderTypeSelect disabled={isInteractionDisabled} />
        <div className="mt-3"><CustomerSelect disabled={isInteractionDisabled} /></div>
        <div className="mt-4 flex items-center justify-between rounded-xl border border-[#eadfce] bg-white px-3 py-2">
          <span className="flex items-center gap-2 text-sm font-semibold text-[#735d4e]"><Users className="w-4 h-4 text-primary" /> {t('cart.pax')}</span>
          <div className="flex items-center gap-2">
            <Button
              onClick={handlePaxDecrement}
              variant="outline"
              size="icon"
              className="w-8 h-8 rounded-lg border-[#eadfce]"
              disabled={isInteractionDisabled || noOfPax <= MIN_PAX}
            >
              -
            </Button>
            <span className="w-6 text-center">{noOfPax}</span>
            <Button
              onClick={handlePaxIncrement}
              variant="outline"
              size="icon"
              className="w-8 h-8 rounded-lg border-[#eadfce]"
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
                  "flex flex-col py-4 border-b border-[#f0e6d8]",
                  isInteractionDisabled && "opacity-50"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-[#3f2a20] text-sm">{item.name}</h3>
                    </div>
                    {item.selectedVariant && (
                      <p className="text-sm text-gray-600">{item.selectedVariant.name}</p>
                    )}
                    {item.selectedAddons && item.selectedAddons.length > 0 && (
                      <p className="text-sm text-gray-500">
                        {item.selectedAddons.map(addon => addon.name).join(', ')}
                      </p>
                    )}
                    {item.comment && item.comment.trim() && (
                      <p className="text-xs text-gray-500 italic mt-0.5 truncate">
                        "{item.comment.trim()}"
                      </p>
                    )}
                    <p className="text-primary font-bold text-sm">{formatCurrency(calculateItemTotal(item))}</p>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Button
                      onClick={() => handleEdit(item)}
                      variant="ghost"
                      size="icon"
                      className="text-blue-600 hover:text-blue-700"
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
                        className="w-8 h-8 rounded-full"
                        disabled={isInteractionDisabled}
                      >
                        -
                      </Button>
                      <span className="w-6 text-center">{item.quantity}</span>
                      <Button
                        onClick={() => updateQuantity(item.uniqueId!, Math.round((item.quantity + 1) * 1000) / 1000)}
                        variant="outline"
                        size="icon"
                        className="w-8 h-8 rounded-full"
                        disabled={isInteractionDisabled}
                      >
                        +
                      </Button>
                    </div>
                    
                    <Button
                      onClick={() => removeFromOrder(item.uniqueId!)}
                      variant="ghost"
                      size="icon"
                      className="text-red-500 hover:text-red-600"
                      disabled={isInteractionDisabled}
                    >
                      <Trash2 className="w-5 h-5" />
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
                className="w-full text-gray-600 hover:text-gray-800 mt-4"
                disabled={isInteractionDisabled}
              >
                {t('cart.clear_cart')}
              </Button>
            )}
          </div>
          
          <div className="p-5 border-t border-[#eadfce] flex-shrink-0 bg-[#fffaf0]">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowCommentDialog(true)}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0 rounded-lg",
                    orderComment ? "text-primary bg-primary-50" : "text-[#9a7e6b] hover:text-[#3f2a20] hover:bg-white"
                  )}
                  disabled={isInteractionDisabled}
                  title={orderComment ? t('cart.edit_comment') : t('cart.add_comment')}
                >
                  <MessageSquare className="w-4 h-4" />
                </Button>
                <span className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{t('cart.total')}</span>
              </div>
              {/* The figure a cashier watches while building an order. The
                  slide-in on change is the one place motion carries real
                  information here: it confirms the tap registered. */}
              <AnimatedNumber
                value={formatCurrency(total)}
                className="text-2xl font-bold text-foreground"
              />
            </div>
            <Button
              onClick={handleSubmit}
              variant="default"
              size="default"
              className="w-full h-12 rounded-xl text-base font-bold shadow-[0_7px_18px_rgba(240,91,66,0.22)]"
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