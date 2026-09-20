import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useAuth } from '../../store/useAuth';
import { reportsRegistry, groupReports, reportLabel, reportGroupLabel } from '../../pages/Reports/reportsRegistry';
import { t } from '../../i18n';
import { SidebarContainer, SidebarActiveIndicator, sidebarItemVariants, cn } from '@ury/ui';
import {
  LayoutDashboard,
  UtensilsCrossed,
  Grid3X3,
  Globe,
  Map,
  Building2,
  SlidersHorizontal,
  Users,
  ChevronDown,
  FileText,
  Settings,
  Store,
  BarChart3,
  Grid
, CalendarClock, Hourglass } from 'lucide-react';

interface NavItem {
  /** i18n key; resolved at render time, not module scope. */
  labelKey: string;
  /** English fallback shown if the key is missing from a locale. */
  label: string;
  path: string;
  icon: React.ElementType;
}

/** Resolve a nav label, falling back to English when untranslated. */
const navLabel = (item: NavItem): string => {
  const translated = t(item.labelKey);
  return translated === item.labelKey ? item.label : translated;
};

const NAV_ITEMS: NavItem[] = [
  { labelKey: 'nav.dashboard', label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { labelKey: 'nav.menu', label: 'Menu', path: '/menu', icon: UtensilsCrossed },
  { labelKey: 'nav.table', label: 'Table', path: '/table', icon: Grid3X3 },
  { labelKey: 'nav.reservations', label: 'Reservations', path: '/reservations', icon: CalendarClock },
  { labelKey: 'nav.waitlist', label: 'Waitlist', path: '/waitlist', icon: Hourglass },
  { labelKey: 'nav.room', label: 'Room', path: '/room', icon: Map },
  { labelKey: 'nav.branch', label: 'Branch', path: '/branch', icon: Building2 },
];

const SETTINGS_ITEMS: NavItem[] = [
  { labelKey: 'nav.pos_profile', label: 'POS Profile', path: '/pos-profile', icon: SlidersHorizontal },
  { labelKey: 'nav.user', label: 'User', path: '/user', icon: Users },
  { labelKey: 'nav.aggregators', label: 'Aggregators', path: '/aggregator', icon: Store },
  { labelKey: 'nav.daily_pnl_settings', label: 'Daily P&L Settings', path: '/report-settings', icon: FileText },
  { labelKey: 'nav.production_unit', label: 'Production Unit', path: '/production-unit', icon: Grid }
];

const reportGroups = groupReports(reportsRegistry);
const reportGroupEntries = Object.entries(reportGroups);

const ReportsPanel: React.FC = () => (
  <nav className="border-t border-[#eadfce] px-3 py-4">
    <p className="mb-3 px-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
      {t('nav.reports')}
    </p>

    <div className="space-y-4">
      {reportGroupEntries.map(([group, reports], index) => (
        <div key={group} className={index > 0 ? 'pt-3 border-t border-gray-200' : undefined}>
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-2">
            {reportGroupLabel(group)}
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
                        <span>{reportLabel(report)}</span>
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
    <nav className="shrink-0 px-3 py-4 space-y-1">
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
                <span>{t('nav.reports')}</span>
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
                  <span>{navLabel(item)}</span>
                </div>
              </>
            )}
          </NavLink>
        );
      })}

      {isManager && (
        <NavLink
          to="/website"
          className={({ isActive }) => sidebarItemVariants({ active: isActive })}
        >
          {({ isActive }) => (
            <>
              {isActive && <SidebarActiveIndicator />}
              <div className="flex items-center gap-3 ms-1">
                <Globe className="w-4 h-4 text-gray-500 shrink-0" />
                <span>{t('nav.restaurant_website')}</span>
              </div>
            </>
          )}
        </NavLink>
      )}

      <div>
        <button
          type="button"
          aria-expanded={isSettingsOpen}
          onClick={() => setIsSettingsOpen(!isSettingsOpen)}
          className={sidebarItemVariants({ active: isSettingsPath })}
        >
          {isSettingsPath && <SidebarActiveIndicator />}
          <div className="flex items-center gap-3 ms-1">
            <Settings className="w-4 h-4 text-gray-500 shrink-0" />
            <span>{t('nav.settings')}</span>
          </div>
          <ChevronDown
            className={cn(
              "w-4 h-4 transition-transform duration-200",
              isSettingsOpen ? "rotate-180 text-blue-600" : "text-gray-400"
            )}
          />
        </button>

        {isSettingsOpen && (
          <div className="mt-1 ps-4 space-y-1">
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
                        <span>{navLabel(item)}</span>
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

  // Opening a report used to replace the whole navigation tree with a list of
  // reports, so the rest of the app vanished and the only way back was a
  // "Back" link at the top of the list. The global nav now stays put and the
  // report list is appended under it, which keeps a report one click from the
  // work it was opened to explain (UX-23).
  return (
    <SidebarContainer>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <MainPanel isManager={isManager} />
        {inReports && <ReportsPanel />}
      </div>
    </SidebarContainer>
  );
};

export default Sidebar;
