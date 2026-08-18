import React, { useState } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../store/useAuth';
import { reportsRegistry, groupReports } from '../../pages/Reports/reportsRegistry';
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
  BarChart3,
  ArrowLeft
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
  { label: 'Branch', path: '/branch', icon: Building2 }
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
    isActive
      ? 'bg-[#2563eb] text-white shadow-sm font-semibold'
      : 'text-gray-600 hover:bg-blue-50 hover:text-[#2563eb]'
  }`;

const reportGroups = groupReports(reportsRegistry);

const ReportsPanel: React.FC = () => (
  <div className="p-4 flex-1 space-y-6 overflow-y-auto">
    <Link
      to="/dashboard"
      className="flex items-center space-x-2 px-3.5 py-2 rounded-lg text-sm font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors -mt-1 mb-2"
    >
      <ArrowLeft className="w-4 h-4 shrink-0" />
      <span>Back</span>
    </Link>
    <div className="flex items-center space-x-2 px-3.5 mb-1">
      <BarChart3 className="w-5 h-5 text-[#2563eb] shrink-0" />
      <h2 className="text-sm font-semibold text-gray-900">Reports</h2>
    </div>
    {Object.entries(reportGroups).map(([group, reports]) => (
      <div key={group}>
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-3.5">
          {group}
        </h3>
        <div className="space-y-0.5">
          {reports.map((report) => (
            <NavLink key={report.id} to={`/reports/${report.path}`} className={navLinkClass}>
              <span className="pl-8 text-sm">{report.label}</span>
            </NavLink>
          ))}
        </div>
      </div>
    ))}
  </div>
);

const MainPanel: React.FC<{ isManager: boolean }> = ({ isManager }) => {
  const location = useLocation();
  const isAdvancedPath = location.pathname.startsWith('/report-settings');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(isAdvancedPath);

  return (
    <div className="p-4 flex-1 space-y-1">
      {isManager && (
        <NavLink to="/reports" className={navLinkClass}>
          <BarChart3 className="w-5 h-5 shrink-0" />
          <span>Reports</span>
        </NavLink>
      )}
      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink key={item.path} to={item.path} className={navLinkClass}>
            <Icon className="w-5 h-5 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        );
      })}

      <div className="pt-2">
        <button
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
          className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
            isAdvancedPath
              ? 'text-[#2563eb] font-semibold bg-blue-50'
              : 'text-gray-600 hover:bg-blue-50 hover:text-[#2563eb]'
          }`}
        >
          <div className="flex items-center space-x-3">
            <Settings className="w-5 h-5 shrink-0" />
            <span>Advanced Settings</span>
          </div>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ${
              isAdvancedOpen ? 'rotate-180 text-[#2563eb]' : 'text-gray-400'
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
                    ? 'bg-[#2563eb] text-white shadow-sm font-semibold'
                    : 'text-gray-600 hover:bg-blue-50 hover:text-[#2563eb]'
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
                    ? 'bg-[#2563eb] text-white shadow-sm font-semibold'
                    : 'text-gray-600 hover:bg-blue-50 hover:text-[#2563eb]'
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
  );
};

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { isManager } = useAuth();
  const inReports = location.pathname.startsWith('/reports');

  return (
    <aside className="w-64 bg-white border-r border-gray-200 sticky top-16 h-[calc(100vh-4rem)] flex flex-col shrink-0 overflow-y-auto font-inter">
      {inReports ? <ReportsPanel /> : <MainPanel isManager={isManager} />}
    </aside>
  );
};
