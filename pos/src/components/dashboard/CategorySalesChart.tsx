import { useMemo } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { useDashboardStore } from '../../store/dashboard-store';
import { formatCurrency } from '../../lib/utils';
import type { CategorySalesItem } from '../../lib/dashboard-api';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

const CategorySalesChart = () => {
  const { categorySales } = useDashboardStore();

  const chartData = useMemo(() => {
    if (!categorySales?.data) return [];
    return categorySales.data.map((item: CategorySalesItem) => ({
      name: item.category || 'Uncategorized',
      value: Number(item.total_amount) || 0,
      qty: Number(item.total_qty) || 0,
    }));
  }, [categorySales]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">Sales by Category</h3>
      <div className="h-64">
        {chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            No category data available
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={3}
                dataKey="value"
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number) => formatCurrency(value)}
                contentStyle={{
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                }}
              />
              <Legend
                formatter={(value) => (
                  <span className="text-xs text-gray-600">{value}</span>
                )}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
};

export default CategorySalesChart;
