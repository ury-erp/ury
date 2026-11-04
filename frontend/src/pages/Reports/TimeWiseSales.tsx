import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, DataTable, type DataTableColumn, DatePicker, Select, PageHeader } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';
import { toApiDate } from '../../lib/reportDate';
import { __ } from '../../i18n';

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
  { key: 'interval_label', header: __('Time Interval') },
  { key: 'sales', header: __('Sales'), render: (r) => formatCurrency(r.sales), align: 'right' },
  { key: 'bills', header: __('Bills'), align: 'right' },
  { key: 'pct_of_daily_total', header: '% of Day', render: (r) => `${r.pct_of_daily_total}%`, align: 'right' },
  { key: 'avg_transaction_value', header: __('Avg / Bill'), render: (r) => formatCurrency(r.avg_transaction_value), align: 'right' },
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
      setError(err instanceof Error ? err.message : __('Failed to load report data.'));
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, date, bucketSize]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={__('Time Wise Sales')}
        description={__('Sales by time of day {0}', [activeBranchId === 'all' ? '· All Branches' : ''])}
        actions={
          <>
            <Select
              value={bucketSize}
              onChange={(e) => setBucketSize(Number(e.target.value))}
            >
              {BUCKET_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b}{__('-hour buckets')}
                </option>
              ))}
            </Select>
            <DatePicker
              id="report-date"
              aria-label={__('Report date')}
              value={date}
              maxDate={toApiDate(new Date())}
              onChange={(_id, next) => setDate(next)}
              className="w-[150px]"
            />
          </>
        }
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading && !data ? (
        <div className="text-sm text-muted-foreground">{__('Loading…')}</div>
      ) : data ? (
        <>
          <KpiStrip
            items={[
              { label: __('Total Sales'), value: formatCurrency(data.summary.total_sales) },
              { label: __('Total Bills'), value: data.summary.total_bills },
              { label: __('Avg / Bill'), value: formatCurrency(data.summary.avg_sale_per_bill) },
              {
                label: __('Peak Interval'),
                value: data.summary.peak_interval ?? '—',
                hint: data.summary.peak_interval ? formatCurrency(data.summary.peak_interval_sales) : undefined,
              },
            ]}
          />

          <BarChartCard
            title={__('Sales by Time of Day')}
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
