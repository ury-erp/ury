import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { DataTable, type DataTableColumn, Button } from '@ury/ui';
import { ChevronLeft, ChevronRight, AlertCircle } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { startOfMonth, endOfDay } from 'date-fns';
import { toApiDate } from '../../lib/reportDate';
import { t } from '../../i18n';

interface InvoiceRow {
  date: string;
  time: string;
  invoice: string;
  item_total: number;
  total_taxes: number;
  grand_total: number;
  round_off: number;
  rounded_total: number;
  received_amount: number;
  change_amount: number;
  cash_discounts: number;
  payment_mode: string | null;
}

interface DaywiseInvoicesData {
  invoices: InvoiceRow[];
  pagination: { page: number; page_size: number; total: number; total_pages: number };
}

const getColumns = (): DataTableColumn<InvoiceRow>[] => [
  { key: 'date', header: t('fields.date') },
  { key: 'time', header: t('fields.time') },
  { key: 'invoice', header: t('fields.invoice') },
  { key: 'item_total', header: t('fields.item_total'), render: (r) => formatCurrency(r.item_total), align: 'right' },
  { key: 'total_taxes', header: t('fields.taxes'), render: (r) => formatCurrency(r.total_taxes), align: 'right' },
  { key: 'grand_total', header: t('fields.grand_total'), render: (r) => formatCurrency(r.grand_total), align: 'right' },
  { key: 'received_amount', header: t('fields.received'), render: (r) => formatCurrency(r.received_amount), align: 'right' },
  { key: 'cash_discounts', header: t('fields.cash_discounts'), render: (r) => formatCurrency(r.cash_discounts), align: 'right' },
  { key: 'payment_mode', header: t('fields.payment_mode'), render: (r) => r.payment_mode || '—' },
];

const PAGE_SIZE = 50;

export function DaywiseInvoices() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DaywiseInvoicesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: DaywiseInvoicesData }>('ury.ury.report_api.sales.get_daywise_invoices', {
        branch,
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
        page,
        page_size: PAGE_SIZE,
      });
      setData(res.message ?? (res as unknown as DaywiseInvoicesData));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reports.common.load_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, range, page]);

  useEffect(() => {
    setPage(1);
  }, [activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('reports.daywise_invoices.daywise_invoices')}</h1>
          <p className="text-sm text-muted-foreground">
            Invoice-level detail {activeBranchId === 'all' ? '· All Branches' : ''}
            {pagination ? ` · ${pagination.total} invoices` : ''}
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-slide-in"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <DataTable columns={getColumns()} rows={data?.invoices ?? []} isLoading={isLoading} />

      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {pagination.page} of {pagination.total_pages}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4" />{t('common.prev')}</Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.total_pages}
              onClick={() => setPage((p) => p + 1)}
            >{t('common.next')}<ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
