import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn, Button } from '@ury/ui';
import { Ban, IndianRupee, Users, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';

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
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
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
    { key: 'date', header: 'Date' },
    { key: 'time', header: 'Time' },
    { key: 'invoice', header: 'Invoice' },
    {
      key: 'amount',
      header: 'Amount',
      render: (r) => (
        <span className={r.amount > threshold ? 'flex items-center gap-1 text-red-600 font-semibold' : ''}>
          {r.amount > threshold && <AlertTriangle className="w-3.5 h-3.5" />}
          {formatCurrency(r.amount)}
        </span>
      ),
    },
    { key: 'cancelled_by', header: 'Cancelled By' },
    { key: 'cancellation_reason', header: 'Reason', render: (r) => r.cancellation_reason || '—' },
  ];

  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Cancelled Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Cancellation audit {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Total Cancelled" value={data.summary.total_count} icon={<Ban className="w-4 h-4" />} />
          <StatCard
            label="Total Amount"
            value={formatCurrency(data.summary.total_amount)}
            icon={<IndianRupee className="w-4 h-4" />}
          />
          <StatCard
            label="Unique Cancellers"
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
              <ChevronLeft className="w-4 h-4" /> Prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= pagination.total_pages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
