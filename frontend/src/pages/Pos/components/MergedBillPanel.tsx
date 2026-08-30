import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { formatCurrency } from '@ury/core';
import { getPOSInvoiceItems, type POSInvoice, type POSInvoiceItem } from '../lib/invoice-api';
import { t } from '../i18n';
import { Spinner } from '@ury/ui';
import { Button } from '@ury/ui';

interface MergedBillPanelProps {
  order: Pick<POSInvoice, 'name' | 'custom_merged_pos_invoice' | 'custom_merged_total' | 'rounded_total'>;
  onOpenSecondary?: (invoiceName: string) => void;
}

const MergedBillPanel = ({ order, onOpenSecondary }: MergedBillPanelProps) => {
  const secondaryName = order.custom_merged_pos_invoice;
  const [items, setItems] = useState<POSInvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!secondaryName) {
      setItems([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    getPOSInvoiceItems(secondaryName)
      .then(({ items: secondaryItems }) => {
        if (!cancelled) setItems(secondaryItems);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [secondaryName]);

  if (!secondaryName) {
    return null;
  }

  const combinedTotal =
    (order.rounded_total ?? 0) + (order.custom_merged_total ?? 0);

  return (
    <div className="mb-6 rounded-lg border-2 border-primary-200 bg-primary-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-text-tertiary" />
          <h3 className="text-sm font-semibold text-foreground">{t('bill_merge.merged_bill')}</h3>
        </div>
        {onOpenSecondary && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onOpenSecondary(secondaryName)}
          >
            {t('bill_merge.open_secondary')}
          </Button>
        )}
      </div>

      <div className="mb-3 flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm">
        <span className="font-medium text-foreground">{secondaryName}</span>
        <span className="font-semibold text-foreground tabular-nums">
          {formatCurrency(Math.round(order.custom_merged_total ?? 0))}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-text-tertiary">
          <Spinner className="h-4 w-4" hideMessage  message={t('common.loading')} />
          {t('common.loading')}
        </div>
      ) : items.length > 0 ? (
        <div className="space-y-1">
          <p className="mb-2 text-xs font-medium text-muted-foreground">{t('bill_merge.merged_items')}</p>
          {items.map((item) => (
            <div
              key={item.name}
              className="flex items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              <span className="truncate text-foreground">{item.item_name}</span>
              <span className="ms-2 shrink-0 text-muted-foreground tabular-nums">
                {item.qty} × {formatCurrency(item.rate)}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between border-t border-primary-200 pt-3 text-sm">
        <span className="font-medium text-muted-foreground">{t('bill_merge.combined_total')}</span>
        <span className="font-bold text-primary tabular-nums">{formatCurrency(combinedTotal)}</span>
      </div>
    </div>
  );
};

export default MergedBillPanel;
