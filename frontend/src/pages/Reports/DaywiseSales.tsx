import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, DataTable, type DataTableColumn, type KpiItemProps, PageHeader } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { LineChartCard } from '../../components/reports/charts/LineChartCard';
import { startOfMonth, endOfDay } from 'date-fns';
import { toApiDate } from '../../lib/reportDate';
import { __ } from '../../i18n';

interface DayRow {
  date: string;
  total_invoices: number;
  item_total: number;
  total_taxes: number;
  grand_total: number;
  round_off: number;
  cash_discount: number;
}

interface DaywiseSalesData {
  branch: string | null;
  start_date: string;
  end_date: string;
  rows: DayRow[];
  summary: {
    period_total: number;
    period_avg_daily: number;
    total_invoices: number;
    peak_day: string | null;
    peak_day_total: number;
  };
}

const columns: DataTableColumn<DayRow>[] = [
  { key: 'date', header: __('Date') },
  { key: 'total_invoices', header: __('Invoices'), align: 'right' },
  { key: 'item_total', header: __('Item Total'), render: (r) => formatCurrency(r.item_total), align: 'right' },
  { key: 'total_taxes', header: __('Taxes'), render: (r) => formatCurrency(r.total_taxes), align: 'right' },
  { key: 'grand_total', header: __('Grand Total'), render: (r) => formatCurrency(r.grand_total), align: 'right' },
  { key: 'round_off', header: __('Round Off'), render: (r) => formatCurrency(r.round_off), align: 'right' },
  { key: 'cash_discount', header: __('Cash Discounts'), render: (r) => formatCurrency(r.cash_discount), align: 'right' },
];

export function DaywiseSales() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [data, setData] = useState<DaywiseSalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: DaywiseSalesData }>('ury.ury.report_api.sales.get_daywise_sales', {
        branch,
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
      });
      setData(res.message ?? (res as unknown as DaywiseSalesData));
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
        title={__('Daywise Sales')}
        description={__('Daily sales trend {0}', [activeBranchId === 'all' ? '· All Branches' : ''])}
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
            items={
              [
                {
                  label: __('Period Total'),
                  value: formatCurrency(data.summary.period_total),
                },
                {
                  label: __('Avg Daily Sales'),
                  value: formatCurrency(data.summary.period_avg_daily),
                },
                {
                  label: __('Total Invoices'),
                  value: data.summary.total_invoices,
                },
                {
                  label: __('Peak Day'),
                  value: data.summary.peak_day ? `${data.summary.peak_day}` : '—',
                  hint: data.summary.peak_day ? formatCurrency(data.summary.peak_day_total) : undefined,
                },
              ] satisfies KpiItemProps[]
            }
          />

          <LineChartCard
            title={__('Grand Total Trend')}
            data={data.rows}
            xKey="date"
            yKeys={['grand_total']}
            labels={{ grand_total: 'Grand Total' }}
          />

          <DataTable columns={columns} rows={data.rows} isLoading={isLoading} />
        </>
      ) : null}
    </div>
  );
}
