import { useEffect, useMemo, useState } from 'react';
import { Check, Minus, Plus } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ury/ui';
import { Button } from '@ury/ui';
import { cn } from '@ury/ui';
import { formatCurrency } from '@ury/core';
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
        className="max-h-dialog-max-h overflow-y-auto"
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
                role="button"
                tabIndex={isSubmitting ? -1 : 0}
                onClick={() => !isSubmitting && toggleItem(item, !isSelected)}
                onKeyDown={(e) => {
                  if (isSubmitting) return;
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggleItem(item, !isSelected);
                  }
                }}
                className={cn(
                  'rounded-lg border p-3 transition-colors',
                  isSubmitting ? 'cursor-default' : 'cursor-pointer',
                  isSelected ? 'border-primary bg-primary-50/40' : 'border-border hover:border-border'
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border',
                      isSelected ? 'border-foreground bg-foreground text-background' : 'border-border bg-card'
                    )}
                    aria-hidden
                  >
                    {isSelected && <Check className="h-3 w-3" strokeWidth={3} />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-medium text-foreground">{item.item_name}</p>
                        <p className="text-xs text-text-tertiary">
                          {t('bill_split.available_qty', { qty: item.qty })}
                        </p>
                      </div>
                      <span className="text-sm font-semibold text-foreground">
                        {formatCurrency(item.amount)}
                      </span>
                    </div>

                    {isSelected && item.qty > 1 && (
                      <div
                        className="mt-3 flex items-center gap-2"
                        onClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => e.stopPropagation()}
                      >
                        <span className="text-xs font-medium text-muted-foreground">
                          {t('bill_split.move_qty')}
                        </span>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="h-7 w-7"
                          onClick={(e) => {
                            e.stopPropagation();
                            adjustQty(item, -1);
                          }}
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
                          onClick={(e) => {
                            e.stopPropagation();
                            adjustQty(item, 1);
                          }}
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

        <div className="mx-6 mb-4 space-y-3 rounded-lg border border-border p-4">
          <p className="text-sm font-medium text-foreground">{t('bill_split.customer_for_new_bill')}</p>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
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

        <div className="mx-6 mb-2 grid grid-cols-2 gap-3 rounded-lg bg-muted p-4 text-sm">
          <div>
            <p className="text-text-tertiary">{t('bill_split.stays_on_bill')}</p>
            <p className="font-semibold text-foreground">{formatCurrency(totals.staying)}</p>
          </div>
          <div>
            <p className="text-text-tertiary">{t('bill_split.moves_to_new_bill')}</p>
            <p className="font-semibold text-primary">{formatCurrency(totals.moving)}</p>
          </div>
        </div>

        {error && <p className="px-6 pb-2 text-sm text-destructive">{error}</p>}

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
