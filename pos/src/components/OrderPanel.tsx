import { useState } from 'react';
import { Trash2, Edit, FrownIcon, Plus, Loader2, MessageSquare } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { usePOSStore } from '../store/pos-store';
import { formatCurrency, cn } from '../lib/utils';
import { CustomerSelect } from './CustomerSelect';
import { EmployeeSelect } from './EmployeeSelect';
import ProductDialog from './ProductDialog';
import OrderTypeSelect from './OrderTypeSelect';
import CommentDialog from './CommentDialog';
import { Button } from './ui/button';
import { Spinner } from './ui/spinner';
import { syncOrder } from '../lib/order-api';
import { useRootStore } from '../store/root-store';
import type { RootState } from '../store/root-store';
import { showToast } from './ui/toast';
import { DINE_IN } from '../data/order-types';

const OrderPanel = () => {
  const { t } = useTranslation();
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
    isEmployeeMeal,
    setIsEmployeeMeal,
    selectedEmployee,
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
        throw new Error(t('messages.error.posProfileNotFound'));
      }

      if (!user?.name) {
        throw new Error(t('messages.error.userNotLoggedIn'));
      }

      // Validate customer/aggregator/employee details
      if (isEmployeeMeal) {
        if (!selectedEmployee?.id) {
          showToast.error(t('messages.error.selectEmployeeBeforeProceeding'));
          return;
        }
      } else if (selectedOrderType === 'Aggregators') {
        if (!selectedAggregator?.customer) {
          showToast.error(t('messages.error.selectAggregator'));
          return;
        }
      } else if (!selectedCustomer?.name) {
        showToast.error(t('messages.error.selectCustomerBeforeProceeding'));
        return;
      }

      // Validate table selection for dine-in orders
      if (selectedOrderType === DINE_IN && !selectedTable) {
        showToast.error(t('messages.error.selectTableForDineIn', { orderType: DINE_IN }));
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
        no_of_pax: 1,
        pos_profile: posProfile.name,
        order_type: selectedOrderType,
        table: selectedTable || undefined,
        room: selectedRoom || undefined,
        customer: isEmployeeMeal
          ? (selectedEmployee?.name || '')
          : (selectedOrderType === 'Aggregators' ? selectedAggregator?.customer : selectedCustomer?.name),
        aggregator_id: selectedOrderType === 'Aggregators' ? selectedAggregator?.customer : undefined,
        cashier: posProfile.cashier,
        owner: user.name,
        mode_of_payment: paymentModes[0],
        last_invoice: isUpdatingOrder ? orderId : null,
        invoice: isUpdatingOrder ? orderId : null,
        waiter: user.name,
        comments: orderComment || undefined,
        is_employee_meal: isEmployeeMeal ? 1 : 0,
        employee: isEmployeeMeal ? selectedEmployee?.id : undefined,
      };

      await syncOrder(orderData);

      // Reset all states after successful order submission
      resetOrderState();
      showToast.success(isUpdatingOrder ? t('messages.success.orderUpdated') : t('messages.success.orderCreated'));
    } catch (error) {
      console.error('Failed to sync order:', error);
      // Frappe API error handling
      if (error && typeof error === 'object' && '_server_messages' in error && typeof (error as any)._server_messages === 'string') {
        try {
          const messages = JSON.parse((error as any)._server_messages);
          const messageObj = JSON.parse(messages[0]);
          showToast.error(messageObj.message || t('messages.error.apiError'));
        } catch {
          showToast.error(t('messages.error.apiError'));
        }
      } else if (error instanceof Error) {
        showToast.error(error.message);
      } else {
        showToast.error(t('messages.error.failedToProcessOrder'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const EmptyCartUI = () => (
    <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
      <div className="w-24 h-24 bg-gray-100 rounded-full flex items-center justify-center mb-6">
        <FrownIcon className="w-12 h-12 text-gray-400" />
      </div>

      <h3 className="text-lg font-semibold text-gray-900 mb-2">
        {t('order.cartEmpty')}
      </h3>

      <p className="text-gray-500 text-sm mb-6 max-w-xs leading-relaxed">
        {t('order.addItemsToStart')}
      </p>

      <div className="flex items-center gap-2 text-blue-600 bg-blue-50 px-4 py-2 rounded-lg">
        <Plus className="w-4 h-4" />
        <span className="text-sm font-medium">{t('order.clickToAdd')}</span>
      </div>

      <div className="mt-4 text-xs text-gray-400">
        {t('order.doubleClickCustomize')}
      </div>
    </div>
  );

  const LoadingOrderUI = () => (
    <div className="h-96">
      <Spinner message={t('order.loadingOrderDetails')} />
    </div>
  );

  const isInteractionDisabled = isOrderInteractionDisabled() || isSubmitting;

  return (
    <div className="w-96 bg-white border-l border-gray-200 flex flex-col h-[calc(100vh-4rem)] fixed right-0 z-10">
      <div className="p-4 border-b border-gray-200 flex-shrink-0">
        <OrderTypeSelect disabled={isInteractionDisabled} />
        {selectedOrderType !== 'Aggregators' && (
          <div className="mt-2 flex gap-2">
            <Button
              variant={!isEmployeeMeal ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsEmployeeMeal(false)}
              disabled={isInteractionDisabled || isUpdatingOrder}
              className="flex-1 text-xs"
            >
              {t('order.customer')}
            </Button>
            <Button
              variant={isEmployeeMeal ? 'default' : 'outline'}
              size="sm"
              onClick={() => setIsEmployeeMeal(true)}
              disabled={isInteractionDisabled || isUpdatingOrder}
              className="flex-1 text-xs"
            >
              {t('employee.employeeMeal')}
            </Button>
          </div>
        )}
        <div className="mt-3">
          {isEmployeeMeal ? (
            <EmployeeSelect disabled={isInteractionDisabled} />
          ) : (
            <CustomerSelect disabled={isInteractionDisabled} />
          )}
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
                  "flex flex-col py-4 border-b border-gray-100",
                  isInteractionDisabled && "opacity-50"
                )}
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <h3 className="font-medium text-gray-900 text-sm">{item.name}</h3>
                    </div>
                    {item.selectedVariant && (
                      <p className="text-sm text-gray-600">{item.selectedVariant.name}</p>
                    )}
                    {item.selectedAddons && item.selectedAddons.length > 0 && (
                      <p className="text-sm text-gray-500">
                        {item.selectedAddons.map(addon => addon.name).join(', ')}
                      </p>
                    )}
                    <p className="text-gray-600 text-sm">{formatCurrency(calculateItemTotal(item))}</p>
                  </div>
                  
                  <div className="flex items-center space-x-2">
                    <Button
                      onClick={() => handleEdit(item)}
                      variant="ghost"
                      size="icon"
                      className="text-blue-600 hover:text-blue-700"
                      title={t('order.editItem')}
                      disabled={isInteractionDisabled}
                    >
                      <Edit className="w-4 h-4" />
                    </Button>
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() => {
                          const newQuantity = Math.max(0, item.quantity - 1);
                          if (newQuantity === 0) {
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
                        onClick={() => updateQuantity(item.uniqueId!, item.quantity + 1)}
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
                {t('order.clearCart')}
              </Button>
            )}
          </div>
          
          <div className="p-4 border-t border-gray-200 flex-shrink-0 bg-white">
            <div className="flex justify-between items-center mb-4">
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setShowCommentDialog(true)}
                  variant="ghost"
                  size="sm"
                  className={cn(
                    "h-8 w-8 p-0",
                    orderComment ? "text-blue-600" : "text-gray-500 hover:text-gray-700"
                  )}
                  disabled={isInteractionDisabled}
                  title={orderComment ? t('order.editComment') : t('order.addComment')}
                >
                  <MessageSquare className="w-4 h-4" />
                </Button>
                <span className="text-lg font-semibold">{t('common.total')}</span>
              </div>
              <span className="text-lg font-semibold">{formatCurrency(total)}</span>
            </div>
            <Button
              onClick={handleSubmit}
              variant="default"
              size="default"
              className="w-full"
              disabled={isInteractionDisabled}
            >
              {isSubmitting ? (
                <div className="flex items-center">
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  {isUpdatingOrder ? t('order.updatingOrder') : t('order.processingOrder')}
                </div>
              ) : isUpdatingOrder ? (
                t('order.updateOrder')
              ) : (
                t('order.addNewOrder')
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