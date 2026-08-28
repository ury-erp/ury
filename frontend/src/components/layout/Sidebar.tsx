import React, { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Utensils,
  Grid,
  Home,
  SlidersHorizontal,
  Users,
  Building2,
  ChevronDown,
  FileText,
  Settings,
  Store,
  ClipboardList,
  Warehouse,
  TrendingUp
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'URY Menu', path: '/menu', icon: Utensils },
  { label: 'URY Table', path: '/table', icon: Grid },
  { label: 'URY Room', path: '/room', icon: Home },
  { label: 'POS Profile', path: '/pos-profile', icon: SlidersHorizontal },
  { label: 'User', path: '/user', icon: Users },
  { label: 'Branch', path: '/branch', icon: Building2 },
  { label: 'Aggregators', path: '/aggregator', icon: Store },
  { label: 'Sales Plan', path: '/sales-plan', icon: ClipboardList },
  { label: 'Department Stock', path: '/department-stock', icon: Warehouse },
  { label: 'Profitability', path: '/department-profitability', icon: TrendingUp }
];

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const isAdvancedPath = location.pathname.startsWith('/report-settings');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(isAdvancedPath);

  return (
    <aside className="w-64 bg-white border-r border-gray-200 sticky top-16 h-[calc(100vh-4rem)] flex flex-col shrink-0 overflow-y-auto font-inter">
      <div className="p-4 flex-1 space-y-1">
        {/* Main Navigation Links */}
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-primary text-white shadow-sm font-semibold'
                    : 'text-gray-600 hover:bg-blue-50 hover:text-primary'
                }`
              }
            >
              <Icon className="w-5 h-5 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}

        {/* Advanced Settings Collapsible Accordion Section */}
        <div className="pt-2">
          <button
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isAdvancedPath
                ? 'text-primary font-semibold bg-blue-50'
                : 'text-gray-600 hover:bg-blue-50 hover:text-primary'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Settings className="w-5 h-5 shrink-0" />
              <span>Advanced Settings</span>
            </div>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                isAdvancedOpen ? 'rotate-180 text-primary' : 'text-gray-400'
              }`}
            />
          </button>

          {isAdvancedOpen && (
            <div className="mt-1 pl-4 space-y-1">
              <NavLink
                to="/report-settings"
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-primary text-white shadow-sm font-semibold'
                      : 'text-gray-600 hover:bg-blue-50 hover:text-primary'
                  }`
                }
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span>URY Report Settings</span>
              </NavLink>
              <NavLink
                to="/production-unit"
                className={({ isActive }) =>
                  `flex items-center space-x-3 px-3.5 py-2 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-primary text-white shadow-sm font-semibold'
                      : 'text-gray-600 hover:bg-blue-50 hover:text-primary'
                  }`
                }
              >
                <Grid className="w-4 h-4 shrink-0" />
                <span>Production Unit</span>
              </NavLink>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
};
