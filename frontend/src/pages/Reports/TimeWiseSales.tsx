import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { IndianRupee, Receipt, TrendingUp, Trophy, AlertCircle } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';
import { toApiDate } from '../../lib/reportDate';
import { DatePicker } from '../../components/setup/DatePicker';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { t } from '../../i18n';
import { ReportSkeleton } from '../../components/reports/ReportSkeleton';

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

const getColumns = (): DataTableColumn<IntervalRow>[] => [
  { key: 'interval_label', header: t('fields.time_interval') },
  { key: 'sales', header: t('fields.sales'), render: (r) => formatCurrency(r.sales), align: 'right' },
  { key: 'bills', header: t('fields.bills'), align: 'right' },
  { key: 'pct_of_daily_total', header: t('fields.of_day'), render: (r) => `${r.pct_of_daily_total}%`, align: 'right' },
  { key: 'avg_transaction_value', header: t('fields.avg_bill'), render: (r) => formatCurrency(r.avg_transaction_value), align: 'right' },
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
      setError(err instanceof Error ? err.message : t('reports.common.load_failed'));
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
          <h1 className="text-xl font-semibold">{t('reports.time_wise_sales.time_wise_sales')}</h1>
          <p className="text-sm text-muted-foreground">
            Sales by time of day {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-40">
            <SearchableSelect
              id="bucket-size"
              value={String(bucketSize)}
              onChange={(_, val) => setBucketSize(Number(val))}
              options={BUCKET_OPTIONS.map((b) => ({
                value: String(b),
                label: `${b}-hour buckets`,
              }))}
              strict
            />
          </div>
          <DatePicker
            id="timewise-sales-date"
            value={date}
            maxDate={toApiDate(new Date())}
            onChange={(_id, val) => setDate(val)}
            className="w-36"
          />
        </div>
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

      {isLoading && !data ? (
        <ReportSkeleton chart />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              label={t('reports.time_wise_sales.total_sales')}
              value={formatCurrency(data.summary.total_sales)}
              icon={<IndianRupee className="w-4 h-4" />}
            />
            <StatCard label={t('reports.time_wise_sales.total_bills')} value={data.summary.total_bills} icon={<Receipt className="w-4 h-4" />} />
            <StatCard
              label={t('reports.time_wise_sales.avg_bill')}
              value={formatCurrency(data.summary.avg_sale_per_bill)}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <StatCard
              label={t('reports.time_wise_sales.peak_interval')}
              value={data.summary.peak_interval ?? '—'}
              delta={
                data.summary.peak_interval
                  ? { value: formatCurrency(data.summary.peak_interval_sales), direction: 'up' }
                  : undefined
              }
              icon={<Trophy className="w-4 h-4" />}
            />
          </div>

          <BarChartCard
            title={t('reports.time_wise_sales.sales_by_time_of_day')}
            data={data.intervals}
            xKey="interval_label"
            yKeys={['sales']}
            labels={{ sales: t('fields.sales') }}
          />

          <DataTable columns={getColumns()} rows={data.intervals} isLoading={isLoading} />
        </>
      ) : null}
    </div>
  );
}
