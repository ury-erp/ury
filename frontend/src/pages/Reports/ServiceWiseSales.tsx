import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { IndianRupee, Receipt, TrendingUp } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { PieChartCard } from '../../components/reports/charts/PieChartCard';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';

interface ServiceRow {
  order_type: string;
  revenue: number;
  order_count: number;
  avg_order_value: number;
  percentage_of_total: number;
}

interface ServiceWiseSalesData {
  by_service_type: ServiceRow[];
  summary: { total_revenue: number; total_orders: number; avg_order_value: number };
}

const columns: DataTableColumn<ServiceRow>[] = [
  { key: 'order_type', header: 'Order Type' },
  { key: 'order_count', header: '# Orders', align: 'right' },
  { key: 'revenue', header: 'Revenue', render: (r) => formatCurrency(r.revenue), align: 'right' },
  { key: 'avg_order_value', header: 'Avg Order Value', render: (r) => formatCurrency(r.avg_order_value), align: 'right' },
  { key: 'percentage_of_total', header: '% of Total', render: (r) => `${r.percentage_of_total}%`, align: 'right' },
];

export function ServiceWiseSales() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [data, setData] = useState<ServiceWiseSalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: ServiceWiseSalesData }>('ury.ury.report_api.sales.get_service_wise_sales', {
        branch,
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
      });
      setData(res.message ?? (res as unknown as ServiceWiseSalesData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Service Wise Sales</h1>
          <p className="text-sm text-muted-foreground">
            Revenue by order type {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <div className="rounded-md border border-destructive bg-destructive-tint px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading && !data ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label="Total Revenue"
              value={formatCurrency(data.summary.total_revenue)}
              icon={<IndianRupee className="w-4 h-4" />}
            />
            <StatCard label="Total Orders" value={data.summary.total_orders} icon={<Receipt className="w-4 h-4" />} />
            <StatCard
              label="Avg Order Value"
              value={formatCurrency(data.summary.avg_order_value)}
              icon={<TrendingUp className="w-4 h-4" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <PieChartCard
                title="Revenue by Order Type"
                data={data.by_service_type}
                dataKey="revenue"
                nameKey="order_type"
              />
            </div>
            <div className="lg:col-span-3">
              <DataTable columns={columns} rows={data.by_service_type} isLoading={isLoading} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
