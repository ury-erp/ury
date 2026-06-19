import { useEffect, useRef, type MouseEvent as ReactMouseEvent } from 'react';
import { MoreVertical, SplitSquareHorizontal } from 'lucide-react';
import { Button } from './ui/button';
import { t } from '../i18n';

interface OrderActionsMenuProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  showSplitBill?: boolean;
  onSplitBill?: () => void;
}

const OrderActionsMenu = ({
  isOpen,
  onOpenChange,
  showSplitBill = false,
  onSplitBill,
}: OrderActionsMenuProps) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (event: globalThis.MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen, onOpenChange]);

  if (!showSplitBill) {
    return null;
  }

  const handleToggle = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChange(!isOpen);
  };

  const handleSplitBill = (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    onOpenChange(false);
    onSplitBill?.();
  };

  return (
    <div className="relative shrink-0" ref={menuRef}>
      <Button
        variant="ghost"
        size="icon"
        className="h-8 w-8 shrink-0 text-gray-600 hover:text-gray-900"
        onClick={handleToggle}
        aria-label={t('order.order_actions')}
        aria-expanded={isOpen}
      >
        <MoreVertical className="h-4 w-4" />
      </Button>

      {isOpen && (
        <div className="absolute right-0 top-full z-50 mt-1 w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {showSplitBill && (
            <Button
              variant="ghost"
              className="flex h-auto w-full justify-start gap-2 rounded-none px-4 py-2 text-sm font-normal text-gray-700 hover:bg-gray-100"
              onClick={handleSplitBill}
            >
              <SplitSquareHorizontal className="h-4 w-4 shrink-0" />
              {t('bill_split.split_bill')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

export default OrderActionsMenu;
