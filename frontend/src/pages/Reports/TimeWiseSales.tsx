import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { IndianRupee, Receipt, TrendingUp, Trophy } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';
import { toApiDate } from '../../lib/reportDate';

interface IntervalRow {
  interval_label: string;
  start_hour: number;
  end_hour: number;
  sales: number;
  bills: number;
  pct_of_daily_total: number;
  avg_transaction_value: number;
}

interface TimeWiseSalesData {
  branch: string | null;
  date: string;
  bucket_size_hours: number;
  intervals: IntervalRow[];
  summary: {
    total_sales: number;
    total_bills: number;
    avg_sale_per_bill: number;
    peak_interval: string | null;
    peak_interval_sales: number;
  };
}

const columns: DataTableColumn<IntervalRow>[] = [
  { key: 'interval_label', header: 'Time Interval' },
  { key: 'sales', header: 'Sales', render: (r) => formatCurrency(r.sales) },
  { key: 'bills', header: 'Bills' },
  { key: 'pct_of_daily_total', header: '% of Day', render: (r) => `${r.pct_of_daily_total}%` },
  { key: 'avg_transaction_value', header: 'Avg / Bill', render: (r) => formatCurrency(r.avg_transaction_value) },
];

const BUCKET_OPTIONS = [1, 2, 4];

export function TimeWiseSales() {
  const { activeBranchId } = useBranchContext();
  const [date, setDate] = useState<string>(() => toApiDate(new Date()));
  const [bucketSize, setBucketSize] = useState(2);
  const [data, setData] = useState<TimeWiseSalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: TimeWiseSalesData }>('ury.ury.report_api.sales.get_time_wise_sales', {
        branch,
        date,
        bucket_size_hours: bucketSize,
      });
      setData(res.message ?? (res as unknown as TimeWiseSalesData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, date, bucketSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Time Wise Sales</h1>
          <p className="text-sm text-muted-foreground">
            Sales by time of day {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={bucketSize}
            onChange={(e) => setBucketSize(Number(e.target.value))}
            className="border border-input rounded-md px-3 py-1.5 text-sm"
          >
            {BUCKET_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b}-hour buckets
              </option>
            ))}
          </select>
          <input
            type="date"
            value={date}
            max={toApiDate(new Date())}
            onChange={(e) => setDate(e.target.value)}
            className="border border-input rounded-md px-3 py-1.5 text-sm"
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading && !data ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label="Total Sales"
              value={formatCurrency(data.summary.total_sales)}
              icon={<IndianRupee className="w-4 h-4" />}
            />
            <StatCard label="Total Bills" value={data.summary.total_bills} icon={<Receipt className="w-4 h-4" />} />
            <StatCard
              label="Avg / Bill"
              value={formatCurrency(data.summary.avg_sale_per_bill)}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <StatCard
              label="Peak Interval"
              value={data.summary.peak_interval ?? '—'}
              delta={
                data.summary.peak_interval
                  ? { value: formatCurrency(data.summary.peak_interval_sales), direction: 'up' }
                  : undefined
              }
              icon={<Trophy className="w-4 h-4" />}
            />
          </div>

          <BarChartCard title="Sales by Time of Day" data={data.intervals} xKey="interval_label" yKeys={['sales']} />

          <DataTable columns={columns} rows={data.intervals} isLoading={isLoading} />
        </>
      ) : null}
    </div>
  );
}
