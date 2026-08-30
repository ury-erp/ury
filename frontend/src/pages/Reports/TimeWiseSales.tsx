import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, DataTable, type DataTableColumn, Select, Input } from '@ury/ui';
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
  { key: 'sales', header: 'Sales', render: (r) => formatCurrency(r.sales), align: 'right' },
  { key: 'bills', header: 'Bills', align: 'right' },
  { key: 'pct_of_daily_total', header: '% of Day', render: (r) => `${r.pct_of_daily_total}%`, align: 'right' },
  { key: 'avg_transaction_value', header: 'Avg / Bill', render: (r) => formatCurrency(r.avg_transaction_value), align: 'right' },
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
          <Select
            value={bucketSize}
            onChange={(e) => setBucketSize(Number(e.target.value))}
          >
            {BUCKET_OPTIONS.map((b) => (
              <option key={b} value={b}>
                {b}-hour buckets
              </option>
            ))}
          </Select>
          <Input
            type="date"
            value={date}
            max={toApiDate(new Date())}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading && !data ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : data ? (
        <>
          <KpiStrip
            items={[
              { label: 'Total Sales', value: formatCurrency(data.summary.total_sales) },
              { label: 'Total Bills', value: data.summary.total_bills },
              { label: 'Avg / Bill', value: formatCurrency(data.summary.avg_sale_per_bill) },
              {
                label: 'Peak Interval',
                value: data.summary.peak_interval ?? '—',
                hint: data.summary.peak_interval ? formatCurrency(data.summary.peak_interval_sales) : undefined,
              },
            ]}
          />

          <BarChartCard
            title="Sales by Time of Day"
            data={data.intervals}
            xKey="interval_label"
            yKeys={['sales']}
            labels={{ sales: 'Sales' }}
          />

          <DataTable columns={columns} rows={data.intervals} isLoading={isLoading} />
        </>
      ) : null}
    </div>
  );
}
