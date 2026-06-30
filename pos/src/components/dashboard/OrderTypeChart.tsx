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
import { useDashboardStore } from '../../store/dashboard-store';
import { formatCurrency } from '../../lib/utils';
import { t } from '../../i18n';
import { cn } from '../../lib/utils';

const ORDER_TYPE_COLORS: Record<string, string> = {
  'Dine In': '#3b82f6',
  'Take Away': '#10b981',
  'Delivery': '#f59e0b',
  'Phone In': '#8b5cf6',
  'Aggregators': '#ec4899',
};

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const OrderTypeChart = () => {
  const { summary } = useDashboardStore();

  const chartData = useMemo(() => {
    if (!summary?.order_type_breakdown) return [];
    return summary.order_type_breakdown.map((item, index) => ({
      name: item.order_type || 'Unknown',
      orders: Number(item.count) || 0,
      revenue: Number(item.revenue) || 0,
      fill: ORDER_TYPE_COLORS[item.order_type] || DEFAULT_COLORS[index % DEFAULT_COLORS.length],
    }));
  }, [summary?.order_type_breakdown]);

  const customTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0]?.payload;
      if (!data) return null;
      return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-lg p-3">
          <p className="text-sm font-medium text-gray-900 mb-1">{data.name}</p>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm bg-blue-500" />
              <span className="text-xs text-gray-600">Orders: {data.orders}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-sm bg-emerald-500" />
              <span className="text-xs text-gray-600">Revenue: {formatCurrency(data.revenue)}</span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        {t('dashboard.order_type_distribution')}
      </h3>
      <div className="h-64">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            {t('dashboard.no_data_available')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis type="number" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                width={80}
              />
              <Tooltip content={customTooltip} />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-gray-600 capitalize">{value}</span>
                )}
              />
              <Bar
                dataKey="orders"
                fill="#3b82f6"
                name="Orders"
                radius={[0, 4, 4, 0]}
                barSize={12}
              />
              <Bar
                dataKey="revenue"
                fill="#10b981"
                name="Revenue"
                radius={[0, 4, 4, 0]}
                barSize={12}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default OrderTypeChart;
