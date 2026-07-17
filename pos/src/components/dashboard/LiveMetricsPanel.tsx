import { useEffect, memo } from 'react';
import { Activity, DollarSign, ShoppingCart, Clock } from 'lucide-react';
import { useDashboardStore } from '../../store/dashboard-store';
import { formatCurrency, formatInvoiceTime } from '../../lib/utils';
import { cn } from '../../lib/utils';

const LiveMetricsPanel = () => {
  const { liveMetrics, liveLoading, fetchLiveMetrics, autoRefresh } = useDashboardStore();

  useEffect(() => {
    fetchLiveMetrics();
  }, [fetchLiveMetrics]);

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Activity className={cn('w-4 h-4', autoRefresh && 'text-emerald-500 animate-pulse')} />
          Live Metrics
        </h3>
        {liveMetrics && (
          <span className="text-xs text-gray-400">
            Updated: {new Date(liveMetrics.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {liveLoading && !liveMetrics ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : liveMetrics ? (
        <div className="space-y-4">
          {/* Quick stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-blue-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <DollarSign className="w-4 h-4 text-blue-500" />
                <span className="text-xs text-blue-600">Today Revenue</span>
              </div>
              <p className="text-lg font-bold text-blue-700">
                {formatCurrency(liveMetrics.today_revenue)}
              </p>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3">
              <div className="flex items-center gap-2 mb-1">
                <ShoppingCart className="w-4 h-4 text-emerald-500" />
                <span className="text-xs text-emerald-600">Today Orders</span>
              </div>
              <p className="text-lg font-bold text-emerald-700">{liveMetrics.today_orders}</p>
            </div>
          </div>

          {/* Pending KOTs */}
          <div
            className={cn(
              'rounded-lg p-3',
              liveMetrics.pending_kots > 0 ? 'bg-amber-50' : 'bg-gray-50',
            )}
          >
            <div className="flex items-center gap-2">
              <Clock
                className={cn(
                  'w-4 h-4',
                  liveMetrics.pending_kots > 0 ? 'text-amber-500' : 'text-gray-400',
                )}
              />
              <span
                className={cn(
                  'text-sm font-medium',
                  liveMetrics.pending_kots > 0 ? 'text-amber-700' : 'text-gray-500',
                )}
              >
                {liveMetrics.pending_kots} Pending KOTs
              </span>
            </div>
          </div>

          {/* Recent Orders */}
          <div>
            <h4 className="text-xs font-medium text-gray-500 mb-2">Recent Orders</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {liveMetrics.recent_orders.map((order) => (
                <div
                  key={order.name}
                  className="flex items-center justify-between py-2 px-3 bg-gray-50 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">{order.customer}</p>
                    <p className="text-xs text-gray-400">
                      {order.name} | {order.order_type}
                    </p>
                  </div>
                  <div className="text-end">
                    <p className="text-sm font-medium text-gray-900">
                      {formatCurrency(order.grand_total)}
                    </p>
                    <p className="text-xs text-gray-400">{formatInvoiceTime(order.posting_time)}</p>
                  </div>
                </div>
              ))}
              {liveMetrics.recent_orders.length === 0 && (
                <p className="text-xs text-gray-400 text-center py-4">No recent orders</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-center text-gray-400 text-sm py-4">Unable to load live data</p>
      )}
    </div>
  );
};

export default memo(LiveMetricsPanel);
