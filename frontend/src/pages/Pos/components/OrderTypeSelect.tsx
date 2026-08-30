import { useState } from 'react';
import { usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import { cn } from '@ury/ui';
import { Button } from '@ury/ui';
import TableSelectionDialog from './TableSelectionDialog';
import { DEFAULT_ORDER_TYPE, DINE_IN, ORDER_TYPES , type OrderType} from '../data/order-types';
import { HandPlatter } from 'lucide-react';
import { isUserRestrictedFromTableOrders } from '@ury/core';
import { formatMergedTableLabel } from '../lib/table-utils';
import { t } from '../i18n';

interface OrderTypeSelectProps {
  disabled?: boolean;
}

const OrderTypeSelect = ({ disabled }: OrderTypeSelectProps) => {
  const { selectedOrderType, setSelectedOrderType, selectedTable, tableOrder, posProfile, isUpdatingOrder } = usePOSStore();
  const { user } = useRootStore();
  const [showTableDialog, setShowTableDialog] = useState(false);

  // Check if user is restricted from table orders
  const isRestrictedFromTableOrders = isUserRestrictedFromTableOrders(user, posProfile);

  const handleOrderTypeSelect = (type: OrderType) => {
    // Prevent selecting "Dine In" if user is restricted
    if (type === DINE_IN && isRestrictedFromTableOrders) {
      return;
    }
    
    setSelectedOrderType(type);
    if (type === DINE_IN) {
      setShowTableDialog(true);
    }
  };

  const handleTableDialogClose = () => {
    setShowTableDialog(false);
    // Use a timeout to allow state to update before checking
    setTimeout(() => {
      const currentState = usePOSStore.getState();
      if (currentState.selectedOrderType === DINE_IN && !currentState.selectedTable) {
        setSelectedOrderType(DEFAULT_ORDER_TYPE);
      }
    }, 100);
  };

  const tableDisplayLabel =
    selectedTable && tableOrder?.message?.restaurant_table
      ? formatMergedTableLabel(
          tableOrder.message.restaurant_table,
          tableOrder.message.custom_merged_tables
        )
      : selectedTable;

  return (
    <div>
      <div className="inline-flex gap-0.5 bg-muted rounded-lg p-0.5 overflow-x-auto">
        {ORDER_TYPES.map(({ value, icon: Icon }) => {
          const isDineIn = value === DINE_IN;
          const isDisabled = disabled || (isDineIn && isRestrictedFromTableOrders) || isUpdatingOrder;

          return (
            <Button
              key={value}
              onClick={() => handleOrderTypeSelect(value)}
              variant="ghost"
              className={cn(
                'h-auto px-2.5 py-1 rounded-[5px] text-[12px] font-medium whitespace-nowrap flex items-center gap-2 transition-colors',
                selectedOrderType === value
                ? 'bg-card text-foreground font-bold shadow-sm'
                : 'text-muted-foreground hover:bg-card/50',
                isDisabled && 'opacity-50 cursor-not-allowed'
              )}
              disabled={isDisabled}
              title={isDineIn && isRestrictedFromTableOrders ? t('errors.dine_in_restricted') || 'Dine In is not available for your role' : undefined}
            >
              <Icon className="w-4 h-4" />
              {t(`order_types.${value.toLowerCase().replace(/ /g, '_')}`)}
            </Button>
          );
        })}
      </div>

      {selectedOrderType === DINE_IN && selectedTable && (
        <Button
          onClick={() => setShowTableDialog(true)}
          variant="ghost"
          className="h-fit w-fit gap-2 mt-2 text-[12px] text-primary hover:text-primary focus-visible:outline-2 focus-visible:outline-primary outline-offset-1"
          disabled={disabled}
        >
          <HandPlatter className="w-4 h-4" /> {tableDisplayLabel}
        </Button>
      )}

      {showTableDialog && (
        <TableSelectionDialog onClose={handleTableDialogClose} />
      )}
    </div>
  );
};

export default OrderTypeSelect; 