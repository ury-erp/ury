import { useMemo, useState, useEffect } from 'react';
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
import { t } from '../../i18n';
import { getPaymentMethodChart, type PaymentMethodDataPoint } from '../../lib/dashboard-api';

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#f97316'];

interface PaymentMethodData {
  method: string;
  amount: number;
  count?: number;
}

const PaymentMethodChart = () => {
  const { selectedPeriod } = useDashboardStore();
  const [data, setData] = useState<PaymentMethodData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const result = await getPaymentMethodChart(selectedPeriod);
        setData(
          (result?.data || []).map((item: PaymentMethodDataPoint) => ({
            method: item.method || item.mode_of_payment || 'Unknown',
            amount: Number(item.amount) || 0,
            count: Number(item.count) || 0,
          }))
        );
      } catch (error) {
        console.error('Failed to fetch payment method chart:', error);
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [selectedPeriod]);

  const chartData = useMemo(() => {
    return data.map((item) => ({
      name: item.method,
      value: item.amount,
      count: item.count,
    }));
  }, [data]);

  const totalAmount = useMemo(() => {
    return chartData.reduce((sum, item) => sum + item.value, 0);
  }, [chartData]);

  const _renderCenterText = () => {
    return (
      <text
        x="50%"
        y="50%"
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-gray-700"
      >
        <tspan x="50%" dy="-0.5em" fontSize="12" className="fill-gray-400">
          {t('dashboard.total_revenue')}
        </tspan>
        <tspan x="50%" dy="1.5em" fontSize="14" fontWeight="bold" className="fill-gray-900">
          {formatCurrency(totalAmount)}
        </tspan>
      </text>
    );
  };

  const customTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ name: string; value: number }> }) => {
    if (active && payload && payload.length) {
      const item = payload[0];
      const percentage = totalAmount > 0 ? ((item.value / totalAmount) * 100).toFixed(1) : '0';
      return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-lg p-3">
          <p className="text-sm font-medium text-gray-900">{item.name}</p>
          <p className="text-sm text-gray-600">
            {formatCurrency(item.value)}
          </p>
          <p className="text-xs text-gray-400">
            {percentage}% of total
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-4">
        {t('dashboard.payment_methods')}
      </h3>
      <div className="h-64">
        {loading ? (
          <div className="h-full flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : chartData.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-400 text-sm">
            {t('dashboard.no_data_available')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={chartData}
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={3}
                dataKey="value"
              >
                {chartData.map((_, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip content={customTooltip} />
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

export default PaymentMethodChart;
