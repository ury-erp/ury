import { Plus, X } from 'lucide-react';
import { usePOSStore } from '../store/pos-store';
import { cn, Button } from '@ury/ui';

const OrderTabs = ({ disabled }: { disabled?: boolean }) => {
  const { tabOrder, activeTabId, switchTab, addTab, closeTab } = usePOSStore();

  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-2 -mx-2 px-2 mb-2">
      {tabOrder.map((tab, index) => {
        const isActive = activeTabId === tab.id;
        return (
          <div
            key={tab.id}
            className={cn(
              'h-fit flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap bg-white border transition-colors flex-shrink-0',
              isActive
                ? 'text-primary-700 bg-primary-50 border-primary-600'
                : 'text-gray-700 border-gray-200 hover:bg-gray-50',
              disabled && 'opacity-50 cursor-not-allowed'
            )}
          >
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
                'ml-0.5 rounded-sm transition-colors focus:outline-none',
                isActive
                  ? 'text-primary-500 hover:text-primary-700'
                  : 'text-gray-400 hover:text-gray-700'
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
        className="h-8 w-8 flex-shrink-0 text-gray-500 hover:text-blue-600 rounded-full"
        onClick={() => !disabled && addTab()}
        disabled={disabled}
        title="Add new order"
      >
        <Plus className="w-4 h-4" />
      </Button>
    </div>
  );
};

export default OrderTabs;
