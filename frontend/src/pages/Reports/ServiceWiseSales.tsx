import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, DataTable, type DataTableColumn, PageHeader } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { PieChartCard } from '../../components/reports/charts/PieChartCard';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';
import { __ } from '../../i18n';

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

const columns: DataTableColumn<ServiceRow>[] = [
  { key: 'order_type', header: __('Order Type') },
  { key: 'order_count', header: __('Orders'), align: 'right' },
  { key: 'revenue', header: __('Revenue'), render: (r) => formatCurrency(r.revenue), align: 'right' },
  { key: 'avg_order_value', header: __('Avg Order Value'), render: (r) => formatCurrency(r.avg_order_value), align: 'right' },
  { key: 'percentage_of_total', header: '% of Total', render: (r) => `${r.percentage_of_total}%`, align: 'right' },
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
        title={__('Service Wise Sales')}
        description={__('Revenue by order type {0}', [activeBranchId === 'all' ? '· All Branches' : ''])}
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
              { label: __('Total Revenue'), value: formatCurrency(data.summary.total_revenue) },
              { label: __('Total Orders'), value: data.summary.total_orders },
              { label: __('Avg Order Value'), value: formatCurrency(data.summary.avg_order_value) },
            ]}
          />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <PieChartCard
                title={__('Revenue by Order Type')}
                data={data.by_service_type}
                dataKey="revenue"
                nameKey="order_type"
              />
            </div>
            <div className="lg:col-span-3">
              <DataTable columns={columns} rows={data.by_service_type} isLoading={isLoading} />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
