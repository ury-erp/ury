import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { IndianRupee, TrendingUp, Trophy, TrendingDown, AlertCircle } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { t } from '../../i18n';
import { ReportSkeleton } from '../../components/reports/ReportSkeleton';

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

const getColumns = (): DataTableColumn<MonthRow>[] => [
  { key: 'month', header: t('fields.month') },
  { key: 'item_total', header: t('fields.item_total'), render: (r) => formatCurrency(r.item_total), align: 'right' },
  { key: 'taxes', header: t('fields.taxes'), render: (r) => formatCurrency(r.taxes), align: 'right' },
  { key: 'grand_total', header: t('fields.grand_total'), render: (r) => formatCurrency(r.grand_total), align: 'right' },
  {
    key: 'growth_percentage',
    header: t('fields.growth'),
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
      setError(err instanceof Error ? err.message : t('reports.common.load_failed'));
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
          <h1 className="text-xl font-semibold">{t('reports.month_wise_sales.month_wise_sales')}</h1>
          <p className="text-sm text-muted-foreground">
            Monthly revenue trend {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <div className="w-44">
          <SearchableSelect
            id="months-back"
            value={String(monthsBack)}
            onChange={(_, val) => setMonthsBack(Number(val))}
            options={MONTH_OPTIONS.map((m) => ({
              value: String(m),
              label: `Last ${m} months`,
            }))}
            strict
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
              label={t('reports.month_wise_sales.total_revenue')}
              value={formatCurrency(data.summary.total_revenue)}
              icon={<IndianRupee className="w-4 h-4" />}
            />
            <StatCard
              label={t('reports.month_wise_sales.avg_monthly')}
              value={formatCurrency(data.summary.average_monthly_revenue)}
              icon={<TrendingUp className="w-4 h-4" />}
            />
            <StatCard label={t('reports.month_wise_sales.best_month')} value={data.summary.best_month ?? '—'} icon={<Trophy className="w-4 h-4" />} />
            <StatCard
              label={t('reports.month_wise_sales.weakest_month')}
              value={data.summary.worst_month ?? '—'}
              icon={<TrendingDown className="w-4 h-4" />}
            />
          </div>

          <BarChartCard
            title={t('reports.month_wise_sales.monthly_grand_total')}
            data={data.data}
            xKey="month"
            yKeys={['grand_total']}
            labels={{ grand_total: t('fields.grand_total') }}
          />

          <DataTable columns={getColumns()} rows={data.data} isLoading={isLoading} />
        </>
      ) : null}
    </div>
  );
}
