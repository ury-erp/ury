import { TrendingUp, AlertTriangle, Bell, Users, ShoppingCart, Clock } from 'lucide-react';
import { Card, CardContent } from '@ury/ui';

export default function Dashboard() {
  // Dummy stat data
  const stats = [
    {
      label: "Today's Sales",
      value: '$2,450.00',
      icon: TrendingUp,
      color: 'text-green-600'
    },
    {
      label: 'Orders Today',
      value: '38',
      icon: ShoppingCart,
      color: 'text-blue-600'
    },
    {
      label: 'Avg. Order Value',
      value: '$64.47',
      icon: Clock,
      color: 'text-purple-600'
    },
    {
      label: 'Active Tables',
      value: '5 / 12',
      icon: Users,
      color: 'text-orange-600'
    }
  ];

  // Dummy needs attention data
  const needsAttention = [
    {
      id: 1,
      message: '3 orders pending payment',
      icon: AlertTriangle,
      severity: 'high'
    },
    {
      id: 2,
      message: 'Table 4 waiting 15+ minutes',
      icon: Clock,
      severity: 'medium'
    },
    {
      id: 3,
      message: 'Low stock: Chicken Tikka',
      icon: AlertTriangle,
      severity: 'medium'
    }
  ];

  // Dummy notifications data
  const notifications = [
    {
      id: 1,
      message: 'New order #1042 placed',
      timestamp: '2 min ago'
    },
    {
      id: 2,
      message: 'Table 7 payment completed',
      timestamp: '5 min ago'
    },
    {
      id: 3,
      message: 'New customer registered',
      timestamp: '12 min ago'
    }
  ];

  return (
    <div className="h-full overflow-y-auto p-6 bg-gray-50">
      {/* Stat Cards Row */}
      <div className="mb-8">
        <h2 className="text-2xl font-semibold text-gray-900 mb-4">Dashboard</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat, index) => {
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
          })}
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
              {needsAttention.map((item) => {
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
              })}
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
              {notifications.map((notification) => (
                <div key={notification.id} className="flex items-start justify-between py-3 border-b border-gray-100 last:border-b-0">
                  <p className="text-sm text-gray-700">{notification.message}</p>
                  <span className="text-xs text-gray-500 ml-2 flex-shrink-0">{notification.timestamp}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
