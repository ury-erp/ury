import React, { useState } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../store/useAuth';
import { reportsRegistry, groupReports } from '../../pages/Reports/reportsRegistry';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Grid3X3,
  Map,
  SlidersHorizontal,
  Users,
  Building2,
  ChevronDown,
  FileText,
  Settings,
  Store,
  BarChart3,
  ArrowLeft,
  Grid
} from 'lucide-react';

interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Branch', path: '/branch', icon: Building2 },
  { label: 'Room', path: '/room', icon: Map },
  { label: 'Table', path: '/table', icon: Grid3X3 },
  { label: 'Menu', path: '/menu', icon: UtensilsCrossed },
];

const SETTINGS_ITEMS: NavItem[] = [
  { label: 'POS Profile', path: '/pos-profile', icon: SlidersHorizontal },
  { label: 'User', path: '/user', icon: Users },
  { label: 'Aggregators', path: '/aggregator', icon: Store },
  { label: 'URY Report Settings', path: '/report-settings', icon: FileText },
  { label: 'Production Unit', path: '/production-unit', icon: Grid }
];

const reportLinkClass = ({ isActive }: { isActive: boolean }) =>
  `flex items-center space-x-2.5 px-3 py-2 rounded-md text-[13px] font-medium transition-all ${
    isActive
      ? 'bg-white text-gray-900 shadow-sm font-semibold relative'
      : 'text-gray-700 hover:bg-white/60 hover:text-gray-900'
  }`;

const reportGroups = groupReports(reportsRegistry);
const reportGroupEntries = Object.entries(reportGroups);

const ReportsPanel: React.FC = () => (
  <div className="flex-1 overflow-y-auto p-4">
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
      <Link
        to="/dashboard"
        className="flex items-center space-x-2 px-2 py-1.5 -ml-2 rounded-md text-xs font-medium text-gray-500 hover:bg-gray-200/60 hover:text-gray-700 transition-colors mb-3"
      >
        <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
        <span>Back to Dashboard</span>
      </Link>
      <div className="flex items-center space-x-2 px-1 mb-4">
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-blue-50 shrink-0">
          <BarChart3 className="w-4 h-4 text-blue-600" />
        </div>
        <h2 className="text-sm font-semibold text-gray-900">Reports</h2>
      </div>

      <div className="space-y-4">
        {reportGroupEntries.map(([group, reports], index) => (
          <div key={group} className={index > 0 ? 'pt-3 border-t border-gray-200' : undefined}>
            <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-2">
              {group}
            </h3>
            <div className="space-y-1">
              {reports.map((report) => {
                const Icon = report.icon;
                return (
                  <NavLink key={report.id} to={`/reports/${report.path}`} className={reportLinkClass}>
                    <Icon className="w-4 h-4 shrink-0 text-gray-500" />
                    <span>{report.label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const MainPanel: React.FC<{ isManager: boolean }> = ({ isManager }) => {
  const location = useLocation();
  const isAdvancedPath = SETTINGS_ITEMS.some((item) => location.pathname.startsWith(item.path));
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(isAdvancedPath);

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h2 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-3 px-1">
          Navigation
        </h2>

        <div className="space-y-1">
          {isManager && (
            <>
              <NavLink
                to="/reports"
                className={({ isActive }) =>
                  `w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative rounded-md ${
                    isActive
                      ? 'bg-white text-gray-900 shadow-sm font-semibold'
                      : 'text-gray-700 hover:bg-white/60 hover:text-gray-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-e-full" />
                    )}
                    <div className="flex items-center gap-3 ms-1">
                      <BarChart3 className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span>Reports</span>
                    </div>
                  </>
                )}
              </NavLink>
              <div className="h-px bg-gray-200 my-2 mx-1" />
            </>
          )}

          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  `w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative rounded-md ${
                    isActive
                      ? 'bg-white text-gray-900 shadow-sm font-semibold'
                      : 'text-gray-700 hover:bg-white/60 hover:text-gray-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <div className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-6 bg-blue-600 rounded-e-full" />
                    )}
                    <div className="flex items-center gap-3 ms-1">
                      <Icon className="w-4 h-4 text-gray-500 flex-shrink-0" />
                      <span>{item.label}</span>
                    </div>
                  </>
                )}
              </NavLink>
            );
          })}

          <div className="pt-2">
            <button
              onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
              className={`w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium transition-all duration-200 group relative rounded-md ${
                isAdvancedPath
                  ? 'bg-white text-gray-900 shadow-sm font-semibold'
                  : 'text-gray-700 hover:bg-white/60 hover:text-gray-900'
              }`}
            >
              <div className="flex items-center gap-3 ms-1">
                <Settings className="w-4 h-4 text-gray-500 flex-shrink-0" />
                <span>Advanced Settings</span>
              </div>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  isAdvancedOpen ? 'rotate-180 text-blue-600' : 'text-gray-400'
                }`}
              />
            </button>

            {isAdvancedOpen && (
              <div className="mt-1 pl-4 space-y-1">
                {SETTINGS_ITEMS.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      className={({ isActive }) =>
                        `w-full flex items-center justify-between px-3 py-2 text-xs font-medium transition-all duration-200 group relative rounded-md ${
                          isActive
                            ? 'bg-white text-gray-900 shadow-sm font-semibold'
                            : 'text-gray-700 hover:bg-white/60 hover:text-gray-900'
                        }`
                      }
                    >
                      {({ isActive }) => (
                        <>
                          {isActive && (
                            <div className="absolute start-0 top-1/2 -translate-y-1/2 w-1 h-4 bg-blue-600 rounded-e-full" />
                          )}
                          <div className="flex items-center gap-2.5 ms-1">
                            <Icon className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
                            <span>{item.label}</span>
                          </div>
                        </>
                      )}
                    </NavLink>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { isManager } = useAuth();
  const inReports = location.pathname.startsWith('/reports');

  return (
    <aside className="w-64 bg-white border-e border-gray-200 h-full flex flex-col shrink-0 font-inter">
      {inReports ? <ReportsPanel /> : <MainPanel isManager={isManager} />}
    </aside>
  );
};

export default Sidebar;
