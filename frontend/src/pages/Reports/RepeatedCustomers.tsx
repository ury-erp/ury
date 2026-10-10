import { useCallback, useEffect, useState } from 'react';
import { call } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { Users, UserPlus, Repeat, Percent, AlertCircle } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';
import { t } from '../../i18n';
import { ReportSkeleton } from '../../components/reports/ReportSkeleton';

interface DayRow {
  date: string;
  total_customers: number;
  new_customers: number;
  repeat_customers: number;
  repeat_rate_percent: number;
}

interface RepeatedCustomersData {
  rows: DayRow[];
  summary: {
    total_customers: number;
    new_customers: number;
    repeat_customers: number;
    avg_repeat_rate_percent: number;
  };
}

const getColumns = (): DataTableColumn<DayRow>[] => [
  { key: 'date', header: t('fields.date') },
  { key: 'total_customers', header: t('fields.total'), align: 'right' },
  { key: 'new_customers', header: t('fields.new'), align: 'right' },
  { key: 'repeat_customers', header: t('fields.repeat'), align: 'right' },
  { key: 'repeat_rate_percent', header: t('fields.repeat_rate'), render: (r) => `${r.repeat_rate_percent}%`, align: 'right' },
];

export function RepeatedCustomers() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [data, setData] = useState<RepeatedCustomersData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: RepeatedCustomersData }>('ury.ury.report_api.customers.get_repeated_customers', {
        branch,
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
      });
      setData(res.message ?? (res as unknown as RepeatedCustomersData));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reports.common.load_failed'));
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
          <h1 className="text-xl font-semibold">{t('reports.repeated_customers.repeated_customers')}</h1>
          <p className="text-sm text-muted-foreground">
            New vs. repeat visits {activeBranchId === 'all' ? '· All Branches' : ''}
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

      {isLoading && !data ? (
        <ReportSkeleton chart />
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label={t('reports.repeated_customers.total_visits')} value={data.summary.total_customers} icon={<Users className="w-4 h-4" />} />
            <StatCard label={t('reports.repeated_customers.new_customers')} value={data.summary.new_customers} icon={<UserPlus className="w-4 h-4" />} />
            <StatCard label={t('reports.repeated_customers.repeat_visits')} value={data.summary.repeat_customers} icon={<Repeat className="w-4 h-4" />} />
            <StatCard
              label={t('reports.repeated_customers.avg_repeat_rate')}
              value={`${data.summary.avg_repeat_rate_percent}%`}
              icon={<Percent className="w-4 h-4" />}
            />
          </div>

          <BarChartCard
            title={t('reports.repeated_customers.new_vs_repeat_visits')}
            data={data.rows}
            xKey="date"
            yKeys={['new_customers', 'repeat_customers']}
            labels={{ new_customers: t('fields.new_customers'), repeat_customers: t('fields.repeat_customers') }}
          />

          <DataTable columns={getColumns()} rows={data.rows} isLoading={isLoading} />
        </>
      ) : null}
    </div>
  );
}
