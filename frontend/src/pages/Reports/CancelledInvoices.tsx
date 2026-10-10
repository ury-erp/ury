import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn, Button } from '@ury/ui';
import { Ban, IndianRupee, Users, ChevronLeft, ChevronRight, AlertTriangle, AlertCircle } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';
import { t } from '../../i18n';

interface CancelledInvoiceRow {
  date: string;
  time: string;
  invoice: string;
  amount: number;
  cancelled_by: string;
  cancellation_reason: string | null;
}

interface CancelledInvoicesData {
  invoices: CancelledInvoiceRow[];
  summary: { total_count: number; total_amount: number; unique_cancellers: number; avg_amount: number };
  pagination: { page: number; page_size: number; total: number; total_pages: number };
}

const PAGE_SIZE = 50;
// A cancelled invoice worth more than 2x the average is flagged for review —
// matches the research brief's fraud/loss-prevention framing for this report.
const HIGH_VALUE_MULTIPLIER = 2;

export function CancelledInvoices() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [page, setPage] = useState(1);
  const [data, setData] = useState<CancelledInvoicesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: CancelledInvoicesData }>('ury.ury.report_api.sales.get_cancelled_invoices', {
        branch,
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
        page,
        page_size: PAGE_SIZE,
      });
      setData(res.message ?? (res as unknown as CancelledInvoicesData));
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

  const threshold = data ? data.summary.avg_amount * HIGH_VALUE_MULTIPLIER : Infinity;

  const columns: DataTableColumn<CancelledInvoiceRow>[] = [
    { key: 'date', header: t('fields.date') },
    { key: 'time', header: t('fields.time') },
    { key: 'invoice', header: t('fields.invoice') },
    {
      key: 'amount',
      header: t('fields.amount'),
      align: 'right',
      render: (r) => (
        <span className={r.amount > threshold ? 'flex items-center gap-1 text-red-600 font-semibold' : ''}>
          {r.amount > threshold && <AlertTriangle className="w-3.5 h-3.5" />}
          {formatCurrency(r.amount)}
        </span>
      ),
    },
    { key: 'cancelled_by', header: t('fields.cancelled_by') },
    { key: 'cancellation_reason', header: t('fields.reason'), render: (r) => r.cancellation_reason || '—' },
  ];

  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('reports.cancelled_invoices.cancelled_invoices')}</h1>
          <p className="text-sm text-muted-foreground">
            Cancellation audit {activeBranchId === 'all' ? '· All Branches' : ''}
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

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label={t('reports.cancelled_invoices.total_cancelled')} value={data.summary.total_count} icon={<Ban className="w-4 h-4" />} />
          <StatCard
            label={t('reports.cancelled_invoices.total_amount')}
            value={formatCurrency(data.summary.total_amount)}
            icon={<IndianRupee className="w-4 h-4" />}
          />
          <StatCard
            label={t('reports.cancelled_invoices.unique_cancellers')}
            value={data.summary.unique_cancellers}
            icon={<Users className="w-4 h-4" />}
          />
        </div>
      )}

      <DataTable columns={columns} rows={data?.invoices ?? []} isLoading={isLoading} />

      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            Page {pagination.page} of {pagination.total_pages}
          </span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
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
