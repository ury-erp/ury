import { useMemo } from 'react';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboard-store';
import { formatCurrency } from '../../lib/utils';
import { cn } from '../../lib/utils';
import { t } from '../../i18n';

interface ComparisonMetric {
  label: string;
  current: number;
  previous: number;
  format: 'currency' | 'number';
}

const PeriodComparison = () => {
  const { summary, previousSummary } = useDashboardStore();

  const metrics = useMemo<ComparisonMetric[]>(() => {
    if (!summary) return [];

    return [
      {
        label: t('dashboard.total_revenue'),
        current: summary.total_revenue || 0,
        previous: previousSummary?.total_revenue || 0,
        format: 'currency',
      },
      {
        label: t('dashboard.total_orders'),
        current: summary.total_orders || 0,
        previous: previousSummary?.total_orders || 0,
        format: 'number',
      },
      {
        label: 'Avg Order Value',
        current: summary.average_order_value || 0,
        previous: previousSummary?.average_order_value || 0,
        format: 'currency',
      },
    ];
  }, [summary, previousSummary]);

  const formatValue = (value: number, format: 'currency' | 'number') => {
    if (format === 'currency') return formatCurrency(value);
    return value.toLocaleString();
  };

  const getChangePercent = (current: number, previous: number) => {
    if (previous === 0) {
      if (current > 0) return 100;
      return 0;
    }
    return ((current - previous) / previous) * 100;
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700">
          {t('dashboard.period_comparison')}
        </h3>
        <span className="text-xs text-gray-400">
          {t('dashboard.vs_previous_period')}
        </span>
      </div>

      {metrics.length === 0 ? (
        <div className="h-24 flex items-center justify-center text-gray-400 text-sm">
          {t('dashboard.no_data_available')}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {metrics.map((metric) => {
            const changePercent = getChangePercent(metric.current, metric.previous);
            const isPositive = changePercent > 0;
            const isNeutral = changePercent === 0;
            const absPercent = Math.abs(changePercent).toFixed(1);

            return (
              <div key={metric.label} className="bg-gray-50 rounded-lg p-3">
                <p className="text-xs text-gray-500 mb-2">{metric.label}</p>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-lg font-bold text-gray-900">
                      {formatValue(metric.current, metric.format)}
                    </p>
                    {previousSummary && (
                      <p className="text-xs text-gray-400 mt-0.5">
                        Prev: {formatValue(metric.previous, metric.format)}
                      </p>
                    )}
                  </div>
                  {previousSummary && (
                    <div
                      className={cn(
                        'flex items-center gap-0.5 px-2 py-0.5 rounded-full text-xs font-medium',
                        isPositive && 'bg-emerald-50 text-emerald-600',
                        !isPositive && !isNeutral && 'bg-red-50 text-red-600',
                        isNeutral && 'bg-gray-100 text-gray-500'
                      )}
                    >
                      {isPositive && <ArrowUpRight className="w-3 h-3" />}
                      {!isPositive && !isNeutral && <ArrowDownRight className="w-3 h-3" />}
                      {isNeutral && <Minus className="w-3 h-3" />}
                      <span>{absPercent}%</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PeriodComparison;
