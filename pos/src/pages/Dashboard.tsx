import { AlertTriangle, Bell } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Spinner } from '@ury/ui';
import { useState, useEffect } from 'react';
import { usePOSStore } from '../store/pos-store';
import { formatCurrency } from '@ury/core';
import HufLogo from '../components/HufLogo';

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
  const [baseline, setBaseline] = useState<any>(null);
  const [floorLoad, setFloorLoad] = useState<any[]>([]);
  const [runningLow, setRunningLow] = useState<any[]>([]);
  const [needsAttention, setNeedsAttention] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [serviceLineLoading, setServiceLineLoading] = useState(false);
  const [metricsLoading, setMetricsLoading] = useState(false);
  const [floorLoadLoading, setFloorLoadLoading] = useState(false);
  const [runningLowLoading, setRunningLowLoading] = useState(false);
  const [needsAttentionLoading, setNeedsAttentionLoading] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [serviceLineError, setServiceLineError] = useState<string | null>(null);
  const [metricsError, setMetricsError] = useState<string | null>(null);
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
            label: "TODAY'S SALES",
            value: formatCurrency(statsData.todays_sales),
          },
          {
            label: 'ORDERS TODAY',
            value: String(statsData.orders_today),
          },
          {
            label: 'AVG. ORDER VALUE',
            value: formatCurrency(statsData.avg_order_value),
          },
          {
            label: 'ACTIVE TABLES',
            value: `${statsData.active_tables} / ${statsData.total_tables}`,
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

      // Fetch shift metrics and baseline
      setMetricsLoading(true);
      setMetricsError(null);
      try {
        const metricsRes = await call.get('ury.ury.api.ury_dashboard.get_shift_metrics', {
          branch: posProfile.branch
        });
        setShiftMetrics(metricsRes.message);

        const baselineRes = await call.get('ury.ury.api.ury_dashboard.get_baseline', {
          branch: posProfile.branch
        });
        setBaseline(baselineRes.message);
      } catch (err) {
        setMetricsError('Failed to load metrics');
        console.error('Error fetching metrics:', err);
      } finally {
        setMetricsLoading(false);
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
            icon: item.severity === 'high' ? AlertTriangle : AlertTriangle,
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
    <div className="h-full overflow-y-auto p-6 bg-gray-50 space-y-6">
      {/* 1. KPI Stat Cards Grid */}
      <section className="w-full">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {statsError ? (
            <div className="col-span-full text-red-600 text-sm">Failed to load stats</div>
          ) : statsLoading ? (
            <div className="col-span-full flex items-center gap-2 text-gray-400 text-sm">
              <Spinner className="w-4 h-4 text-primary" /> Loading stats...
            </div>
          ) : (
            stats.map((stat, index) => (
              <Card
                key={index}
                className="rounded-lg border border-gray-200 bg-white p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:border-primary/20"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-500">{stat.label}</p>
                <h3 className="mt-2 text-2xl font-bold text-gray-900 tracking-tight">{stat.value}</h3>
              </Card>
            ))
          )}
        </div>
      </section>

      {/* 2. Service Line Section */}
      <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
        <CardHeader className="p-0 pb-4">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-bold text-gray-900">Service Line</CardTitle>
              <p className="text-xs text-gray-500 mt-1">Real-time table progress and order turnaround</p>
            </div>
            {serviceLine.filter((t: any) => t.stage === 'over').length > 0 && (
              <Badge variant="outline" className="border-red-200 bg-red-50 text-red-700 font-medium">
                {serviceLine.filter((t: any) => t.stage === 'over').length} Over Time
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="p-0 pt-2">
          {serviceLineError ? (
            <p className="text-red-600 text-sm">Failed to load service line</p>
          ) : serviceLineLoading ? (
            <div className="py-8 flex items-center justify-center">
              <Spinner className="w-6 h-6 text-primary" />
            </div>
          ) : serviceLine.length === 0 ? (
            <div className="py-8 flex items-center justify-center border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
              No tables currently seated.
            </div>
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
                        <span className="text-xs text-gray-600 mb-1 h-4">{table.minutes}</span>
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
                <div className="mt-3 text-xs font-semibold text-red-600">
                  {serviceLine.filter((t: any) => t.stage === 'over').length} table{serviceLine.filter((t: any) => t.stage === 'over').length !== 1 ? 's' : ''} running over time
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 3. Two-column Responsive Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column (lg:col-span-7) */}
        <div className="lg:col-span-7 space-y-6">
          {/* Needs Attention Section */}
          <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <CardHeader className="p-0 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                    <CardTitle className="text-lg font-bold text-gray-900">Needs Attention</CardTitle>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">Items requiring immediate operational action</p>
                </div>
                {needsAttention.length > 0 && (
                  <Badge variant="outline" className="border-amber-200 bg-amber-50 text-amber-700 font-medium">
                    {needsAttention.length} Alerts
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              {needsAttentionError ? (
                <p className="text-red-600 text-sm">Failed to load</p>
              ) : needsAttentionLoading ? (
                <div className="py-6 flex items-center justify-center">
                  <Spinner className="w-6 h-6 text-primary" />
                </div>
              ) : needsAttention.length === 0 ? (
                <div className="py-6 flex items-center justify-center border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
                  Nothing needs attention right now.
                </div>
              ) : (
                <div className="space-y-3">
                  {needsAttention.map((item) => {
                    const ItemIcon = item.icon;
                    const severityColor = item.severity === 'high'
                      ? 'border-l-4 border-l-red-500 bg-red-50 text-red-900'
                      : 'border-l-4 border-l-amber-500 bg-amber-50 text-amber-900';
                    return (
                      <div key={item.id} className={`p-3 rounded-lg ${severityColor}`}>
                        <div className="flex items-center gap-3">
                          <ItemIcon className={`w-4 h-4 flex-shrink-0 ${item.severity === 'high' ? 'text-red-600' : 'text-amber-600'}`} />
                          <p className="text-xs font-medium text-gray-800">{item.message}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Tonight vs Baseline */}
          <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <CardHeader className="p-0 pb-4">
              <div>
                <CardTitle className="text-lg font-bold text-gray-900">Tonight vs Baseline</CardTitle>
                <p className="text-xs text-gray-500 mt-1">Shift performance compared against historical baseline</p>
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              {metricsError ? (
                <p className="text-red-600 text-sm">Failed to load metrics</p>
              ) : metricsLoading ? (
                <div className="py-6 flex items-center justify-center">
                  <Spinner className="w-6 h-6 text-primary" />
                </div>
              ) : !shiftMetrics || !baseline ? (
                <div className="py-6 flex items-center justify-center border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
                  No baseline data available
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  {/* Sales */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Sales</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(shiftMetrics.sales)}</p>
                    {baseline.sample_days > 0 && (
                      <p className="text-xs mt-1.5 font-medium">
                        <span className={shiftMetrics.sales >= baseline.median_sales ? 'text-green-600' : 'text-red-600'}>
                          {shiftMetrics.sales >= baseline.median_sales ? '▲ +' : '▼ '}{((shiftMetrics.sales - baseline.median_sales) / baseline.median_sales * 100).toFixed(0)}%
                        </span>
                        <span className="text-gray-500"> vs {formatCurrency(baseline.median_sales)}</span>
                      </p>
                    )}
                  </div>

                  {/* Covers */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Covers</p>
                    <p className="text-xl font-bold text-gray-900">{shiftMetrics.covers}</p>
                    {baseline.sample_days > 0 && (
                      <p className="text-xs mt-1.5 font-medium">
                        <span className={shiftMetrics.covers >= baseline.median_covers ? 'text-green-600' : 'text-red-600'}>
                          {shiftMetrics.covers >= baseline.median_covers ? '▲ +' : '▼ '}{shiftMetrics.covers - baseline.median_covers}
                        </span>
                        <span className="text-gray-500"> vs {baseline.median_covers}</span>
                      </p>
                    )}
                  </div>

                  {/* Avg per Cover */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Avg per Cover</p>
                    <p className="text-xl font-bold text-gray-900">{formatCurrency(shiftMetrics.avg_per_cover)}</p>
                  </div>

                  {/* Avg Ticket Time */}
                  <div className="p-4 bg-gray-50 rounded-lg border border-gray-100">
                    <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">Avg Ticket Time</p>
                    <p className="text-xl font-bold text-gray-900">
                      {shiftMetrics.avg_ticket_minutes !== null ? `${shiftMetrics.avg_ticket_minutes} min` : '—'}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Running Low Section */}
          <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <CardHeader className="p-0 pb-4">
              <div>
                <CardTitle className="text-lg font-bold text-gray-900">Running Low</CardTitle>
                <p className="text-xs text-gray-500 mt-1">Inventory forecast and fast-depleting menu items</p>
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              {runningLowError ? (
                <p className="text-red-600 text-sm">Failed to load</p>
              ) : runningLowLoading ? (
                <div className="py-6 flex items-center justify-center">
                  <Spinner className="w-6 h-6 text-primary" />
                </div>
              ) : runningLow.length === 0 ? (
                <div className="py-6 flex items-center justify-center border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
                  No items selling fast enough to forecast yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {runningLow.map((item, idx) => (
                    <div key={idx} className="space-y-1.5 p-2.5 rounded-lg bg-gray-50/60 border border-gray-100">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-gray-800 truncate">{item.item_name}</span>
                        <span className="text-amber-700 font-bold ml-2 flex-shrink-0">{formatETA(item.eta_minutes)}</span>
                      </div>
                      <div className="relative h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500"
                          style={{ width: `${Math.min((item.remaining / (item.remaining + item.qty_sold_today)) * 100, 100)}%` }}
                        />
                      </div>
                      {item.data_quality_issue && (
                        <p className="text-[11px] text-gray-400 mt-0.5">(stock data needs review)</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column (lg:col-span-5) */}
        <div className="lg:col-span-5 space-y-6">
          {/* Shift Brief Section */}
          <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <CardHeader className="p-0 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg font-bold text-gray-900">Shift Brief</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">AI-assisted operational shift overview</p>
                </div>
                <Badge variant="outline" className="border-purple-200 bg-purple-50 px-2.5 py-1 flex items-center justify-center">
                  <HufLogo className="h-3.5 w-auto" />
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              <p className="text-xs text-gray-500 leading-relaxed">
                AI-written shift summaries are not yet connected. This panel will show HUF&apos;s shift observations once integrated.
              </p>
            </CardContent>
          </Card>

          {/* Floor Load Section */}
          <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <CardHeader className="p-0 pb-4">
              <div>
                <CardTitle className="text-lg font-bold text-gray-900">Floor Load</CardTitle>
                <p className="text-xs text-gray-500 mt-1">Current table assignments per service staff</p>
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              {floorLoadError ? (
                <p className="text-red-600 text-sm">Failed to load</p>
              ) : floorLoadLoading ? (
                <div className="py-6 flex items-center justify-center">
                  <Spinner className="w-6 h-6 text-primary" />
                </div>
              ) : floorLoad.length === 0 ? (
                <div className="py-6 flex items-center justify-center border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
                  No tables currently assigned.
                </div>
              ) : (
                <div className="space-y-3">
                  {floorLoad.map((waiter, idx) => (
                    <div key={idx} className="space-y-1.5 p-2.5 rounded-lg bg-gray-50/60 border border-gray-100">
                      <div className="flex items-center justify-between text-xs font-semibold">
                        <span className="text-gray-800">{waiter.waiter}</span>
                        <span className="text-blue-700 font-bold">{waiter.table_count} table{waiter.table_count !== 1 ? 's' : ''}</span>
                      </div>
                      <div className="relative h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-indigo-500"
                          style={{ width: `${(waiter.table_count / maxTableCount) * 100}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Notifications Section */}
          <Card className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
            <CardHeader className="p-0 pb-4">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-blue-600" />
                <div>
                  <CardTitle className="text-lg font-bold text-gray-900">Recent Notifications</CardTitle>
                  <p className="text-xs text-gray-500 mt-0.5">System and operational alerts stream</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0 pt-2">
              {notificationsError ? (
                <p className="text-red-600 text-sm">Failed to load</p>
              ) : notificationsLoading ? (
                <div className="py-6 flex items-center justify-center">
                  <Spinner className="w-6 h-6 text-primary" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-6 flex items-center justify-center border border-dashed border-gray-200 rounded-lg text-gray-400 text-xs">
                  No recent notifications.
                </div>
              ) : (
                <div className="space-y-2">
                  {notifications.map((notification) => (
                    <div key={notification.id} className="flex items-start justify-between py-2 border-b border-gray-100 last:border-b-0 text-xs">
                      <p className="text-gray-700 font-medium">{notification.message}</p>
                      <span className="text-gray-400 ml-2 flex-shrink-0 whitespace-nowrap text-[11px]">{notification.timestamp}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
