import { useMemo } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useDashboardStore } from '../../store/dashboard-store';
import { formatCurrency } from '../../lib/utils';

const RevenueChartComponent = () => {
  const { revenueChart, selectedGranularity, setSelectedGranularity } = useDashboardStore();

  const chartData = useMemo(() => {
    if (!revenueChart?.data) return [];
    return revenueChart.data.map((point) => ({
      name:
        selectedGranularity === 'hourly'
          ? `${point.hour}:00`
          : selectedGranularity === 'monthly'
          ? point.month
          : point.date,
      revenue: Number(point.revenue) || 0,
      orders: Number(point.order_count) || 0,
    }));
  }, [revenueChart, selectedGranularity]);

  const granularities = [
    { value: 'hourly', label: 'Hourly' },
    { value: 'daily', label: 'Daily' },
    { value: 'weekly', label: 'Weekly' },
    { value: 'monthly', label: 'Monthly' },
  ];

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">Revenue Overview</h3>
        <div className="flex gap-1">
          {granularities.map((g) => (
            <button
              key={g.value}
              className={`px-2 py-1 text-xs rounded-md transition-colors ${
                selectedGranularity === g.value
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:bg-gray-100'
              }`}
              onClick={() => setSelectedGranularity(g.value as any)}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>
      <div className="h-64">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            No revenue data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke="#9ca3af" />
              <YAxis
                tick={{ fontSize: 11 }}
                stroke="#9ca3af"
                tickFormatter={(v) => `${v}`}
              />
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Legend />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#3b82f6"
                fill="url(#revenueGradient)"
                strokeWidth={2}
                name="Revenue"
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default RevenueChartComponent;
