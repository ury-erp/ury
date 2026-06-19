import { useEffect, useState } from 'react';
import { Link2 } from 'lucide-react';
import { cn, formatCurrency } from '../lib/utils';
import { getSplitGroup, type SplitGroupInvoice } from '../lib/invoice-api';
import { t } from '../i18n';
import { Spinner } from './ui/spinner';

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
    <div className="mb-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Link2 className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">{t('bill_split.related_bills')}</h3>
      </div>
      <div className="space-y-2">
        {invoices.map((invoice) => {
          const isCurrent = invoice.name === invoiceName;
          const isPaid = invoice.docstatus === 1;
          const isOpen = invoice.docstatus === 0;

          return (
            <div
              key={invoice.name}
              className={cn(
                'flex items-center justify-between rounded-md border px-3 py-2 text-sm',
                isCurrent ? 'border-primary bg-primary-50/50' : 'border-gray-200 bg-white',
                isPaid && 'opacity-60'
              )}
            >
              <div className="min-w-0 flex-1">
                {isOpen ? (
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
                ) : (
                  <span className="truncate font-medium text-gray-700">{invoice.name}</span>
                )}
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {invoice.is_original && (
                    <span>{t('bill_split.original_bill')}</span>
                  )}
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
