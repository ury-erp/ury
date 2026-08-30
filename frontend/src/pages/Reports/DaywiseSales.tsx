import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, DataTable, type DataTableColumn, Page, Section } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { LineChartCard } from '../../components/reports/charts/LineChartCard';
import { startOfMonth, endOfDay } from 'date-fns';
import { toApiDate } from '../../lib/reportDate';

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
  { key: 'date', header: 'Date' },
  { key: 'total_invoices', header: 'Invoices', align: 'right' },
  { key: 'item_total', header: 'Item Total', render: (r) => formatCurrency(r.item_total), align: 'right' },
  { key: 'total_taxes', header: 'Taxes', render: (r) => formatCurrency(r.total_taxes), align: 'right' },
  { key: 'grand_total', header: 'Grand Total', render: (r) => formatCurrency(r.grand_total), align: 'right' },
  { key: 'round_off', header: 'Round Off', render: (r) => formatCurrency(r.round_off), align: 'right' },
  { key: 'cash_discount', header: 'Cash Discounts', render: (r) => formatCurrency(r.cash_discount), align: 'right' },
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
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <Page>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Daywise Sales</h1>
          <p className="text-sm text-muted-foreground">
            Daily sales trend {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <Section>
          <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        </Section>
      )}

      {isLoading && !data ? (
        <Section>
          <div className="text-sm text-muted-foreground">Loading...</div>
        </Section>
      ) : data ? (
        <>
          <Section>
            <KpiStrip
              items={[
                { label: 'Period Total', value: formatCurrency(data.summary.period_total) },
                { label: 'Avg Daily Sales', value: formatCurrency(data.summary.period_avg_daily) },
                { label: 'Total Invoices', value: data.summary.total_invoices },
                {
                  label: 'Peak Day',
                  value: data.summary.peak_day ? `${data.summary.peak_day}` : '—',
                  hint: data.summary.peak_day ? formatCurrency(data.summary.peak_day_total) : undefined,
                },
              ]}
            />
          </Section>

          <Section>
            <LineChartCard
              title="Grand Total Trend"
              data={data.rows}
              xKey="date"
              yKeys={['grand_total']}
              labels={{ grand_total: 'Grand Total' }}
            />
          </Section>

          <Section>
            <DataTable columns={columns} rows={data.rows} isLoading={isLoading} />
          </Section>
        </>
      ) : null}
    </Page>
  );
}
