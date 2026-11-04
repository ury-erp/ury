import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { DataTable, type DataTableColumn, Button, PageHeader } from '@ury/ui';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { DeskLink } from '../../components/DeskLink';
import { startOfMonth, endOfDay } from 'date-fns';
import { toApiDate } from '../../lib/reportDate';
import { __ } from '../../i18n';

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
  { key: 'date', header: __('Date') },
  { key: 'time', header: __('Time') },
  {
    key: 'invoice',
    header: __('Invoice'),
    render: (r) => (
      <span className="inline-flex items-center gap-1.5">
        <bdi dir="ltr" className="num">{r.invoice}</bdi>
        {/* Link to editable desk document; this report is read-only */}
        <DeskLink doctype="POS Invoice" name={r.invoice} iconOnly />
      </span>
    ),
  },
  { key: 'item_total', header: __('Item Total'), render: (r) => <bdi dir="ltr" className="num">{formatCurrency(r.item_total)}</bdi>, align: 'right' },
  { key: 'total_taxes', header: __('Taxes'), render: (r) => <bdi dir="ltr" className="num">{formatCurrency(r.total_taxes)}</bdi>, align: 'right' },
  { key: 'grand_total', header: __('Grand Total'), render: (r) => <bdi dir="ltr" className="num">{formatCurrency(r.grand_total)}</bdi>, align: 'right' },
  { key: 'received_amount', header: __('Received'), render: (r) => <bdi dir="ltr" className="num">{formatCurrency(r.received_amount)}</bdi>, align: 'right' },
  { key: 'cash_discounts', header: __('Cash Discounts'), render: (r) => <bdi dir="ltr" className="num">{formatCurrency(r.cash_discounts)}</bdi>, align: 'right' },
  { key: 'payment_mode', header: __('Payment Mode'), render: (r) => r.payment_mode || '—' },
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
      setError(err instanceof Error ? err.message : __('Failed to load report data.'));
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
      <PageHeader
        title={__('Daywise Invoices')}
        description={[
          __('Invoice-level detail'),
          activeBranchId === 'all' ? `· ${__('All Branches')}` : '',
          pagination ? `· ${__('{0} invoices', [pagination.total])}` : '',
        ].filter(Boolean).join(' ')}
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <DataTable columns={columns} rows={data?.invoices ?? []} isLoading={isLoading} />

      {pagination && pagination.total_pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">
            {__('Page {0} of {1}', [pagination.page, pagination.total_pages])}
          </span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft className="w-4 h-4 rtl:-scale-x-100" /> {__('Prev')}
            </Button>
            <Button
              variant="outline"
              disabled={page >= pagination.total_pages}
              onClick={() => setPage((p) => p + 1)}
            >
              {__('Next')} <ChevronRight className="w-4 h-4 rtl:-scale-x-100" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
