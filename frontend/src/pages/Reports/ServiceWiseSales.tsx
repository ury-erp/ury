import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { IndianRupee, Receipt, TrendingUp, AlertCircle } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { PieChartCard } from '../../components/reports/charts/PieChartCard';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';
import { t } from '../../i18n';
import { ReportSkeleton } from '../../components/reports/ReportSkeleton';

interface ServiceRow {
  order_type: string;
  revenue: number;
  order_count: number;
  avg_order_value: number;
  percentage_of_total: number;
}

interface ServiceWiseSalesData {
  by_service_type: ServiceRow[];
  summary: { total_revenue: number; total_orders: number; avg_order_value: number };
}

const getColumns = (): DataTableColumn<ServiceRow>[] => [
  { key: 'order_type', header: t('fields.order_type') },
  { key: 'order_count', header: t('fields.orders'), align: 'right' },
  { key: 'revenue', header: t('fields.revenue'), render: (r) => formatCurrency(r.revenue), align: 'right' },
  { key: 'avg_order_value', header: t('fields.avg_order_value'), render: (r) => formatCurrency(r.avg_order_value), align: 'right' },
  { key: 'percentage_of_total', header: t('fields.of_total'), render: (r) => `${r.percentage_of_total}%`, align: 'right' },
];

export function ServiceWiseSales() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [data, setData] = useState<ServiceWiseSalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: ServiceWiseSalesData }>('ury.ury.report_api.sales.get_service_wise_sales', {
        branch,
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
      });
      setData(res.message ?? (res as unknown as ServiceWiseSalesData));
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
          <h1 className="text-xl font-semibold">{t('reports.service_wise_sales.service_wise_sales')}</h1>
          <p className="text-sm text-muted-foreground">
            Revenue by order type {activeBranchId === 'all' ? '· All Branches' : ''}
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard
              label={t('reports.service_wise_sales.total_revenue')}
              value={formatCurrency(data.summary.total_revenue)}
              icon={<IndianRupee className="w-4 h-4" />}
            />
            <StatCard label={t('reports.service_wise_sales.total_orders')} value={data.summary.total_orders} icon={<Receipt className="w-4 h-4" />} />
            <StatCard
              label={t('reports.service_wise_sales.avg_order_value')}
              value={formatCurrency(data.summary.avg_order_value)}
              icon={<TrendingUp className="w-4 h-4" />}
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <PieChartCard
                title={t('reports.service_wise_sales.revenue_by_order_type')}
                data={data.by_service_type}
                dataKey="revenue"
                nameKey="order_type"
              />
            </div>
            <div className="lg:col-span-3">
              <DataTable columns={getColumns()} rows={data.by_service_type} isLoading={isLoading} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
