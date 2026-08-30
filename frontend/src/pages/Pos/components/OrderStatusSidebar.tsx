import { FileText } from 'lucide-react';
import { cn } from '@ury/ui';
import { Button } from '@ury/ui';
import { getOrderStatusTypes, OrderStatusType } from '../data/order-types';
import { usePOSStore } from '../store/pos-store';
import { t } from '../i18n';

interface OrderStatusSidebarProps {
  disabled?: boolean;
  selectedStatus: OrderStatusType;
  setSelectedStatus: (status: OrderStatusType) => void;
  getStatusCount?: (status: OrderStatusType) => number;
}

const OrderStatusSidebar = ({ 
  disabled,
  selectedStatus,
  setSelectedStatus,
}: OrderStatusSidebarProps) => {
  const { posProfile } = usePOSStore();
  
  // Get the appropriate status types based on POS profile settings
  const statusTypes = getOrderStatusTypes(posProfile?.view_all_status, posProfile?.paid_limit);

  return (
    <div className={cn(
      "w-64 bg-card border-e border-border h-full flex flex-col",
      disabled && "opacity-50 pointer-events-none"
    )}>
      <nav className="flex-1 p-6 overflow-y-auto">
        <div className="bg-muted border border-border rounded-lg p-4">
          {/* Section Title */}
          <h2 className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-3 px-1">
            {t('orders.status_title')}
          </h2>

          {/* Status Items */}
          <div className="space-y-1">
            {statusTypes.map((status) => (
              <Button
                key={status.value}
                onClick={() => setSelectedStatus(status.value as OrderStatusType)}
                variant="ghost"
                className={cn(
                  'w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative',
                  selectedStatus === status.value
                    ? 'bg-card text-foreground shadow-sm font-semibold'
                    : 'text-muted-foreground hover:bg-card/60 hover:text-foreground'
                )}
                disabled={disabled}
              >
                {/* Active indicator bar */}
                {selectedStatus === status.value && (
                  <div className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-primary rounded-e-full" />
                )}
                <div className="flex items-center gap-3 ms-1">
                  <FileText className="w-4 h-4 text-text-tertiary" />
                  <span>{t(`order_status_types.${status.value.toLowerCase().replace(/ /g, '_')}`)}</span>
                </div>
              </Button>
            ))}
          </div>
        </div>
      </nav>
    </div>
  );
};

export default OrderStatusSidebar; 