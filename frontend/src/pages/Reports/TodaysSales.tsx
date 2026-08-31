import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, type KpiItemProps, Input, DataTable, type DataTableColumn } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { toApiDate } from '../../lib/reportDate';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';
import { PieChartCard } from '../../components/reports/charts/PieChartCard';

interface TodaySalesData {
  branch: string | null;
  query_date: string;
  day_of_week: string;
  total_invoices: number;
  item_total: number;
  total_taxes_and_charges: number;
  grand_total: number;
  round_off: number;
  cash_discounts: number;
  last_updated_at: string;
}

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
  intervals: IntervalRow[];
  summary: {
    peak_interval: string | null;
    peak_interval_sales: number;
  };
}

interface ServiceRow {
  order_type: string;
  revenue: number;
  order_count: number;
  avg_order_value: number;
  percentage_of_total: number;
}

interface ServiceWiseSalesData {
  by_service_type: ServiceRow[];
}

interface ItemRow {
  item_code: string;
  item_name: string;
  item_group: string | null;
  qty: number;
  amount: number;
  avg_price: number;
  pct_of_total_amount: number;
}

interface ItemWiseSalesData {
  items: ItemRow[];
}

const REFRESH_INTERVAL_MS = 15000;

const serviceColumns: DataTableColumn<ServiceRow>[] = [
  { key: 'order_type', header: 'Order Type' },
  { key: 'order_count', header: '# Orders', align: 'right' },
  { key: 'revenue', header: 'Revenue', render: (r) => formatCurrency(r.revenue), align: 'right' },
  { key: 'percentage_of_total', header: '% of Total', render: (r) => `${r.percentage_of_total}%`, align: 'right' },
];

const topItemColumns: DataTableColumn<ItemRow>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'qty', header: 'Qty', align: 'right' },
  { key: 'amount', header: 'Amount', render: (r) => formatCurrency(r.amount), align: 'right' },
];

export function TodaysSales() {
  const { activeBranchId } = useBranchContext();
  const [date, setDate] = useState<string>(() => toApiDate(new Date()));
  const [data, setData] = useState<TodaySalesData | null>(null);
  const [timeWiseData, setTimeWiseData] = useState<TimeWiseSalesData | null>(null);
  const [serviceData, setServiceData] = useState<ServiceWiseSalesData | null>(null);
  const [topItemsData, setTopItemsData] = useState<ItemWiseSalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const [summaryRes, timeWiseRes, serviceRes, topItemsRes] = await Promise.all([
        call<{ message: TodaySalesData }>('ury.ury.report_api.sales.get_today_sales', { branch, date }),
        call<{ message: TimeWiseSalesData }>('ury.ury.report_api.sales.get_time_wise_sales', {
          branch,
          date,
          bucket_size_hours: 2,
        }),
        call<{ message: ServiceWiseSalesData }>('ury.ury.report_api.sales.get_service_wise_sales', {
          branch,
          start_date: date,
          end_date: date,
        }),
        call<{ message: ItemWiseSalesData }>('ury.ury.report_api.items.get_item_wise_sales', {
          branch,
          start_date: date,
          end_date: date,
          page: 1,
          page_size: 5,
        }),
      ]);
      setData(summaryRes.message ?? (summaryRes as unknown as TodaySalesData));
      setTimeWiseData(timeWiseRes.message ?? (timeWiseRes as unknown as TimeWiseSalesData));
      setServiceData(serviceRes.message ?? (serviceRes as unknown as ServiceWiseSalesData));
      setTopItemsData(topItemsRes.message ?? (topItemsRes as unknown as ItemWiseSalesData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, date]);

  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const isToday = date === toApiDate(new Date());
    if (!isToday) return;
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [date, fetchData]);

  const kpiItems: KpiItemProps[] = data
    ? [
        { label: 'Total Invoices', value: data.total_invoices },
        { label: 'Item Total', value: formatCurrency(data.item_total) },
        { label: 'Total Taxes & Charges', value: formatCurrency(data.total_taxes_and_charges) },
        { label: 'Grand Total', value: formatCurrency(data.grand_total), tone: 'success' },
        { label: 'Round Off', value: formatCurrency(data.round_off) },
        {
          label: 'Cash Discounts',
          value: formatCurrency(data.cash_discounts),
          hint: data.cash_discounts !== 0 ? (data.cash_discounts < 0 ? 'given away' : 'owed to house') : undefined,
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Today's Sales</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.day_of_week}, ${data.query_date}` : 'Live sales snapshot'}
            {activeBranchId === 'all' ? ' · All Branches' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={date}
            max={toApiDate(new Date())}
            onChange={(e) => setDate(e.target.value)}
            size="sm"
          />
          {data && (
            <span className="text-xs text-muted-foreground">
              Updated {new Date(data.last_updated_at).toLocaleTimeString()}
            </span>
          )}
        </div>
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
          <KpiStrip items={kpiItems} />

          <BarChartCard
            title="Sales by Time of Day"
            data={timeWiseData?.intervals ?? []}
            xKey="interval_label"
            yKeys={['sales']}
            labels={{ sales: 'Sales' }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div className="lg:col-span-2">
              <PieChartCard
                title="Revenue by Order Type"
                data={serviceData?.by_service_type ?? []}
                dataKey="revenue"
                nameKey="order_type"
              />
            </div>
            <div className="lg:col-span-3">
              <DataTable
                columns={serviceColumns}
                rows={serviceData?.by_service_type ?? []}
                isLoading={isLoading && !serviceData}
              />
            </div>
          </div>

          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Top Selling Items Today
            </h2>
            <DataTable
              columns={topItemColumns}
              rows={topItemsData?.items ?? []}
              isLoading={isLoading && !topItemsData}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
