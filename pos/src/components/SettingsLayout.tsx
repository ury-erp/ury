import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Users, Shield, ArrowLeft, Settings } from 'lucide-react';
import { Button } from './ui';
import { usePermissions } from '../contexts/PermissionsContext';

const SettingsLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { hasCapability } = usePermissions();

  const navItems = [
    {
      path: '/settings/users',
      label: 'Users',
      icon: Users,
      capability: 'users.manage',
    },
    {
      path: '/settings/roles',
      label: 'Roles',
      icon: Shield,
      capability: 'roles.manage',
    },
  ].filter(item => hasCapability(item.capability));

  const currentPath = location.pathname;

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Settings Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Settings className="w-6 h-6 text-gray-700" />
            <h1 className="text-xl font-semibold text-gray-900">Settings</h1>
          </div>
          <Button
            variant="ghost"
            onClick={() => navigate('/')}
            className="flex items-center space-x-2 text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Back to POS</span>
          </Button>
        </div>
      </div>

      {/* Settings Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-white border-r border-gray-200">
          <nav className="p-4 space-y-1">
            {navItems.map((item) => {
              const isActive = currentPath === item.path || currentPath.startsWith(item.path);
              const Icon = item.icon;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  <Icon className={`w-5 h-5 ${isActive ? 'text-primary-600' : 'text-gray-500'}`} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 overflow-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
};

export default SettingsLayout;
