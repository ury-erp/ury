import { TrendingUp, AlertTriangle, Bell, Users, ShoppingCart, Clock } from 'lucide-react';
import { Card, CardContent } from '@ury/ui';
import { useState, useEffect } from 'react';
import { usePOSStore } from '../store/pos-store';
import { formatCurrency } from '@ury/core';

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

export default function Dashboard() {
  const { posProfile } = usePOSStore();
  const [stats, setStats] = useState<any[]>([]);
  const [needsAttention, setNeedsAttention] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [statsLoading, setStatsLoading] = useState(false);
  const [needsAttentionLoading, setNeedsAttentionLoading] = useState(false);
  const [notificationsLoading, setNotificationsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [needsAttentionError, setNeedsAttentionError] = useState<string | null>(null);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);

  useEffect(() => {
    if (!posProfile?.branch) return;

    const fetchDashboardData = async () => {
      // Fetch dashboard stats
      setStatsLoading(true);
      setStatsError(null);
      try {
        const { call } = await import('@ury/core');
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

      // Fetch needs attention
      setNeedsAttentionLoading(true);
      setNeedsAttentionError(null);
      try {
        const { call } = await import('@ury/core');
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

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      {/* Stat Cards Row */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Dashboard</h2>
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
                    <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      </div>

      {/* Needs Attention Section */}
      <div className="mb-8">
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
      </div>

      {/* Recent Notifications Section */}
      <div>
        <Card className="bg-white border border-gray-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-2 mb-4">
              <Bell className="w-5 h-5 text-blue-600" />
              <h3 className="text-lg font-semibold text-gray-900">Recent Notifications</h3>
            </div>
            <div className="space-y-3">
              {notificationsError ? (
                <p className="text-red-600 text-sm">Failed to load</p>
              ) : notificationsLoading ? (
                <p className="text-gray-600 text-sm">Loading...</p>
              ) : notifications.length === 0 ? (
                <p className="text-gray-600 text-sm">No recent notifications.</p>
              ) : (
                notifications.map((notification) => (
                  <div key={notification.id} className="flex items-start justify-between py-3 border-b border-gray-100 last:border-b-0">
                    <p className="text-sm text-gray-700">{notification.message}</p>
                    <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{notification.timestamp}</span>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
