import React from 'react';
import { formatCurrency } from '@ury/core';
import { Card, CardHeader, CardTitle, CardContent, Badge, Spinner } from '@ury/ui';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';
import { LineChartCard } from '../../components/reports/charts/LineChartCard';
import { PieChartCard } from '../../components/reports/charts/PieChartCard';
import { DashboardChartsData } from '../../services/dashboard';

interface AnalyticsChartsProps {
  chartsData: DashboardChartsData | null;
  loading: boolean;
}

const ChartLoading: React.FC = () => (
  <div className="flex h-64 items-center justify-center rounded-lg border border-border bg-card">
    <Spinner className="w-6 h-6 text-primary" />
  </div>
);

const ChartEmpty: React.FC<{ message: string }> = ({ message }) => (
  <div className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border bg-card text-xs text-muted-foreground">
    {message}
  </div>
);

export const AnalyticsCharts: React.FC<AnalyticsChartsProps> = ({ chartsData, loading }) => {
  // Sales Trend line data
  const trendData = chartsData?.sales_trend?.map(d => ({
    time: d.date ? d.date.split('-').slice(1).join('/') : '',
    sales: d.sales || 0
  })) || [];

  // Hourly distribution data
  const hourlyData = chartsData?.hourly_sales?.map(d => ({
    hour: d.hour || '',
    sales: d.sales || 0
  })) || [];

  // Revenue by branch comparative data
  const totalRevenue = chartsData?.revenue_by_branch?.reduce((sum, b) => sum + (b.total || 0), 0) || 0;
  const branchData = chartsData?.revenue_by_branch?.map(b => ({
    name: b.branch,
    revenue: b.total || 0,
    share: totalRevenue > 0 ? Math.round((b.total / totalRevenue) * 100) : 0
  })) || [];

  // Payment method distribution
  const paymentMethods = chartsData?.payment_methods?.map(pm => ({
    type: pm.method || 'Unknown',
    amount: pm.total || 0
  })) || [];

  // Order type distribution
  const orderTypes = chartsData?.order_types?.map(ot => ({
    type: ot.order_type || 'Unknown',
    count: ot.count || 0
  })) || [];

  // Top selling menu items
  const maxTopQty = chartsData?.top_items?.[0]?.total_qty || 1;
  const topItems = chartsData?.top_items?.map((item, index) => ({
    rank: index + 1,
    name: item.item_name,
    category: 'Sales Item',
    count: item.total_qty || 0,
    revenue: item.total_amount || 0,
    percentage: Math.round(((item.total_qty || 0) / maxTopQty) * 100)
  })) || [];

  return (
    <div className="space-y-6">
      {/* Sales Trend + Peak Sales Distribution */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {loading ? (
          <ChartLoading />
        ) : trendData.length === 0 ? (
          <ChartEmpty message="No sales trend data available" />
        ) : (
          <LineChartCard
            title="Sales Trend"
            data={trendData}
            xKey="time"
            yKeys={['sales']}
            labels={{ sales: 'Sales' }}
          />
        )}

        {loading ? (
          <ChartLoading />
        ) : hourlyData.length === 0 ? (
          <ChartEmpty message="No hourly data available" />
        ) : (
          <BarChartCard
            title="Peak Sales Distribution"
            data={hourlyData}
            xKey="hour"
            yKeys={['sales']}
            labels={{ sales: 'Sales' }}
          />
        )}
      </div>

      {/* Revenue by Branch + Payment Breakdown + Order Type Split */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {loading ? (
          <ChartLoading />
        ) : branchData.length === 0 ? (
          <ChartEmpty message="No branch data available" />
        ) : (
          <BarChartCard
            title="Revenue by Branch"
            data={branchData}
            xKey="name"
            yKeys={['revenue']}
            labels={{ revenue: 'Revenue' }}
          />
        )}

        {loading ? (
          <ChartLoading />
        ) : paymentMethods.length === 0 ? (
          <ChartEmpty message="No payment data available" />
        ) : (
          <PieChartCard title="Payment Breakdown" data={paymentMethods} dataKey="amount" nameKey="type" />
        )}

        {loading ? (
          <ChartLoading />
        ) : orderTypes.length === 0 ? (
          <ChartEmpty message="No order type data available" />
        ) : (
          <PieChartCard title="Order Type Split" data={orderTypes} dataKey="count" nameKey="type" />
        )}
      </div>

      {/*
        Top Selling Menu Items: a ranked list with per-item progress bars, not
        a bar/line/pie chart — no equivalent among BarChartCard/LineChartCard/
        PieChartCard, so this section is left as its original hand-rolled markup.
      */}
      <Card padding="lg" className="rounded-xl">
        <CardHeader className="p-0 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-foreground">Top Selling Menu Items</CardTitle>
              <p className="text-xs text-text-tertiary mt-1">Highest grossing items ranked by order count & volume</p>
            </div>
            <Badge variant="outline" className="border-primary-tint-border bg-primary-tint text-primary">
              Ranked Top {topItems.length}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {loading ? (
            <div className="py-12 flex items-center justify-center">
              <Spinner className="w-6 h-6 text-primary" />
            </div>
          ) : topItems.length === 0 ? (
            <div className="py-12 flex items-center justify-center border border-dashed border-border rounded-lg text-text-tertiary text-xs">
              No top items data available
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
              {topItems.map((item) => (
                <div key={item.rank} className="flex items-center gap-3 p-3 rounded-lg hover:bg-primary-tint/50 transition-colors">
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      item.rank === 1
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : item.rank === 2
                        ? 'bg-muted text-foreground border border-border'
                        : item.rank === 3
                        ? 'bg-amber-800/10 text-amber-900 border border-amber-800/30'
                        : 'bg-primary-tint text-primary'
                    }`}
                  >
                    #{item.rank}
                  </span>
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-foreground">{item.name}</span>
                      <span className="font-bold text-primary">{formatCurrency(item.revenue)}</span>
                    </div>
                    <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        style={{ width: `${item.percentage}%` }}
                        className="h-full rounded-full bg-gradient-to-r from-purple-600 to-purple-400"
                      />
                    </div>
                    <div className="flex justify-between text-[11px] text-text-tertiary">
                      <span>Category: {item.category}</span>
                      <span>{item.count} items ordered</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsCharts;
