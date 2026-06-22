import { useEffect, useMemo, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { Button } from './ui/button';
import { cn, formatCurrency } from '../lib/utils';
import { t } from '../i18n';
import { CustomerPicker } from './CustomerPicker';
import type { Customer } from '../store/pos-store';

export interface BillSplitItem {
  name: string;
  item_name: string;
  qty: number;
  rate: number;
  amount: number;
}

interface BillSplitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoiceName: string;
  items: BillSplitItem[];
  sourceCustomer?: Customer | null;
  onConfirm: (payload: {
    itemsToMove: Array<{ name: string; qty: number }>;
    customer?: string;
  }) => Promise<void>;
}

const BillSplitDialog = ({
  open,
  onOpenChange,
  invoiceName,
  items,
  sourceCustomer,
  onConfirm,
}: BillSplitDialogProps) => {
  const [moveQtyByRow, setMoveQtyByRow] = useState<Record<string, number>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sameAsOriginal, setSameAsOriginal] = useState(true);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  useEffect(() => {
    if (open) {
      setSameAsOriginal(true);
      setSelectedCustomer(sourceCustomer ?? null);
      setMoveQtyByRow({});
      setError(null);
    }
  }, [open, sourceCustomer, invoiceName]);

  const resetState = () => {
    setMoveQtyByRow({});
    setError(null);
    setSameAsOriginal(true);
    setSelectedCustomer(sourceCustomer ?? null);
  };

  const handleOpenChange = (next: boolean) => {
    if (isSubmitting) return;
    if (!next) resetState();
    onOpenChange(next);
  };

  const totals = useMemo(() => {
    let moving = 0;
    let staying = 0;

    for (const item of items) {
      const moveQty = moveQtyByRow[item.name] ?? 0;
      const stayQty = item.qty - moveQty;
      moving += moveQty * item.rate;
      staying += stayQty * item.rate;
    }

    return { moving, staying };
  }, [items, moveQtyByRow]);

  const hasValidSelection = useMemo(() => {
    if (totals.moving <= 0) return false;
    if (totals.staying <= 0) return false;
    return items.every((item) => (moveQtyByRow[item.name] ?? 0) <= item.qty);
  }, [items, moveQtyByRow, totals.moving, totals.staying]);

  const toggleItem = (item: BillSplitItem, checked: boolean) => {
    setMoveQtyByRow((prev) => ({
      ...prev,
      [item.name]: checked ? item.qty : 0,
    }));
    setError(null);
  };

  const adjustQty = (item: BillSplitItem, delta: number) => {
    setMoveQtyByRow((prev) => {
      const current = prev[item.name] ?? 0;
      const next = Math.min(item.qty, Math.max(0, current + delta));
      return { ...prev, [item.name]: next };
    });
    setError(null);
  };

  const handleConfirm = async () => {
    if (!hasValidSelection) {
      setError(t('bill_split.cannot_move_all_items'));
      return;
    }

    const itemsToMove = items
      .map((item) => ({ name: item.name, qty: moveQtyByRow[item.name] ?? 0 }))
      .filter((row) => row.qty > 0);

    const customerId = sameAsOriginal ? sourceCustomer?.id : selectedCustomer?.id;
    if (!sameAsOriginal && !customerId) {
      setError(t('bill_split.customer_required'));
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        itemsToMove,
        customer: sameAsOriginal ? undefined : customerId,
      });
      resetState();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('bill_split.split_failed'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        variant="large"
        size="lg"
        onClose={() => handleOpenChange(false)}
        className="max-h-[90vh] overflow-y-auto"
      >
        <DialogHeader>
          <DialogTitle>{t('bill_split.split_bill')}</DialogTitle>
          <DialogDescription>
            {t('bill_split.select_items', { invoice: invoiceName })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 px-6 pb-2">
          {items.map((item) => {
            const moveQty = moveQtyByRow[item.name] ?? 0;
            const isSelected = moveQty > 0;

            return (
              <div
                key={item.name}
                className={cn(
                  'rounded-lg border p-3 transition-colors',
                  isSelected ? 'border-primary bg-primary-50/40' : 'border-gray-200'
                )}
              >
                <div className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4 rounded border-gray-300"
                    checked={isSelected}
                    onChange={(e) => toggleItem(item, e.target.checked)}
                    disabled={isSubmitting}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-gray-900">{item.item_name}</p>
                        <p className="text-xs text-gray-500">
                          {t('bill_split.available_qty', { qty: item.qty })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-gray-900">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>

                    {isSelected && (
                      <div className="mt-3 flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-600">
                          {t('bill_split.move_qty')}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => adjustQty(item, -1)}
                          disabled={isSubmitting || moveQty <= 0}
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="w-8 text-center text-sm font-semibold">{moveQty}</span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={() => adjustQty(item, 1)}
                          disabled={isSubmitting || moveQty >= item.qty}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mx-6 mb-4 space-y-3 rounded-lg border border-gray-200 p-4">
          <p className="text-sm font-medium text-gray-900">{t('bill_split.customer_for_new_bill')}</p>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={sameAsOriginal}
              onChange={(e) => {
                setSameAsOriginal(e.target.checked);
                if (e.target.checked) {
                  setSelectedCustomer(sourceCustomer ?? null);
                }
              }}
              disabled={isSubmitting}
            />
            {t('bill_split.same_as_original')}
          </label>
          {!sameAsOriginal && (
            <CustomerPicker
              value={selectedCustomer}
              onChange={setSelectedCustomer}
              disabled={isSubmitting}
            />
          )}
        </div>

        <div className="mx-6 mb-2 grid grid-cols-2 gap-3 rounded-lg bg-gray-50 p-4 text-sm">
          <div>
            <p className="text-gray-500">{t('bill_split.stays_on_bill')}</p>
            <p className="font-semibold text-gray-900">{formatCurrency(totals.staying)}</p>
          </div>
          <div>
            <p className="text-gray-500">{t('bill_split.moves_to_new_bill')}</p>
            <p className="font-semibold text-primary">{formatCurrency(totals.moving)}</p>
          </div>
        </div>

        {error && <p className="px-6 pb-2 text-sm text-red-600">{error}</p>}

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isSubmitting}>
            {t('common.cancel')}
          </Button>
          <Button onClick={handleConfirm} disabled={isSubmitting || !hasValidSelection}>
            {isSubmitting ? t('common.loading') : t('bill_split.split_confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BillSplitDialog;
