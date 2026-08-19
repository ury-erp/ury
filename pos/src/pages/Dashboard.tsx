import { TrendingUp, AlertTriangle, Bell, Users, ShoppingCart, Clock } from 'lucide-react';
import { Card, CardContent } from '@ury/ui';
import { useState, useEffect } from 'react';
import { usePOSStore } from '../store/pos-store';
import { formatCurrency } from '@ury/core';
import InsightFeed from '../components/dashboard/InsightFeed';
import FastMovingItems from '../components/dashboard/FastMovingItems';
import BaselineComparisonStrip from '../components/dashboard/BaselineComparisonStrip';

// Helper function to format relative time
function getRelativeTime(creationDate: string): string {
  const now = new Date();
  const date = new Date(creationDate);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hr ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

// Helper to format ETA minutes into readable time
function formatETA(minutes: number | null): string {
  if (minutes === null) return 'Holds';
  if (minutes <= 90) return `~${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `~${hours} hr ${mins > 0 ? `${mins} min` : ''}`.trim();
}

export default function Dashboard() {
  const { posProfile } = usePOSStore();
  const [stats, setStats] = useState<any[]>([]);
  const [serviceLine, setServiceLine] = useState<any[]>([]);
  const [shiftMetrics, setShiftMetrics] = useState<any>(null);
  const [shiftMetricsLoading, setShiftMetricsLoading] = useState(true);
  const [shiftMetricsError, setShiftMetricsError] = useState<string | null>(null);
  const [floorLoad, setFloorLoad] = useState<any[]>([]);
  const [runningLow, setRunningLow] = useState<any[]>([]);
  const [needsAttention, setNeedsAttention] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [serviceLineLoading, setServiceLineLoading] = useState(false);
  const [floorLoadLoading, setFloorLoadLoading] = useState(false);
  const [runningLowLoading, setRunningLowLoading] = useState(false);
  const [needsAttentionLoading, setNeedsAttentionLoading] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [serviceLineError, setServiceLineError] = useState<string | null>(null);
  const [floorLoadError, setFloorLoadError] = useState<string | null>(null);
  const [runningLowError, setRunningLowError] = useState<string | null>(null);
  const [needsAttentionError, setNeedsAttentionError] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  useEffect(() => {
    if (!posProfile?.branch) return;

    const fetchDashboardData = async () => {
      const { call } = await import('@ury/core');

      // Fetch dashboard stats
      setStatsLoading(true);
      setStatsError(null);
      try {
        const statsRes = await call.get('ury.ury.api.ury_dashboard.get_dashboard_stats', {
          branch: posProfile.branch
        });
        const statsData = statsRes.message;
        setStats([
          {
            label: "Today's Sales",
            value: formatCurrency(statsData.todays_sales),
            icon: TrendingUp,
            color: 'text-green-600'
          },
          {
            label: 'Orders Today',
            value: String(statsData.orders_today),
            icon: ShoppingCart,
            color: 'text-blue-600'
          },
          {
            label: 'Avg. Order Value',
            value: formatCurrency(statsData.avg_order_value),
            icon: Clock,
            color: 'text-purple-600'
          },
          {
            label: 'Active Tables',
            value: `${statsData.active_tables} / ${statsData.total_tables}`,
            icon: Users,
            color: 'text-orange-600'
          }
        ]);
      } catch (err) {
        setStatsError('Failed to load stats');
        console.error('Error fetching stats:', err);
      } finally {
        setStatsLoading(false);
      }

      // Fetch service line
      setServiceLineLoading(true);
      setServiceLineError(null);
      try {
        const serviceRes = await call.get('ury.ury.api.ury_service_line.get_service_line', {
          branch: posProfile.branch
        });
        const serviceData = Array.isArray(serviceRes.message) ? serviceRes.message : [];
        setServiceLine(serviceData);
      } catch (err) {
        setServiceLineError('Failed to load service line');
        console.error('Error fetching service line:', err);
      } finally {
        setServiceLineLoading(false);
      }

      // Fetch shift metrics (avg per cover / avg ticket time — not covered by BaselineComparisonStrip)
      setShiftMetricsLoading(true);
      setShiftMetricsError(null);
      try {
        const shiftRes = await call.get('ury.ury.api.ury_dashboard.get_shift_metrics', {
          branch: posProfile.branch
        });
        setShiftMetrics(shiftRes.message);
      } catch (err) {
        setShiftMetricsError('Failed to load shift metrics');
        console.error('Error fetching shift metrics:', err);
      } finally {
        setShiftMetricsLoading(false);
      }

      // Fetch floor load
      setFloorLoadLoading(true);
      setFloorLoadError(null);
      try {
        const floorRes = await call.get('ury.ury.api.ury_dashboard.get_floor_load', {
          branch: posProfile.branch
        });
        const floorData = Array.isArray(floorRes.message) ? floorRes.message : [];
        setFloorLoad(floorData);
      } catch (err) {
        setFloorLoadError('Failed to load floor load');
        console.error('Error fetching floor load:', err);
      } finally {
        setFloorLoadLoading(false);
      }

      // Fetch running low items
      setRunningLowLoading(true);
      setRunningLowError(null);
      try {
        const runningRes = await call.get('ury.ury.api.ury_service_line.get_running_low', {
          branch: posProfile.branch
        });
        const runningData = Array.isArray(runningRes.message) ? runningRes.message : [];
        setRunningLow(runningData);
      } catch (err) {
        setRunningLowError('Failed to load running low items');
        console.error('Error fetching running low:', err);
      } finally {
        setRunningLowLoading(false);
      }

      // Fetch needs attention
      setNeedsAttentionLoading(true);
      setNeedsAttentionError(null);
      try {
        const attentionRes = await call.get('ury.ury.api.ury_dashboard.get_needs_attention', {
          branch: posProfile.branch
        });
        const attentionData = attentionRes.message;
        if (Array.isArray(attentionData) && attentionData.length > 0) {
          const processedAttention = attentionData.map((item, idx) => ({
            id: idx,
            message: item.message,
            icon: item.severity === 'high' ? AlertTriangle : Clock,
            severity: item.severity
          }));
          setNeedsAttention(processedAttention);
        } else {
          setNeedsAttention([]);
        }
      } catch (err) {
        setNeedsAttentionError('Failed to load needs attention');
        console.error('Error fetching needs attention:', err);
      } finally {
        setNeedsAttentionLoading(false);
      }

      // Fetch recent notifications
      setNotificationsLoading(true);
      setNotificationsError(null);
      try {
        const params = new URLSearchParams({
          doctype: 'Notification Log',
          fields: JSON.stringify(['name', 'subject', 'creation']),
          order_by: 'creation desc',
          limit_page_length: '10'
        });
        const notificationsRes = await fetch(
          `/api/method/frappe.client.get_list?${params.toString()}`
        );
        if (!notificationsRes.ok) throw new Error('Failed to fetch notifications');
        const notificationsData = await notificationsRes.json();
        const processedNotifications = (notificationsData.message || []).map((notif: any) => ({
          id: notif.name,
          message: notif.subject,
          timestamp: getRelativeTime(notif.creation)
        }));
        setNotifications(processedNotifications);
      } catch (err) {
        setNotificationsError('Failed to load notifications');
        console.error('Error fetching notifications:', err);
      } finally {
        setNotificationsLoading(false);
      }
    };

    fetchDashboardData();
  }, [posProfile?.branch]);

  // Calculate max minutes for service line bar height
  const maxMinutes = Math.max(90, ...serviceLine.filter(t => t.minutes !== null).map((t: any) => t.minutes), 1);
  const maxTableCount = Math.max(...floorLoad.map((f: any) => f.table_count), 1);

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50 font-display">
      {/* Insight Feed - "Act now" */}
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Dashboard</h2>
        <InsightFeed branch={posProfile?.branch} />
      </div>

      {/* Stat Cards Row */}
      <div className="mb-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {statsError ? (
            <div className="col-span-full text-red-600 text-sm">Failed to load stats</div>
          ) : statsLoading ? (
            <div className="col-span-full text-gray-600 text-sm">Loading...</div>
          ) : (
            stats.map((stat, index) => {
              const IconComponent = stat.icon;
              return (
                <Card key={index} className="bg-white border border-gray-200">
                  <CardContent className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="text-sm font-medium text-gray-600">{stat.label}</h3>
                      <IconComponent className={`w-5 h-5 ${stat.color}`} />
                    </div>
                    <p className="font-mono text-2xl font-bold text-gray-900">{stat.value}</p>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Service Line Section */}
      <div className="mb-6">
        <Card className="bg-white border border-gray-200">
          <CardContent className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Service Line</h3>
            {serviceLineError ? (
              <p className="text-red-600 text-sm">Failed to load service line</p>
            ) : serviceLineLoading ? (
              <p className="text-gray-600 text-sm">Loading...</p>
            ) : serviceLine.length === 0 ? (
              <p className="text-gray-600 text-sm">No tables currently seated.</p>
            ) : (
              <div>
                {/* Legend */}
                <div className="flex flex-wrap gap-4 mb-4 text-xs text-gray-600">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-gray-300 rounded"></div>
                    <span>Open</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-300 rounded"></div>
                    <span>Seated</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded"></div>
                    <span>Fired</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-700 rounded"></div>
                    <span>Served</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-red-600 rounded"></div>
                    <span>Over time</span>
                  </div>
                </div>

                {/* Bars */}
                <div className="flex items-end gap-1 h-24 border-b border-gray-200 pb-2 overflow-x-auto">
                  {serviceLine.map((table: any, idx: number) => {
                    let barColor = 'bg-gray-300';
                    if (table.stage === 'open') barColor = 'bg-gray-300';
                    else if (table.stage === 'seated') barColor = 'bg-blue-300';
                    else if (table.stage === 'fired') barColor = 'bg-blue-500';
                    else if (table.stage === 'served') barColor = 'bg-blue-700';
                    else if (table.stage === 'over') barColor = 'bg-red-600';

                    const barHeight = table.minutes !== null ? (table.minutes / maxMinutes) * 100 : 5;

                    return (
                      <div key={idx} className="flex flex-col items-center flex-shrink-0">
                        {table.minutes !== null && (
                          <span className="font-mono text-xs text-gray-600 mb-1 h-4">{table.minutes}</span>
                        )}
                        <div
                          className={`w-8 ${barColor} rounded-t transition-all`}
                          style={{ height: `${barHeight}%`, minHeight: '4px' }}
                        />
                        <span className="text-xs text-gray-700 mt-1">{table.table}</span>
                      </div>
                    );
                  })}
                </div>

                {/* Summary */}
                {serviceLine.filter((t: any) => t.stage === 'over').length > 0 && (
                  <div className="mt-3 text-sm text-red-600">
                    {serviceLine.filter((t: any) => t.stage === 'over').length} table{serviceLine.filter((t: any) => t.stage === 'over').length !== 1 ? 's' : ''} running over time
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
        {/* Left column - stacked sections */}
        <div className="space-y-6">
          {/* Needs Attention Section */}
          <Card className="bg-white border border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
                <h3 className="text-lg font-semibold text-gray-900">Needs Attention</h3>
              </div>
              <div className="space-y-3">
                {needsAttentionError ? (
                  <p className="text-red-600 text-sm">Failed to load</p>
                ) : needsAttentionLoading ? (
                  <p className="text-gray-600 text-sm">Loading...</p>
                ) : needsAttention.length === 0 ? (
                  <p className="text-gray-600 text-sm">Nothing needs attention right now.</p>
                ) : (
                  needsAttention.map((item) => {
                    const ItemIcon = item.icon;
                    const severityColor = item.severity === 'high'
                      ? 'border-l-4 border-l-red-500 bg-red-50'
                      : 'border-l-4 border-l-amber-500 bg-amber-50';
                    return (
                      <div key={item.id} className={`p-3 rounded ${severityColor}`}>
                        <div className="flex items-center gap-3">
                          <ItemIcon className={`w-4 h-4 flex-shrink-0 ${item.severity === 'high' ? 'text-red-600' : 'text-amber-600'}`} />
                          <p className="text-sm text-gray-700">{item.message}</p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>

          {/* Baseline comparison strip (item 9) */}
          <BaselineComparisonStrip branch={posProfile?.branch} />

          {/* Shift metrics not covered by the baseline strip (avg per cover / avg ticket time) */}
          <Card className="bg-white border border-gray-200">
            <CardContent className="p-6">
              {shiftMetricsError ? (
                <p className="text-red-600 text-sm">Failed to load metrics</p>
              ) : shiftMetricsLoading ? (
                <p className="text-gray-600 text-sm">Loading...</p>
              ) : !shiftMetrics ? (
                <p className="text-gray-600 text-sm">No data available</p>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Avg per Cover</p>
                    <p className="text-lg font-bold text-gray-900">{formatCurrency(shiftMetrics.avg_per_cover)}</p>
                  </div>
                  <div className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-600 mb-1">Avg Ticket Time</p>
                    <p className="text-lg font-bold text-gray-900">
                      {shiftMetrics.avg_ticket_minutes !== null && shiftMetrics.avg_ticket_minutes !== undefined
                        ? `${Math.round(shiftMetrics.avg_ticket_minutes)} min`
                        : '—'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fast-moving items (item 7) */}
          <FastMovingItems branch={posProfile?.branch} />

          {/* Running Low Section */}
          <Card className="bg-white border border-gray-200">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Running Low</h3>
              {runningLowError ? (
                <p className="text-red-600 text-sm">Failed to load</p>
              ) : runningLowLoading ? (
                <p className="text-gray-600 text-sm">Loading...</p>
              ) : runningLow.length === 0 ? (
                <p className="text-gray-600 text-sm">No items selling fast enough to forecast yet.</p>
              ) : (
                <div className="space-y-3">
                  {runningLow.map((item, idx) => (
                    <div key={idx} className="flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-sm font-medium text-gray-900 truncate">{item.item_name}</span>
                          <span className="text-xs text-gray-600 ml-2 flex-shrink-0">{formatETA(item.eta_minutes)}</span>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div
                            className="h-full bg-amber-500 rounded-full"
                            style={{ width: `${Math.min((item.remaining / (item.remaining + item.qty_sold_today)) * 100, 100)}%` }}
                          />
                        </div>
                        {item.data_quality_issue && (
                          <p className="text-xs text-gray-500 mt-1">(stock data needs review)</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right column - narrow rail */}
        <div className="space-y-6">
          {/* Floor Load Section */}
          <Card className="bg-white border border-gray-200">
            <CardContent className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Floor Load</h3>
              {floorLoadError ? (
                <p className="text-red-600 text-sm">Failed to load</p>
              ) : floorLoadLoading ? (
                <p className="text-gray-600 text-sm">Loading...</p>
              ) : floorLoad.length === 0 ? (
                <p className="text-gray-600 text-sm">No tables currently assigned.</p>
              ) : (
                <div className="space-y-3">
                  {floorLoad.map((waiter, idx) => (
                    <div key={idx}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-gray-700">{waiter.waiter}</span>
                        <span className="text-xs text-gray-600">{waiter.table_count} table{waiter.table_count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-blue-600 rounded-full"
                          style={{ width: `${(waiter.table_count / maxTableCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Shift Brief Section */}
          <Card className="bg-white border border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center justify-between gap-2 mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Shift Brief</h3>
                <span className="inline-block text-xs font-semibold px-2 py-1 bg-purple-50 text-purple-700 border border-purple-200 rounded">
                  HUF
                </span>
              </div>
              <p className="text-sm text-gray-600">
                AI-written shift summaries are not yet connected. This panel will show HUF's shift observations once integrated.
              </p>
            </CardContent>
          </Card>

          {/* Recent Notifications Section */}
          <Card className="bg-white border border-gray-200">
            <CardContent className="p-6">
              <div className="flex items-center gap-2 mb-4">
                <Bell className="w-5 h-5 text-blue-600" />
                <h3 className="text-lg font-semibold text-gray-900">Recent Notifications</h3>
              </div>
              <div className="space-y-2">
                {notificationsError ? (
                  <p className="text-red-600 text-sm">Failed to load</p>
                ) : notificationsLoading ? (
                  <p className="text-gray-600 text-sm">Loading...</p>
                ) : notifications.length === 0 ? (
                  <p className="text-gray-600 text-sm">No recent notifications.</p>
                ) : (
                  notifications.map((notification) => (
                    <div key={notification.id} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-b-0">
                      <p className="text-xs text-gray-700">{notification.message}</p>
                      <span className="text-xs text-gray-500 ml-2 flex-shrink-0 whitespace-nowrap">{notification.timestamp}</span>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
