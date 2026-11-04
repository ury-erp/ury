import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, type KpiItemProps, DataTable, type DataTableColumn, PageHeader } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { LineChartCard } from '../../components/reports/charts/LineChartCard';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';
import { __ } from '../../i18n';

interface ABVRow {
  date: string;
  bill_count: number;
  total_sales: number;
  abv: number;
}

interface AverageBillValueData {
  data: ABVRow[];
  summary: { total_bills: number; total_sales: number; average_abv: number };
}

const columns: DataTableColumn<ABVRow>[] = [
  { key: 'date', header: __('Date') },
  { key: 'bill_count', header: __('Bills'), align: 'right' },
  { key: 'total_sales', header: __('Total Sales'), render: (r) => formatCurrency(r.total_sales), align: 'right' },
  { key: 'abv', header: 'ABV', render: (r) => formatCurrency(r.abv), align: 'right' },
];

export function AverageBillValue() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [data, setData] = useState<AverageBillValueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: AverageBillValueData }>('ury.ury.report_api.sales.get_average_bill_value', {
        branch,
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
      });
      setData(res.message ?? (res as unknown as AverageBillValueData));
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
        title={__('Average Bill Value')}
        description={__('Daily average bill trend {0}', [activeBranchId === 'all' ? '· All Branches' : ''])}
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
              { label: __('Total Bills'), value: data.summary.total_bills },
              { label: __('Total Sales'), value: formatCurrency(data.summary.total_sales) },
              { label: __('Average Bill Value'), value: formatCurrency(data.summary.average_abv) },
            ] satisfies KpiItemProps[]}
          />

          <LineChartCard title={__('ABV Trend')} data={data.data} xKey="date" yKeys={['abv']} labels={{ abv: 'Avg Bill Value' }} />

          <DataTable columns={columns} rows={data.data} isLoading={isLoading} />
        </>
      ) : null}
    </div>
  );
}
