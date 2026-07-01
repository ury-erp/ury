import {
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowRight,
} from 'lucide-react';
import { useReportsStore } from '../../store/reports-store';
import { formatCurrency } from '../../lib/utils';
import { cn } from '../../lib/utils';
import { t } from '../../i18n';

const PeriodComparisonView = () => {
  const { salesReport, previousSalesReport } = useReportsStore();

  if (!salesReport) {
    return (
      <div className="text-center py-12 text-gray-400">
        {t('reports.comparison.noData') || 'Generate a sales report first to enable period comparison'}
      </div>
    );
  }

  const current = salesReport.summary;

  // If no previous period data, show a message
  if (!previousSalesReport) {
    return (
      <div className="space-y-6">
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-8 text-center">
          <p className="text-gray-500 mb-2">
            {t('reports.comparison.noPreviousData') || 'No previous period data available for comparison'}
          </p>
          <p className="text-sm text-gray-400">
            {t('reports.comparison.hint') || 'Previous period data will be loaded automatically when you view a sales report'}
          </p>
        </div>

        {/* Still show current period summary */}
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {t('reports.comparison.currentPeriod') || 'Current Period'}
          </h3>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <CurrentOnlyCard label={t('reports.comparison.revenue') || 'Revenue'} value={formatCurrency(current.total_revenue)} />
            <CurrentOnlyCard label={t('reports.comparison.orders') || 'Orders'} value={`${current.total_orders}`} />
            <CurrentOnlyCard label={t('reports.comparison.avgOrder') || 'Avg Order Value'} value={formatCurrency(current.avg_order_value)} />
            <CurrentOnlyCard label={t('reports.comparison.customers') || 'Customers'} value={`${current.unique_customers}`} />
            <CurrentOnlyCard label={t('reports.comparison.tax') || 'Tax'} value={formatCurrency(current.total_tax)} />
            <CurrentOnlyCard label={t('reports.comparison.netRevenue') || 'Net Revenue'} value={formatCurrency(current.net_revenue)} />
          </div>
        </div>
      </div>
    );
  }

  const previous = previousSalesReport.summary;

  const metrics: ComparisonMetric[] = [
    {
      label: t('reports.comparison.revenue') || 'Revenue',
      previous: previous.total_revenue,
      current: current.total_revenue,
      format: 'currency',
      higherIsBetter: true,
    },
    {
      label: t('reports.comparison.orders') || 'Orders',
      previous: previous.total_orders,
      current: current.total_orders,
      format: 'number',
      higherIsBetter: true,
    },
    {
      label: t('reports.comparison.avgOrder') || 'Avg Order Value',
      previous: previous.avg_order_value,
      current: current.avg_order_value,
      format: 'currency',
      higherIsBetter: true,
    },
    {
      label: t('reports.comparison.customers') || 'Customers',
      previous: previous.unique_customers,
      current: current.unique_customers,
      format: 'number',
      higherIsBetter: true,
    },
    {
      label: t('reports.comparison.tax') || 'Tax',
      previous: previous.total_tax,
      current: current.total_tax,
      format: 'currency',
      higherIsBetter: true,
    },
    {
      label: t('reports.comparison.netRevenue') || 'Net Revenue',
      previous: previous.net_revenue,
      current: current.net_revenue,
      format: 'currency',
      higherIsBetter: true,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Period Headers */}
      <div className="grid grid-cols-3 gap-4">
        <div className="text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t('reports.comparison.previousPeriod') || 'Previous Period'}
          </p>
          <p className="text-sm text-gray-600 mt-1">{previousSalesReport.from_date} — {previousSalesReport.to_date}</p>
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t('reports.comparison.change') || 'Change'}
          </p>
        </div>
        <div className="text-center">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {t('reports.comparison.currentPeriod') || 'Current Period'}
          </p>
          <p className="text-sm text-gray-600 mt-1">{salesReport.from_date} — {salesReport.to_date}</p>
        </div>
      </div>

      {/* Comparison Rows */}
      <div className="space-y-3">
        {metrics.map((metric) => (
          <ComparisonRow key={metric.label} metric={metric} />
        ))}
      </div>

      {/* Overall Summary */}
      <div className={cn(
        'rounded-lg p-4 border',
        getOverallTrend(metrics) === 'up' ? 'bg-emerald-50 border-emerald-200' :
        getOverallTrend(metrics) === 'down' ? 'bg-red-50 border-red-200' :
        'bg-gray-50 border-gray-200'
      )}>
        <div className="flex items-center gap-2">
          {getOverallTrend(metrics) === 'up' && <TrendingUp className="w-5 h-5 text-emerald-600" />}
          {getOverallTrend(metrics) === 'down' && <TrendingDown className="w-5 h-5 text-red-600" />}
          {getOverallTrend(metrics) === 'neutral' && <Minus className="w-5 h-5 text-gray-600" />}
          <span className={cn(
            'font-semibold',
            getOverallTrend(metrics) === 'up' ? 'text-emerald-700' :
            getOverallTrend(metrics) === 'down' ? 'text-red-700' :
            'text-gray-700'
          )}>
            {getOverallTrend(metrics) === 'up'
              ? (t('reports.comparison.overallUp') || 'Overall trend is positive compared to the previous period')
              : getOverallTrend(metrics) === 'down'
              ? (t('reports.comparison.overallDown') || 'Overall trend shows decline compared to the previous period')
              : (t('reports.comparison.overallNeutral') || 'Performance is similar to the previous period')
            }
          </span>
        </div>
      </div>
    </div>
  );
};

// Types
interface ComparisonMetric {
  label: string;
  previous: number;
  current: number;
  format: 'currency' | 'number' | 'percent';
  higherIsBetter: boolean;
}

// Sub-components
const ComparisonRow = ({ metric }: { metric: ComparisonMetric }) => {
  const change = metric.current - metric.previous;
  const changePercent = metric.previous !== 0 ? ((change / Math.abs(metric.previous)) * 100) : 0;
  const isPositive = change > 0;
  const isNegative = change < 0;
  const isNeutral = change === 0;

  const isImprovement = metric.higherIsBetter ? isPositive : isNegative;
  const isDecline = metric.higherIsBetter ? isNegative : isPositive;

  const formatValue = (val: number) => {
    if (metric.format === 'currency') return formatCurrency(val);
    if (metric.format === 'percent') return `${val.toFixed(1)}%`;
    return `${val}`;
  };

  return (
    <div className={cn(
      'bg-white rounded-lg border p-4 grid grid-cols-3 gap-4 items-center',
      isImprovement && 'border-l-4 border-l-emerald-400',
      isDecline && 'border-l-4 border-l-red-400',
      isNeutral && 'border-l-4 border-l-gray-300'
    )}>
      {/* Previous Value */}
      <div className="text-end">
        <p className="text-xs text-gray-400 mb-1">{metric.label}</p>
        <p className="text-lg font-semibold text-gray-600">{formatValue(metric.previous)}</p>
      </div>

      {/* Change */}
      <div className="text-center">
        <div className="flex items-center justify-center gap-1">
          {isPositive && <TrendingUp className="w-4 h-4 text-emerald-500" />}
          {isNegative && <TrendingDown className="w-4 h-4 text-red-500" />}
          {isNeutral && <Minus className="w-4 h-4 text-gray-400" />}
          <span className={cn(
            'text-sm font-bold',
            isImprovement && 'text-emerald-600',
            isDecline && 'text-red-600',
            isNeutral && 'text-gray-500'
          )}>
            {isPositive ? '+' : ''}{changePercent.toFixed(1)}%
          </span>
        </div>
        <p className={cn(
          'text-xs mt-0.5',
          isImprovement && 'text-emerald-500',
          isDecline && 'text-red-500',
          isNeutral && 'text-gray-400'
        )}>
          {isPositive ? '+' : ''}{formatValue(change)}
        </p>
        <ArrowRight className="w-4 h-4 text-gray-300 mx-auto mt-1" />
      </div>

      {/* Current Value */}
      <div className="text-start">
        <p className="text-xs text-gray-400 mb-1">{metric.label}</p>
        <p className={cn(
          'text-lg font-semibold',
          isImprovement && 'text-emerald-700',
          isDecline && 'text-red-700',
          isNeutral && 'text-gray-700'
        )}>
          {formatValue(metric.current)}
        </p>
      </div>
    </div>
  );
};

const CurrentOnlyCard = ({ label, value }: { label: string; value: string }) => (
  <div className="bg-gray-50 rounded-lg p-3">
    <p className="text-xs text-gray-400 mb-1">{label}</p>
    <p className="text-sm font-semibold text-gray-700">{value}</p>
  </div>
);

// Helper
function getOverallTrend(metrics: ComparisonMetric[]): 'up' | 'down' | 'neutral' {
  let improvements = 0;
  let declines = 0;

  metrics.forEach((m) => {
    const change = m.current - m.previous;
    if (change > 0) {
      if (m.higherIsBetter) improvements++;
      else declines++;
    } else if (change < 0) {
      if (m.higherIsBetter) declines++;
      else improvements++;
    }
  });

  if (improvements > declines) return 'up';
  if (declines > improvements) return 'down';
  return 'neutral';
}

export default PeriodComparisonView;
