import { useCallback, useEffect, useState } from 'react';
import { call } from '@ury/core';
import { KpiStrip, type KpiItemProps, DataTable, type DataTableColumn, PageHeader } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';
import { __ } from '../../i18n';

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

const columns: DataTableColumn<DayRow>[] = [
  { key: 'date', header: __('Date') },
  { key: 'total_customers', header: __('Total'), align: 'right' },
  { key: 'new_customers', header: __('New'), align: 'right' },
  { key: 'repeat_customers', header: __('Repeat'), align: 'right' },
  { key: 'repeat_rate_percent', header: __('Repeat Rate'), render: (r) => `${r.repeat_rate_percent}%`, align: 'right' },
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
      setError(err instanceof Error ? err.message : __('Failed to load report data.'));
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={__('Repeated Customers')}
        description={__('New vs. repeat visits {0}', [activeBranchId === 'all' ? '· All Branches' : ''])}
        actions={<DateRangeFilter value={range} onChange={setRange} />}
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
              { label: __('Total Visits'), value: data.summary.total_customers },
              { label: __('New Customers'), value: data.summary.new_customers },
              { label: __('Repeat Visits'), value: data.summary.repeat_customers },
              { label: __('Avg Repeat Rate'), value: `${data.summary.avg_repeat_rate_percent}%` },
            ] satisfies KpiItemProps[]}
          />

          <BarChartCard
            title={__('New vs Repeat Visits')}
            data={data.rows}
            xKey="date"
            yKeys={['new_customers', 'repeat_customers']}
            labels={{ new_customers: 'New Customers', repeat_customers: 'Repeat Customers' }}
          />

          <DataTable columns={columns} rows={data.rows} isLoading={isLoading} />
        </>
      ) : null}
    </div>
  );
}
