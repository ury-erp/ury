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
import type { OrdersChartDataPoint } from '../../lib/dashboard-api';

const OrdersChartComponent = () => {
  const { ordersChart } = useDashboardStore();

  const chartData = useMemo(() => {
    if (!ordersChart?.data) return [];
    return ordersChart.data.map((point: OrdersChartDataPoint) => ({
      name: point.date,
      total: Number(point.total_orders) || 0,
      paid: Number(point.paid_orders) || 0,
      draft: Number(point.draft_orders) || 0,
      cancelled: Number(point.cancelled_orders) || 0,
    }));
  }, [ordersChart]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Orders Overview</h3>
      <div className="h-64">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            No order data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <Tooltip
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Legend />
              <Bar dataKey="paid" fill="#10b981" name="Paid" radius={[2, 2, 0, 0]} />
              <Bar dataKey="draft" fill="#f59e0b" name="Draft" radius={[2, 2, 0, 0]} />
              <Bar dataKey="cancelled" fill="#ef4444" name="Cancelled" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default OrdersChartComponent;
