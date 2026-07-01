import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useReportsStore } from '../../store/reports-store';
import { formatCurrency, cn } from '../../lib/utils';
import { t } from '../../i18n';

const SalesReportView = () => {
  const { salesReport, previousSalesReport } = useReportsStore();

  const hourlyChartData = useMemo(() => {
    if (!salesReport?.hourly_sales) return [];
    return salesReport.hourly_sales.map((h) => ({
      hour: `${h.hour}:00`,
      orders: h.order_count,
      revenue: Number(h.revenue),
    }));
  }, [salesReport?.hourly_sales]);

  if (!salesReport) {
    return (
      <div className="text-center py-12 text-gray-400">
        {t('reports.sales.noData') || 'Select a period to generate a sales report'}
      </div>
    );
  }

  const { summary, item_sales, order_type_sales, cancelled_orders, top_customers } = salesReport;

  // Calculate changes from previous period
  const prev = previousSalesReport?.summary;
  const changes = prev ? {
    total_revenue: calcChange(prev.total_revenue, summary.total_revenue),
    total_orders: calcChange(prev.total_orders, summary.total_orders),
    avg_order_value: calcChange(prev.avg_order_value, summary.avg_order_value),
    net_revenue: calcChange(prev.net_revenue, summary.net_revenue),
    total_tax: calcChange(prev.total_tax, summary.total_tax),
    unique_customers: calcChange(prev.unique_customers, summary.unique_customers),
  } : null;

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        <SummaryCard
          title={t('reports.sales.totalRevenue') || 'Total Revenue'}
          value={formatCurrency(summary.total_revenue)}
          color="blue"
          change={changes?.total_revenue}
        />
        <SummaryCard
          title={t('reports.sales.totalOrders') || 'Total Orders'}
          value={`${summary.total_orders}`}
          color="emerald"
          change={changes?.total_orders}
        />
        <SummaryCard
          title={t('reports.sales.avgOrderValue') || 'Avg Order Value'}
          value={formatCurrency(summary.avg_order_value)}
          color="purple"
          change={changes?.avg_order_value}
        />
        <SummaryCard
          title={t('reports.sales.netRevenue') || 'Net Revenue'}
          value={formatCurrency(summary.net_revenue)}
          color="blue"
          change={changes?.net_revenue}
        />
        <SummaryCard
          title={t('reports.sales.totalTax') || 'Total Tax'}
          value={formatCurrency(summary.total_tax)}
          color="amber"
          change={changes?.total_tax}
        />
        <SummaryCard
          title={t('reports.sales.uniqueCustomers') || 'Unique Customers'}
          value={`${summary.unique_customers}`}
          color="emerald"
          change={changes?.unique_customers}
        />
      </div>

      {/* Cancelled Orders Alert */}
      {cancelled_orders.count > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
          <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
            <span className="text-red-600 text-sm font-bold">!</span>
          </div>
          <div>
            <p className="text-sm font-medium text-red-800">
              {cancelled_orders.count} {t('reports.sales.cancelledOrders') || 'cancelled orders'}
            </p>
            <p className="text-xs text-red-600">
              {t('reports.sales.cancelledAmount') || 'Cancelled amount'}: {formatCurrency(cancelled_orders.amount)}
            </p>
          </div>
        </div>
      )}

      {/* Hourly Sales Chart */}
      {hourlyChartData.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-4">
            {t('reports.sales.hourlyDistribution') || 'Hourly Sales Distribution'}
          </h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={hourlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="hour" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ borderRadius: '8px', border: '1px solid #e5e7eb' }} />
                <Legend />
                <Bar yAxisId="left" dataKey="revenue" fill="#3b82f6" name="Revenue" radius={[2, 2, 0, 0]} />
                <Bar yAxisId="right" dataKey="orders" fill="#10b981" name="Orders" radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Order Type Breakdown */}
      {order_type_sales.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {t('reports.sales.orderTypeBreakdown') || 'Order Type Breakdown'}
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-start py-2 px-3 text-gray-500 font-medium">{t('reports.sales.type') || 'Type'}</th>
                  <th className="text-end py-2 px-3 text-gray-500 font-medium">{t('reports.sales.orders') || 'Orders'}</th>
                  <th className="text-end py-2 px-3 text-gray-500 font-medium">{t('reports.sales.revenue') || 'Revenue'}</th>
                </tr>
              </thead>
              <tbody>
                {order_type_sales.map((ot) => (
                  <tr key={ot.order_type} className="border-b border-gray-50">
                    <td className="py-2 px-3 font-medium">{ot.order_type}</td>
                    <td className="py-2 px-3 text-end">{ot.order_count}</td>
                    <td className="py-2 px-3 text-end">{formatCurrency(ot.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Items Table */}
      {item_sales.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {t('reports.sales.itemWiseSales') || 'Item-wise Sales'}
          </h3>
          <div className="overflow-x-auto max-h-96 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white z-10">
                <tr className="border-b border-gray-200">
                  <th className="text-start py-2 px-3 text-gray-500 font-medium">{t('reports.sales.item') || 'Item'}</th>
                  <th className="text-end py-2 px-3 text-gray-500 font-medium">{t('reports.sales.qty') || 'Qty'}</th>
                  <th className="text-end py-2 px-3 text-gray-500 font-medium">{t('reports.sales.avgRate') || 'Avg Rate'}</th>
                  <th className="text-end py-2 px-3 text-gray-500 font-medium">{t('reports.sales.total') || 'Total'}</th>
                </tr>
              </thead>
              <tbody>
                {item_sales.slice(0, 20).map((item) => (
                  <tr key={item.item_code} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-2 px-3 font-medium">{item.item_name}</td>
                    <td className="py-2 px-3 text-end">{item.total_qty}</td>
                    <td className="py-2 px-3 text-end">{formatCurrency(item.avg_rate)}</td>
                    <td className="py-2 px-3 text-end font-medium">{formatCurrency(item.total_amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top Customers */}
      {top_customers.length > 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {t('reports.sales.topCustomers') || 'Top Customers'}
          </h3>
          <div className="space-y-2">
            {top_customers.slice(0, 10).map((c, idx) => (
              <div
                key={c.customer}
                className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                    {idx + 1}
                  </span>
                  <span className="text-sm font-medium">{c.customer_name}</span>
                </div>
                <div className="text-end">
                  <p className="text-sm font-medium">{formatCurrency(c.total_spent)}</p>
                  <p className="text-xs text-gray-400">{c.order_count} {t('reports.sales.orders') || 'orders'}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// Calculate percentage change between two values
function calcChange(previous: number, current: number): { percent: number; direction: 'up' | 'down' | 'neutral' } {
  if (previous === 0) {
    if (current > 0) return { percent: 100, direction: 'up' };
    if (current < 0) return { percent: 100, direction: 'down' };
    return { percent: 0, direction: 'neutral' };
  }
  const percent = Math.abs(((current - previous) / Math.abs(previous)) * 100);
  if (current > previous) return { percent, direction: 'up' };
  if (current < previous) return { percent, direction: 'down' };
  return { percent: 0, direction: 'neutral' };
}

// Summary card component
const SummaryCard = ({
  title,
  value,
  color,
  change,
}: {
  title: string;
  value: string;
  color: string;
  change?: { percent: number; direction: 'up' | 'down' | 'neutral' } | null;
}) => {
  const colorMap: Record<string, string> = {
    blue: 'bg-blue-50 border-blue-100',
    emerald: 'bg-emerald-50 border-emerald-100',
    purple: 'bg-purple-50 border-purple-100',
    amber: 'bg-amber-50 border-amber-100',
    red: 'bg-red-50 border-red-100',
  };

  return (
    <div className={cn('rounded-lg border p-4', colorMap[color] || 'bg-gray-50 border-gray-100')}>
      <p className="text-xs text-gray-500 mb-1">{title}</p>
      <p className="text-xl font-bold text-gray-900">{value}</p>
      {change && change.direction !== 'neutral' && (
        <div className="flex items-center gap-1 mt-1">
          {change.direction === 'up' ? (
            <TrendingUp className="w-3 h-3 text-emerald-500" />
          ) : (
            <TrendingDown className="w-3 h-3 text-red-500" />
          )}
          <span className={cn(
            'text-xs font-medium',
            change.direction === 'up' ? 'text-emerald-600' : 'text-red-600'
          )}>
            {change.direction === 'up' ? '+' : '-'}{change.percent.toFixed(1)}%
          </span>
          <span className="text-xs text-gray-400">{t('reports.sales.vsPrevious') || 'vs prev'}</span>
        </div>
      )}
      {change && change.direction === 'neutral' && (
        <div className="flex items-center gap-1 mt-1">
          <Minus className="w-3 h-3 text-gray-400" />
          <span className="text-xs text-gray-400">{t('reports.sales.noChange') || 'No change'}</span>
        </div>
      )}
    </div>
  );
};

export default SalesReportView;
