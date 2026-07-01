import { useState, useEffect } from 'react';
import {
  BarChart3,
  RefreshCw,
  TrendingUp,
  ShoppingCart,
  Users,
  DollarSign,
  Clock,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { Button, Spinner, Badge } from '../ui';
import { cn } from '../../lib/utils';
import { useDashboardStore } from '../../store/dashboard-store';
import { formatCurrency } from '../../lib/utils';
import { t } from '../../i18n';
import RevenueChartComponent from './RevenueChart';
import OrdersChartComponent from './OrdersChart';
import CategorySalesChart from './CategorySalesChart';
import LiveMetricsPanel from './LiveMetricsPanel';
import PaymentMethodChart from './PaymentMethodChart';
import OrderTypeChart from './OrderTypeChart';
import HourlyHeatmap from './HourlyHeatmap';
import PeriodComparison from './PeriodComparison';

type PeriodOption = {
  value: string;
  label: string;
};

const periods: PeriodOption[] = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'this_week', label: 'This Week' },
  { value: 'last_week', label: 'Last Week' },
  { value: 'this_month', label: 'This Month' },
  { value: 'last_month', label: 'Last Month' },
  { value: 'last_7_days', label: 'Last 7 Days' },
  { value: 'last_30_days', label: 'Last 30 Days' },
  { value: 'last_90_days', label: 'Last 90 Days' },
];

const Dashboard = () => {
  const {
    summary,
    tableOccupancy,
    selectedPeriod,
    loading,
    autoRefresh,
    fetchAll,
    setSelectedPeriod,
    setAutoRefresh,
  } = useDashboardStore();

  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const handlePeriodChange = (period: string) => {
    setSelectedPeriod(period as any);
  };

  return (
    <div className="flex flex-col h-full overflow-y-auto p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-7 h-7 text-blue-600" />
            {t('dashboard.title') || 'Dashboard'}
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {t('dashboard.subtitle') || 'Real-time insights and analytics'}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={cn(autoRefresh && 'border-emerald-300 text-emerald-600')}
          >
            <Activity className="w-4 h-4 me-1" />
            {autoRefresh ? 'Live' : 'Auto-refresh'}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleRefresh}
            disabled={refreshing}
          >
            <RefreshCw
              className={cn('w-4 h-4', refreshing && 'animate-spin')}
            />
          </Button>
        </div>
      </div>

      {/* Period Selector */}
      <div className="flex items-center gap-2 mb-6 overflow-x-auto pb-2">
        {periods.map((p) => (
          <button
            key={p.value}
            className={cn(
              'px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors',
              selectedPeriod === p.value
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            )}
            onClick={() => handlePeriodChange(p.value)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {loading && !summary ? (
        <div className="flex-1 flex items-center justify-center">
          <Spinner className="w-8 h-8" />
        </div>
      ) : (
        <>
          {/* Row 1: KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <KPICard
              title="Total Revenue"
              value={formatCurrency(summary?.total_revenue || 0)}
              icon={<DollarSign className="w-5 h-5" />}
              color="blue"
              subtitle={summary?.from_date ? `${summary.from_date} - ${summary.to_date}` : ''}
            />
            <KPICard
              title="Total Orders"
              value={`${summary?.total_orders || 0}`}
              icon={<ShoppingCart className="w-5 h-5" />}
              color="emerald"
              subtitle={`Avg: ${formatCurrency(summary?.average_order_value || 0)}`}
            />
            <KPICard
              title="Unique Customers"
              value={`${summary?.unique_customers || 0}`}
              icon={<Users className="w-5 h-5" />}
              color="purple"
            />
            <KPICard
              title="Table Occupancy"
              value={`${tableOccupancy?.occupancy_rate || 0}%`}
              icon={<Clock className="w-5 h-5" />}
              color="amber"
              subtitle={`${tableOccupancy?.occupied_tables || 0} / ${tableOccupancy?.total_tables || 0} tables`}
            />
          </div>

          {/* Row 2: Period Comparison (full width) */}
          <div className="mb-6">
            <PeriodComparison />
          </div>

          {/* Row 3: Revenue + Orders charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <RevenueChartComponent />
            <OrdersChartComponent />
          </div>

          {/* Row 4: Category + Payment Method charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <CategorySalesChart />
            <PaymentMethodChart />
          </div>

          {/* Row 5: Order Type + Hourly Heatmap */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <OrderTypeChart />
            <HourlyHeatmap />
          </div>

          {/* Row 6: Live Metrics Panel */}
          <div className="mb-6">
            <LiveMetricsPanel />
          </div>

          {/* Top Selling Items */}
          {summary?.top_selling_items && summary.top_selling_items.length > 0 && (
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">
                Top Selling Items
              </h3>
              <div className="space-y-2">
                {summary.top_selling_items.map((item, idx) => (
                  <div
                    key={item.item_code}
                    className="flex items-center justify-between py-2 border-b border-gray-50 last:border-0"
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">
                        {idx + 1}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {item.item_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-gray-500">
                        {item.total_qty} sold
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        {formatCurrency(item.total_amount)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ---- KPI Card Component ----

interface KPICardProps {
  title: string;
  value: string;
  icon: React.ReactNode;
  color: 'blue' | 'emerald' | 'purple' | 'amber' | 'red';
  subtitle?: string;
  trend?: 'up' | 'down';
  trendValue?: string;
}

const KPICard = ({ title, value, icon, color, subtitle, trend, trendValue }: KPICardProps) => {
  const colorMap = {
    blue: 'bg-blue-50 text-blue-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    purple: 'bg-purple-50 text-purple-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
  };

  const iconBgMap = {
    blue: 'bg-blue-100 text-blue-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    purple: 'bg-purple-100 text-purple-600',
    amber: 'bg-amber-100 text-amber-600',
    red: 'bg-red-100 text-red-600',
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm text-gray-500">{title}</span>
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', iconBgMap[color])}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
      {trend && (
        <div className="flex items-center gap-1 mt-1">
          {trend === 'up' ? (
            <ArrowUpRight className="w-3 h-3 text-emerald-500" />
          ) : (
            <ArrowDownRight className="w-3 h-3 text-red-500" />
          )}
          <span
            className={cn(
              'text-xs font-medium',
              trend === 'up' ? 'text-emerald-500' : 'text-red-500'
            )}
          >
            {trendValue}
          </span>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
