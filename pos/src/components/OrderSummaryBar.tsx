import { ChevronUp, ShoppingBasket } from 'lucide-react';
import { formatCurrency, flt } from '@ury/core';
import { usePOSStore } from '../store/pos-store';
import { t, tPlural } from '../i18n';

interface OrderSummaryBarProps {
  onOpen: () => void;
}

/**
 * The order, kept visible while the panel is a sheet.
 *
 * A docked panel tells the cashier at a glance what is on the ticket. On a
 * portrait tablet the panel is closed most of the time, so the running count
 * and total move down here and stay put (UX-06, and the "ملخص ثابت" the
 * device matrix asks for). The bar is the only way to open the order, so it
 * is a real button with a full-width touch target rather than a status strip.
 */
export default function OrderSummaryBar({ onOpen }: OrderSummaryBarProps) {
  const { activeOrders } = usePOSStore();

  const total = flt(
    activeOrders.reduce((sum, item) => {
      const basePrice = item.selectedVariant?.price || item.price;
      const addons = item.selectedAddons?.reduce((a, addon) => a + addon.price, 0) || 0;
      return sum + (basePrice + addons) * item.quantity;
    }, 0),
    2
  );

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full shrink-0 items-center justify-between gap-3 border-t border-[#eadfce] bg-[#fffaf0] px-4 py-3 text-start transition-colors hover:bg-[#fff2d7] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
    >
      <span className="flex items-center gap-3">
        <span className="relative flex h-11 w-11 items-center justify-center rounded-xl bg-[#f05b42] text-white">
          <ShoppingBasket className="h-5 w-5" />
        </span>
        <span className="flex flex-col">
          <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">
            {t('order_panel.current_ticket')}
          </span>
          <span className="text-sm font-semibold text-[#3f2a20]">
            {tPlural('order_panel.item_count', activeOrders.length)}
          </span>
        </span>
      </span>
      <span className="flex items-center gap-2">
        <span className="text-lg font-bold tabular-nums text-[#3f2a20]">
          {formatCurrency(total)}
        </span>
        <ChevronUp className="h-5 w-5 text-[#8f6b55]" />
      </span>
    </button>
  );
}
