import React, { useState, useEffect } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../../store/useAuth';
import { reportsRegistry, groupReports } from '../../pages/Reports/reportsRegistry';
import { SidebarContainer, SidebarActiveIndicator, sidebarItemVariants, cn } from '@ury/ui';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Grid3X3,
  Map,
  Building2,
  SlidersHorizontal,
  Users,
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
  { label: 'Menu', path: '/menu', icon: UtensilsCrossed },
  { label: 'Table', path: '/table', icon: Grid3X3 },
  { label: 'Room', path: '/room', icon: Map },
  { label: 'Branch', path: '/branch', icon: Building2 },
];

const SETTINGS_ITEMS: NavItem[] = [
  { label: 'POS Profile', path: '/pos-profile', icon: SlidersHorizontal },
  { label: 'User', path: '/user', icon: Users },
  { label: 'Aggregators', path: '/aggregator', icon: Store },
  { label: 'Daily P&L Settings', path: '/report-settings', icon: FileText },
  { label: 'Production Unit', path: '/production-unit', icon: Grid }
];

const reportGroups = groupReports(reportsRegistry);
const reportGroupEntries = Object.entries(reportGroups);

const ReportsPanel: React.FC = () => (
  <nav className="flex-1 px-3 py-4 overflow-y-auto">
    <Link
      to="/dashboard"
      className={cn(sidebarItemVariants({ active: false }), 'mb-4')}
    >
      <div className="flex items-center gap-3 ms-1">
        <ArrowLeft className="w-4 h-4 text-gray-500 shrink-0" />
        <span>Back</span>
      </div>
    </Link>

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
                <NavLink
                  key={report.id}
                  to={`/reports/${report.path}`}
                  className={({ isActive }) => sidebarItemVariants({ active: isActive })}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <SidebarActiveIndicator />}
                      <div className="flex items-center gap-3 ms-1">
                        <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                        <span>{report.label}</span>
                      </div>
                    </>
                  )}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </nav>
);

const MainPanel: React.FC<{ isManager: boolean }> = ({ isManager }) => {
  const location = useLocation();
  const isSettingsPath = SETTINGS_ITEMS.some((item) => location.pathname.startsWith(item.path));
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(isSettingsPath);

  useEffect(() => {
    if (isSettingsPath) {
      setIsSettingsOpen(true);
    }
  }, [isSettingsPath]);

  return (
    <nav className="flex-1 px-3 py-4 overflow-y-auto space-y-1">
      {isManager && (
        <NavLink
          to="/reports"
          className={({ isActive }) => sidebarItemVariants({ active: isActive })}
        >
          {({ isActive }) => (
            <>
              {isActive && <SidebarActiveIndicator />}
              <div className="flex items-center gap-3 ms-1">
                <BarChart3 className="w-4 h-4 text-gray-500 shrink-0" />
                <span>Reports</span>
              </div>
            </>
          )}
        </NavLink>
      )}

      {NAV_ITEMS.map((item) => {
        const Icon = item.icon;
        return (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) => sidebarItemVariants({ active: isActive })}
          >
            {({ isActive }) => (
              <>
                {isActive && <SidebarActiveIndicator />}
                <div className="flex items-center gap-3 ms-1">
                  <Icon className="w-4 h-4 text-gray-500 shrink-0" />
                  <span>{item.label}</span>
                </div>
              </>
            )}
          </NavLink>
        );
      })}

      <div>
        <button
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className={sidebarItemVariants({ active: isSettingsPath })}
        >
          {isSettingsPath && <SidebarActiveIndicator />}
          <div className="flex items-center gap-3 ms-1">
            <Settings className="w-4 h-4 text-gray-500 shrink-0" />
            <span>Settings</span>
          </div>
          <ChevronDown
            className={cn(
              "w-4 h-4 transition-transform duration-200",
              isSettingsOpen ? "rotate-180 text-blue-600" : "text-gray-400"
            )}
          />
        </button>

        {isSettingsOpen && (
          <div className="mt-1 pl-4 space-y-1">
            {SETTINGS_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    cn(sidebarItemVariants({ active: isActive }), 'py-2 text-xs')
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <SidebarActiveIndicator />}
                      <div className="flex items-center gap-2.5 ms-1">
                        <Icon className="w-3.5 h-3.5 text-gray-500 shrink-0" />
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
    </nav>
  );
};

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { isManager } = useAuth();
  const inReports = location.pathname.startsWith('/reports');

  return (
    <SidebarContainer>
      {inReports ? <ReportsPanel /> : <MainPanel isManager={isManager} />}
    </SidebarContainer>
  );
};

export default Sidebar;
