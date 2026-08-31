import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, DataTable, type DataTableColumn, Select } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';

interface MonthRow {
  year: number;
  month_number: number;
  month_name: string;
  month: string;
  item_total: number;
  taxes: number;
  grand_total: number;
  growth_percentage: number | null;
}

interface MonthWiseSalesData {
  branch: string | null;
  months_back: number;
  data: MonthRow[];
  summary: {
    total_revenue: number;
    average_monthly_revenue: number;
    best_month: string | null;
    worst_month: string | null;
  };
}

const columns: DataTableColumn<MonthRow>[] = [
  { key: 'month', header: 'Month' },
  { key: 'item_total', header: 'Item Total', render: (r) => formatCurrency(r.item_total), align: 'right' },
  { key: 'taxes', header: 'Taxes', render: (r) => formatCurrency(r.taxes), align: 'right' },
  { key: 'grand_total', header: 'Grand Total', render: (r) => formatCurrency(r.grand_total), align: 'right' },
  {
    key: 'growth_percentage',
    header: 'Growth',
    align: 'right',
    render: (r) =>
      r.growth_percentage === null ? '—' : `${r.growth_percentage > 0 ? '+' : ''}${r.growth_percentage}%`,
  },
];

const MONTH_OPTIONS = [3, 6, 12, 24];

export function MonthWiseSales() {
  const { activeBranchId } = useBranchContext();
  const [monthsBack, setMonthsBack] = useState(6);
  const [data, setData] = useState<MonthWiseSalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: MonthWiseSalesData }>('ury.ury.report_api.sales.get_month_wise_sales', {
        branch,
        months_back: monthsBack,
      });
      setData(res.message ?? (res as unknown as MonthWiseSalesData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, monthsBack]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Month Wise Sales</h1>
          <p className="text-sm text-muted-foreground">
            Monthly revenue trend {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <Select
          value={monthsBack}
          onChange={(e) => setMonthsBack(Number(e.target.value))}
          size="sm"
        >
          {MONTH_OPTIONS.map((m) => (
            <option key={m} value={m}>
              Last {m} months
            </option>
          ))}
        </Select>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading && !data ? (
        <div className="text-sm text-muted-foreground">Loading…</div>
      ) : data ? (
        <>
          <KpiStrip
            items={[
              { label: 'Total Revenue', value: formatCurrency(data.summary.total_revenue) },
              { label: 'Avg Monthly', value: formatCurrency(data.summary.average_monthly_revenue) },
              { label: 'Best Month', value: data.summary.best_month ?? '—' },
              { label: 'Weakest Month', value: data.summary.worst_month ?? '—' },
            ]}
          />

          <BarChartCard
            title="Monthly Grand Total"
            data={data.data}
            xKey="month"
            yKeys={['grand_total']}
            labels={{ grand_total: 'Grand Total' }}
          />

          <DataTable columns={columns} rows={data.data} isLoading={isLoading} />
        </>
      ) : null}
    </div>
  );
}
