import React, { useState } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../store/useAuth';
import { reportsRegistry, groupReports } from '../../pages/Reports/reportsRegistry';
import {
  LayoutDashboard,
  Utensils,
  Grid,
  Settings2,
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
  TrendingUp,
  BarChart3,
  ArrowLeft
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Today',
    items: [{ label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard }]
  },
  {
    label: 'Plan',
    items: [{ label: 'Sales Plan', path: '/sales-plan', icon: ClipboardList }]
  },
  {
    label: 'Close',
    items: [
      { label: 'Department Stock', path: '/department-stock', icon: Warehouse },
      { label: 'Stock Reservations', path: '/stock-reservations', icon: Warehouse }
    ]
  },
  {
    label: 'Insight',
    items: [{ label: 'Profitability', path: '/department-profitability', icon: TrendingUp }]
  },
  {
    label: 'Setup',
    items: [
      { label: 'URY Menu', path: '/menu', icon: Utensils },
      { label: 'URY Table', path: '/table', icon: Grid },
      { label: 'URY Room', path: '/room', icon: Home },
      { label: 'POS Profile', path: '/pos-profile', icon: SlidersHorizontal },
      { label: 'User', path: '/user', icon: Users },
      { label: 'Branch', path: '/branch', icon: Building2 },
      { label: 'Aggregators', path: '/aggregator', icon: Store }
    ]
  }
];

const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  \`flex items-center space-x-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all \${
    isActive
      ? 'bg-[#2563eb] text-white shadow-sm font-semibold'
      : 'text-gray-600 hover:bg-blue-50 hover:text-[#2563eb]'
  }\`;

const reportLinkClass = ({ isActive }: { isActive: boolean }) =>
  \`flex items-center space-x-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all \${
    isActive
      ? 'bg-[#2563eb] text-white shadow-sm font-semibold'
      : 'text-gray-600 hover:bg-blue-50 hover:text-[#2563eb]'
  }\`;

const reportGroups = groupReports(reportsRegistry);
const reportGroupEntries = Object.entries(reportGroups);

const ReportsPanel: React.FC = () => (
  <div className="flex-1 overflow-y-auto">
    <div className="p-4 pb-2 border-b border-gray-100">
      <Link
        to="/dashboard"
        className="flex items-center space-x-2 px-2 py-1.5 -ml-2 rounded-md text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
        <span>Back to Dashboard</span>
      </Link>
      <div className="flex items-center space-x-2 px-1">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-50 shrink-0">
          <BarChart3 className="w-4 h-4 text-[#2563eb]" />
        </div>
        <h2 className="text-sm font-semibold text-gray-900">Reports</h2>
      </div>
    </div>
    <div className="p-4 space-y-5">
      {reportGroupEntries.map(([group, reports], index) => (
        <div key={group} className={index > 0 ? 'pt-4 border-t border-gray-100' : undefined}>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-3">
            {group}
          </h3>
          <div className="space-y-0.5">
            {reports.map((report) => {
              const Icon = report.icon;
              return (
                <NavLink key={report.id} to={\`/reports/\${report.path}\`} className={reportLinkClass}>
                  <Icon className="w-4 h-4 shrink-0" />
                  <span>{report.label}</span>
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const MainPanel: React.FC<{ isManager: boolean }> = ({ isManager }) => {
  const location = useLocation();
  const isAdvancedPath = location.pathname.startsWith('/report-settings') || location.pathname.startsWith('/production-unit') || location.pathname.startsWith('/production-department') || location.pathname.startsWith('/item-production-config');
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(isAdvancedPath);

  return (
    <div className="p-4 flex-1 space-y-1">
      {isManager && (
        <>
          <NavLink to="/reports" className={navLinkClass}>
            <BarChart3 className="w-5 h-5 shrink-0" />
            <span>Reports</span>
          </NavLink>
          <div className="!mt-3 !mb-2 border-t border-gray-100" />
        </>
      )}
      {NAV_GROUPS.map((group) => (
        <div key={group.label}>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-3 pt-3 first:pt-0">
            {group.label}
          </h3>
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink key={item.path} to={item.path} className={navLinkClass}>
                <Icon className="w-5 h-5 shrink-0" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </div>
      ))}

      <div className="pt-2">
        <button
          onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
          className={\`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors \${
            isAdvancedPath
              ? 'text-[#2563eb] font-semibold bg-blue-50'
              : 'text-gray-600 hover:bg-blue-50 hover:text-[#2563eb]'
          }\`}
        >
          <div className="flex items-center space-x-3">
            <Settings className="w-5 h-5 shrink-0" />
            <span>Advanced Settings</span>
          </div>
          <ChevronDown
            className={\`w-4 h-4 transition-transform duration-200 \${
              isAdvancedOpen ? 'rotate-180 text-[#2563eb]' : 'text-gray-400'
            }\`}
          />
        </button>

        {isAdvancedOpen && (
          <div className="mt-1 pl-4 space-y-1">
            <NavLink
              to="/report-settings"
              className={({ isActive }) =>
                \`flex items-center space-x-3 px-3.5 py-2 rounded-lg text-xs font-medium transition-all \${
                  isActive
                    ? 'bg-primary text-white shadow-sm font-semibold'
                    : 'text-gray-600 hover:bg-blue-50 hover:text-primary'
                }\`
              }
            >
              <FileText className="w-4 h-4 shrink-0" />
              <span>URY Report Settings</span>
            </NavLink>
            <NavLink
              to="/production-unit"
              className={({ isActive }) =>
                \`flex items-center space-x-3 px-3.5 py-2 rounded-lg text-xs font-medium transition-all \${
                  isActive
                    ? 'bg-[#2563eb] text-white shadow-sm font-semibold'
                    : 'text-gray-600 hover:bg-blue-50 hover:text-[#2563eb]'
                }\`
              }
            >
              <Grid className="w-4 h-4 shrink-0" />
              <span>Production Unit</span>
            </NavLink>
            <NavLink
              to="/production-department"
              className={({ isActive }) =>
                \`flex items-center space-x-3 px-3.5 py-2 rounded-lg text-xs font-medium transition-all \${
                  isActive
                    ? 'bg-[#2563eb] text-white shadow-sm font-semibold'
                    : 'text-gray-600 hover:bg-blue-50 hover:text-[#2563eb]'
                }\`
              }
            >
              <Building2 className="w-4 h-4 shrink-0" />
              <span>Production Department</span>
            </NavLink>
            <NavLink
              to="/item-production-config"
              className={({ isActive }) =>
                \`flex items-center space-x-3 px-3.5 py-2 rounded-lg text-xs font-medium transition-all \${
                  isActive
                    ? 'bg-[#2563eb] text-white shadow-sm font-semibold'
                    : 'text-gray-600 hover:bg-blue-50 hover:text-[#2563eb]'
                }\`
              }
            >
              <Settings2 className="w-4 h-4 shrink-0" />
              <span>Item Production Config</span>
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
