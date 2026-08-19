import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn, Button } from '@ury/ui';
import { Package, IndianRupee, Hash, ChevronLeft, ChevronRight } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';

interface ItemRow {
  item_code: string;
  item_name: string;
  item_group: string | null;
  qty: number;
  amount: number;
  avg_price: number;
  pct_of_total_amount: number;
}

interface ItemWiseSalesData {
  items: ItemRow[];
  summary: { total_qty: number; total_amount: number; unique_items: number };
  pagination: { page: number; page_size: number; total: number; total_pages: number };
}

const PAGE_SIZE = 50;

const columns: DataTableColumn<ItemRow>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'item_group', header: 'Group', render: (r) => r.item_group || '—' },
  { key: 'qty', header: 'Qty', align: 'right' },
  { key: 'amount', header: 'Amount', render: (r) => formatCurrency(r.amount), align: 'right' },
  { key: 'avg_price', header: 'Avg Price', render: (r) => formatCurrency(r.avg_price), align: 'right' },
  { key: 'pct_of_total_amount', header: '% of Total', render: (r) => `${r.pct_of_total_amount}%`, align: 'right' },
];

export function ItemWiseSales() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<ItemWiseSalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: ItemWiseSalesData }>('ury.ury.report_api.items.get_item_wise_sales', {
        branch,
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
        search: search || undefined,
        page,
        page_size: PAGE_SIZE,
      });
      setData(res.message ?? (res as unknown as ItemWiseSalesData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, range, search, page]);

  useEffect(() => {
    setPage(1);
  }, [activeBranchId, range, search]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const pagination = data?.pagination;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Item Wise Sales</h1>
          <p className="text-sm text-muted-foreground">
            Best-selling items {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Search items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="border border-input rounded-md px-3 py-1.5 text-sm w-40"
          />
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="Unique Items Sold" value={data.summary.unique_items} icon={<Package className="w-4 h-4" />} />
          <StatCard label="Total Qty" value={data.summary.total_qty} icon={<Hash className="w-4 h-4" />} />
          <StatCard
            label="Total Amount"
            value={formatCurrency(data.summary.total_amount)}
            icon={<IndianRupee className="w-4 h-4" />}
          />
        </div>
      )}

      <DataTable columns={columns} rows={data?.items ?? []} isLoading={isLoading} />

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
