import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { DataTable, type DataTableColumn, Button, Page, Section } from '@ury/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { startOfMonth, endOfDay } from 'date-fns';
import { toApiDate } from '../../lib/reportDate';

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

const columns: DataTableColumn<InvoiceRow>[] = [
  { key: 'date', header: 'Date' },
  { key: 'time', header: 'Time' },
  { key: 'invoice', header: 'Invoice' },
  { key: 'item_total', header: 'Item Total', render: (r) => formatCurrency(r.item_total), align: 'right' },
  { key: 'total_taxes', header: 'Taxes', render: (r) => formatCurrency(r.total_taxes), align: 'right' },
  { key: 'grand_total', header: 'Grand Total', render: (r) => formatCurrency(r.grand_total), align: 'right' },
  { key: 'received_amount', header: 'Received', render: (r) => formatCurrency(r.received_amount), align: 'right' },
  { key: 'cash_discounts', header: 'Cash Discounts', render: (r) => formatCurrency(r.cash_discounts), align: 'right' },
  { key: 'payment_mode', header: 'Payment Mode', render: (r) => r.payment_mode || '—' },
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

  const pagination = data?.pagination;

  return (
    <Page>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Daywise Invoices</h1>
          <p className="text-sm text-muted-foreground">
            Invoice-level detail {activeBranchId === 'all' ? '· All Branches' : ''}
            {pagination ? ` · ${pagination.total} invoices` : ''}
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <Section>
          <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        </Section>
      )}

      <Section>
        <DataTable columns={columns} rows={data?.invoices ?? []} isLoading={isLoading} />
      </Section>

      {pagination && pagination.total_pages > 1 && (
        <Section>
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
        </Section>
      )}
    </Page>
  );
}
