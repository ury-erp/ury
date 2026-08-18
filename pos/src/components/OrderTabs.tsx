import { Plus, X, FilePlus2 as FilePlusCorner, FilePenLine } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { cn, Button } from '@ury/ui';
import { useRef, useEffect } from 'react';
import { useState } from 'react';
import { generateCartHash } from '../store/pos-store';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@ury/ui';
import { t } from '../i18n';


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
  const { tabOrder, activeTabId, switchTab, addTab, closeTab, heldTabs, orderId } = store;
  
  const [confirmCloseTabId, setConfirmCloseTabId] = useState<string | null>(null);
  const [closeActionType, setCloseActionType] = useState<'discard' | 'unsaved'>('discard');
  
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
        <DialogContent size="sm" showCloseButton onClose={() => setConfirmCloseTabId(null)}>
          <DialogHeader>
            <DialogTitle>
              {closeActionType === 'discard' ? 'Remove Cart' : 'Unsaved Changes'}
            </DialogTitle>
            <DialogDescription>
              {closeActionType === 'discard'
                ? 'This cart contains items. Do you want to remove it?'
                : 'This cart has unsaved changes. Please verify.'}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter>
            {closeActionType === 'discard' ? (
              <>
                <Button variant="outline" onClick={() => setConfirmCloseTabId(null)}>
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    if (confirmCloseTabId) {
                      closeTab(confirmCloseTabId);
                      setConfirmCloseTabId(null);
                    }
                  }}
                >
                  Remove
                </Button>
              </>
            ) : (
              <Button variant="outline" onClick={() => setConfirmCloseTabId(null)}>
                {t('common.cancel')}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};


export default OrderTabs;
