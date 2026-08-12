import { Plus, X, FilePlus2 as FilePlusCorner, FilePenLine } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { cn, Button } from '@ury/ui';
import { useRef, useEffect } from 'react';
import { useState } from 'react';
import { generateCartHash } from '../store/pos-store';
import { Dialog, DialogContent } from '@ury/ui';
import { syncOrder } from '../lib/order-api';
import { useRootStore } from '../store/root-store';
import { t } from '../i18n';
import { showToast } from '@ury/ui';
import { DINE_IN } from '../data/order-types';
import { Loader2 } from 'lucide-react';


const TabFlare = ({ position }: { position: 'left' | 'right' }) => (
  <svg 
    width="10" 
    height="10" 
    viewBox="0 0 10 10" 
    className={cn(
      "absolute bottom-[-1px] z-10", 
      position === 'left' ? "-left-[10px]" : "-right-[10px]"
    )}
  >
    {position === 'left' ? (
      <>
        <path d="M 10 0 A 10 10 0 0 1 0 10 L 10 10 Z" className="fill-primary-50" />
        <path d="M 10 0 A 10 10 0 0 1 0 10" fill="none" className="stroke-primary-600" strokeWidth="1" />
      </>
    ) : (
      <>
        <path d="M 0 0 A 10 10 0 0 0 10 10 L 0 10 Z" className="fill-primary-50" />
        <path d="M 0 0 A 10 10 0 0 0 10 10" fill="none" className="stroke-primary-600" strokeWidth="1" />
      </>
    )}
  </svg>
);

const OrderTabs = ({ disabled }: { disabled?: boolean }) => {
  const store = usePOSStore();
  const { tabOrder, activeTabId, switchTab, addTab, closeTab, heldTabs, orderId, activeOrders, posProfile, selectedOrderType, selectedTable, selectedRoom, selectedCustomer, selectedAggregator, paymentModes, orderComment, isUpdatingOrder } = store;
  const user = useRootStore(state => state.user);
  
  const [confirmCloseTabId, setConfirmCloseTabId] = useState<string | null>(null);
  const [closeActionType, setCloseActionType] = useState<'discard' | 'unsaved'>('discard');
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  const [draggedTabIndex, setDraggedTabIndex] = useState<number | null>(null);
  const [dragOverTabIndex, setDragOverTabIndex] = useState<number | null>(null);

  const handleCloseClick = (e: React.MouseEvent, tabId: string) => {
    e.stopPropagation();
    if (disabled) return;
    
    let state = usePOSStore.getState();
    if (state.activeTabId !== tabId) {
      switchTab(tabId);
      state = usePOSStore.getState();
    }
    
    if (state.activeOrders.length === 0) {
      closeTab(tabId);
    } else if (!state.isUpdatingOrder) {
      setCloseActionType('discard');
      setConfirmCloseTabId(tabId);
    } else {
      const currentHash = generateCartHash(state);
      if (currentHash !== state.originalCartHash) {
        setCloseActionType('unsaved');
        setConfirmCloseTabId(tabId);
      } else {
        closeTab(tabId);
      }
    }
  };

  const handleUpdateAndClose = async () => {
    if (!confirmCloseTabId) return;
    
    try {
      if (!posProfile) throw new Error(t('errors.pos_profile_not_found'));
      if (!user?.name) throw new Error(t('errors.user_not_logged_in'));

      if (selectedOrderType === 'Aggregators') {
        if (!selectedAggregator?.customer) {
          showToast.error(t('errors.select_aggregator'));
          return;
        }
      } else if (!selectedCustomer?.name) {
        showToast.error(t('errors.select_customer'));
        return;
      }

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
        no_of_pax: 1,
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
        invoice: isUpdatingOrder ? orderId : null,
        waiter: user.name,
        comments: orderComment || undefined
      };

      await syncOrder(orderData);
      showToast.success(t('success.order_updated'));
      
      const tabToClose = confirmCloseTabId;
      setConfirmCloseTabId(null);
      closeTab(tabToClose);
      
    } catch (error: any) {
      console.error('Failed to sync order:', error);
      if (error && typeof error === 'object' && '_server_messages' in error && typeof error._server_messages === 'string') {
        try {
          const messages = JSON.parse(error._server_messages);
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
  
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeTabRef.current && scrollContainerRef.current) {
      activeTabRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'center'
      });
    }
  }, [activeTabId, tabOrder.length]);

  return (
    <div 
      ref={scrollContainerRef}
      className="flex overflow-x-auto mb-3"
    >
      <div className="flex items-center p-1.5 bg-white rounded-xl min-w-max gap-1">
        {tabOrder.map((tab, index) => {
          const isActive = activeTabId === tab.id;
          const isDraft = isActive ? !!orderId : !!heldTabs[tab.id]?.orderId;
          
          return (
            <div
              key={tab.id}
              ref={isActive ? activeTabRef : null}
              draggable={!disabled}
              onDragStart={(e) => {
                setDraggedTabIndex(index);
                e.dataTransfer.effectAllowed = 'move';
                // Set data so Firefox allows dragging
                e.dataTransfer.setData('text/plain', tab.id);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (dragOverTabIndex !== index) {
                  setDragOverTabIndex(index);
                }
              }}
              onDragLeave={() => {
                if (dragOverTabIndex === index) {
                  setDragOverTabIndex(null);
                }
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (draggedTabIndex !== null && draggedTabIndex !== index) {
                  store.reorderTabs(draggedTabIndex, index);
                }
                setDraggedTabIndex(null);
                setDragOverTabIndex(null);
              }}
              onDragEnd={() => {
                setDraggedTabIndex(null);
                setDragOverTabIndex(null);
              }}
              className={cn(
                'group flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-all duration-200 flex-shrink-0 relative',
                isActive
                  ? 'text-primary-700 bg-primary-50 border-t border-x border-primary-600 rounded-t-lg z-10'
                  : 'text-gray-600 bg-transparent hover:text-gray-900 hover:bg-gray-200/50 border border-transparent rounded-lg',
                disabled && 'opacity-50 cursor-not-allowed',
                !disabled && 'cursor-grab active:cursor-grabbing',
                draggedTabIndex === index && 'opacity-40 scale-95',
                dragOverTabIndex === index && draggedTabIndex !== index && (
                  draggedTabIndex !== null && draggedTabIndex > index
                    ? 'shadow-[-3px_0_0_0_#0ea5e9]' // subtle left highlight
                    : 'shadow-[3px_0_0_0_#0ea5e9]'  // subtle right highlight
                )
              )}
            >
              {isActive && (
                <>
                  <TabFlare position="left" />
                  <TabFlare position="right" />
                  {/* Invisible bottom border line connecting the flares inside the active tab */}
                  <div className="absolute -bottom-[1px] left-0 right-0 h-[1.5px] bg-primary-50 z-20"></div>
                </>
              )}
              
              {isDraft ? (
                <FilePenLine className="w-4 h-4 text-yellow-500" />
              ) : (
                <FilePlusCorner className="w-4 h-4 text-green-500" />
              )}
              
              <button
                onClick={() => !disabled && switchTab(tab.id)}
                disabled={disabled}
                className="focus:outline-none"
              >
                {tab.name}
              </button>
              
              <button
                onClick={(e) => handleCloseClick(e, tab.id)}
                disabled={disabled}
                className={cn(
                  'ml-0.5 rounded-full p-0.5 transition-colors focus:outline-none z-20 relative',
                  isActive
                    ? 'text-primary-500 hover:text-primary-700 hover:bg-primary-100'
                    : 'text-gray-400 hover:text-gray-700 hover:bg-gray-200'
                )}
                title="Close order"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })}
        
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 flex-shrink-0 text-gray-500 hover:text-primary-600 rounded-lg hover:bg-gray-200/50 ml-1"
          onClick={() => !disabled && addTab()}
          disabled={disabled}
          title="Add new order"
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <Dialog open={!!confirmCloseTabId} onOpenChange={(open) => !open && setConfirmCloseTabId(null)}>
        <DialogContent className="sm:max-w-sm p-0 gap-0 overflow-hidden">
          {/* Header with title, description, and X close icon */}
          <div className="flex items-start justify-between gap-4 px-5 pt-5 pb-3">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">
                {closeActionType === 'discard' ? 'Remove Cart' : 'Unsaved Changes'}
              </h2>
              <p className="text-sm text-gray-500 mt-1">
                {closeActionType === 'discard'
                  ? 'This cart contains items. Do you want to remove it?'
                  : 'This cart has unsaved changes. What would you like to do?'}
              </p>
            </div>
            <button
              onClick={() => setConfirmCloseTabId(null)}
              className="shrink-0 rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors focus:outline-none"
              aria-label="Close"
              disabled={isSubmitting}
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Footer buttons */}
          <div className="flex items-center justify-end gap-2 px-5 py-4 bg-gray-50 border-t border-gray-100">
            {closeActionType === 'discard' ? (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  if (confirmCloseTabId) {
                    closeTab(confirmCloseTabId);
                    setConfirmCloseTabId(null);
                  }
                }}
                disabled={isSubmitting}
              >
                Remove
              </Button>
            ) : (
              <>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => {
                    if (confirmCloseTabId) {
                      closeTab(confirmCloseTabId);
                      setConfirmCloseTabId(null);
                    }
                  }}
                  disabled={isSubmitting}
                >
                  Discard
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleUpdateAndClose}
                  disabled={isSubmitting}
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />}
                  Update & Close
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};


export default OrderTabs;
