import { Plus, X, FilePlus2 as FilePlusCorner, FilePenLine } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { cn, Button } from '@ury/ui';
import { useRef, useEffect } from 'react';

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
  const { tabOrder, activeTabId, switchTab, addTab, closeTab, heldTabs, orderId } = usePOSStore();
  
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
              className={cn(
                'group flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium whitespace-nowrap transition-colors flex-shrink-0 relative',
                isActive
                  ? 'text-primary-700 bg-primary-50 border-t border-x border-primary-600 rounded-t-lg z-10'
                  : 'text-gray-600 bg-transparent hover:text-gray-900 hover:bg-gray-200/50 border border-transparent rounded-lg',
                disabled && 'opacity-50 cursor-not-allowed'
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
                Order {index + 1}
              </button>
              
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!disabled) closeTab(tab.id);
                }}
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
    </div>
  );
};

export default OrderTabs;
