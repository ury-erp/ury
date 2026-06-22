import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Link2 } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { getSplitGroup, type SplitGroupInvoice } from '../lib/invoice-api';
import { t } from '../i18n';
import { Spinner } from './ui/spinner';
import { Button } from './ui/button';

interface SplitGroupPanelProps {
  invoiceName: string;
  onOpenInvoice: (invoice: SplitGroupInvoice) => void;
}

const SplitGroupPanel = ({ invoiceName, onOpenInvoice }: SplitGroupPanelProps) => {
  const [invoices, setInvoices] = useState<SplitGroupInvoice[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const result = await getSplitGroup(invoiceName);
        if (!cancelled) {
          setInvoices(result.invoices.length >= 2 ? result.invoices : []);
        }
      } catch {
        if (!cancelled) setInvoices([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [invoiceName]);

  const currentIndex = useMemo(
    () => invoices.findIndex((inv) => inv.name === invoiceName),
    [invoices, invoiceName]
  );

  const originalInvoice = useMemo(
    () => invoices.find((inv) => inv.is_original),
    [invoices]
  );

  const openSiblingAtOffset = (offset: number) => {
    if (currentIndex < 0) return;
    const nextIndex = currentIndex + offset;
    if (nextIndex < 0 || nextIndex >= invoices.length) return;
    onOpenInvoice(invoices[nextIndex]);
  };

  if (loading) {
    return (
      <div className="mb-6 flex items-center gap-2 text-sm text-gray-500">
        <Spinner className="h-4 w-4" hideMessage />
        {t('common.loading')}
      </div>
    );
  }

  if (invoices.length < 2) {
    return null;
  }

  return (
    <div className="mb-6 rounded-lg border-2 border-violet-200 bg-violet-50/60 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Link2 className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-900">{t('bill_split.related_bills')}</h3>
        </div>
        <div className="flex items-center gap-1">
          {originalInvoice && originalInvoice.name !== invoiceName && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => onOpenInvoice(originalInvoice)}
            >
              {t('bill_split.open_original')}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={currentIndex <= 0}
            onClick={() => openSiblingAtOffset(-1)}
            aria-label={t('bill_split.prev_bill')}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="h-7 w-7"
            disabled={currentIndex < 0 || currentIndex >= invoices.length - 1}
            onClick={() => openSiblingAtOffset(1)}
            aria-label={t('bill_split.next_bill')}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {invoices.map((invoice) => {
          const isCurrent = invoice.name === invoiceName;
          const isPaid = invoice.docstatus === 1;

          return (
            <div
              key={invoice.name}
              className={cn(
                'flex items-center justify-between rounded-md border px-3 py-2 text-sm',
                isCurrent ? 'border-primary bg-primary-50/50' : 'border-gray-200 bg-white',
                isPaid && !isCurrent && 'opacity-80'
              )}
            >
              <div className="min-w-0 flex-1">
                <button
                  type="button"
                  className={cn(
                    'truncate text-left font-medium hover:underline',
                    isCurrent ? 'text-primary' : 'text-gray-900'
                  )}
                  onClick={() => onOpenInvoice(invoice)}
                  disabled={isCurrent}
                >
                  {invoice.name}
                </button>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {invoice.is_original && <span>{t('bill_split.original_bill')}</span>}
                  {isCurrent && <span>{t('bill_split.current_bill')}</span>}
                  {isPaid ? (
                    <span>{t('bill_split.paid_bill')}</span>
                  ) : (
                    !isCurrent && <span>{t('bill_split.open_bill')}</span>
                  )}
                  <span>
                    {t('bill_split.split_indicator', {
                      index: invoice.split_index,
                      total: invoice.split_total,
                    })}
                  </span>
                  {(invoice.customer_name || invoice.customer) && (
                    <span className="truncate">{invoice.customer_name || invoice.customer}</span>
                  )}
                </div>
              </div>
              <span className="ms-3 shrink-0 font-semibold text-gray-900 tabular-nums">
                {formatCurrency(invoice.rounded_total)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default SplitGroupPanel;
