import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, Link } from 'react-router-dom';
import { Badge } from '@ury/ui';
import { useAuth } from '../../store/useAuth';
import { reportsRegistry, groupReports } from '../../pages/Reports/reportsRegistry';
import { DayStatusCard } from './DayStatusCard';
import {
  LayoutDashboard,
  Utensils,
  Armchair,
  DoorOpen,
  SlidersHorizontal,
  Users,
  Building2,
  ChevronDown,
  FileCog,
  Settings,
  Globe,
  Target,
  Boxes,
  BookmarkCheck,
  TrendingUp,
  BarChart3,
  ArrowLeft,
  AlertCircle,
  CreditCard,
  Smartphone,
  Factory,
  Network,
  Package,
  ClipboardList,
  ClipboardCheck,
  Lock,
  Trash2,
  ArrowRightLeft,
  Ban,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ury.sidebar.collapsed';

export interface NavItem {
  label: string;
  path: string;
  icon: React.ElementType;
  /** Small numeric count shown next to the label (e.g. unresolved items). Omit when there's nothing to flag. */
  badgeCount?: number;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

/**
 * Naming rule for this rail: one or two words, plural for collections, and no
 * "URY" prefix — every screen in this app is URY, so the prefix carried no
 * information and only made three Setup rows longer than the rest. The group
 * header ("Control", "Setup") already supplies the context that the old longer
 * labels were duplicating, which is why "Department Stock" / "Stock
 * Reservations" can safely become "Stock" / "Reservations".
 *
 * Icons are picked for distinct silhouettes at 16px. The old set reused `Grid`
 * twice, `Warehouse` twice, `Building2` twice and `Settings` twice, so four
 * pairs of rows were visually interchangeable.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: 'Plan',
    items: [
      { label: 'Sales Plan', path: '/sales-plan', icon: Target },
      { label: 'Requirements', path: '/requirements', icon: ClipboardList }
    ]
  },
  {
    label: 'Observe',
    items: [
      { label: 'Service Board', path: '/dashboard', icon: LayoutDashboard },
      { label: 'Service', path: '/service', icon: ClipboardCheck },
      { label: 'Profitability', path: '/department-profitability', icon: TrendingUp },
      { label: 'Close Day', path: '/close-day', icon: Lock }
    ]
  },
  {
    label: 'Control',
    items: [
      { label: 'Stock', path: '/department-stock', icon: Boxes },
      { label: 'Store Issue', path: '/store-issue', icon: ArrowRightLeft },
      { label: 'Wastage', path: '/wastage', icon: Trash2 },
      { label: 'Reservations', path: '/stock-reservations', icon: BookmarkCheck },
      { label: 'KOT Errors', path: '/kot-error-log', icon: AlertCircle },
      { label: 'Sellability', path: '/menu-routing', icon: Ban }
    ]
  },
  {
    label: 'Setup',
    items: [
      { label: 'Menu', path: '/menu', icon: Utensils },
      { label: 'Tables', path: '/table', icon: Armchair },
      { label: 'Rooms', path: '/room', icon: DoorOpen },
      { label: 'POS Profile', path: '/pos-profile', icon: SlidersHorizontal },
      { label: 'Users', path: '/user', icon: Users },
      { label: 'Branches', path: '/branch', icon: Building2 },
      { label: 'Self Ordering', path: '/self-ordering-profile', icon: Smartphone },
      { label: 'Aggregators', path: '/aggregator', icon: Globe },
      { label: 'Payment Terminals', path: '/payment-terminals', icon: CreditCard }
    ]
  }
];

export const ADVANCED_ITEMS: NavItem[] = [
  { label: 'Report Settings', path: '/report-settings', icon: FileCog },
  { label: 'Production Units', path: '/production-unit', icon: Factory },
  { label: 'Departments', path: '/production-department', icon: Network },
  { label: 'Item Config', path: '/item-production-config', icon: Package }
];

/**
 * One link treatment for the whole sidebar, lifted from the Reports rail: a
 * 16px icon, 13px medium label, `rounded-md` with a `px-3 py-2` hit area and a
 * 10px gap. The main panel previously ran 20px icons at 14px in `rounded-lg`
 * `px-3.5 py-2.5` rows, so switching into Reports visibly changed the density
 * of the same rail.
 */
const getNavLinkClass =
  (isCollapsed: boolean) =>
  ({ isActive }: { isActive: boolean }) =>
    `flex items-center rounded-md text-[13px] font-medium transition-all ${
      isCollapsed ? 'justify-center px-2 py-2' : 'space-x-2.5 px-3 py-2'
    } ${
      isActive
        ? 'bg-primary text-white shadow-sm font-semibold'
        : 'text-gray-600 hover:bg-primary-50 hover:text-primary'
    }`;


const reportGroups = groupReports(reportsRegistry);
const reportGroupEntries = Object.entries(reportGroups);

const groupHeadingClass =
  'text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2 px-3';

const ReportsPanel: React.FC<{ isCollapsed: boolean }> = ({ isCollapsed }) => (
  <div className="flex-1 overflow-y-auto">
    <div className={`p-4 pb-2 border-b border-gray-100 ${isCollapsed ? 'px-2' : ''}`}>
      <Link
        to="/dashboard"
        title="Back to Dashboard"
        className={`flex items-center rounded-md text-xs font-medium text-gray-500 hover:bg-gray-100 hover:text-gray-700 transition-colors mb-3 ${
          isCollapsed ? 'justify-center p-1.5' : 'space-x-2 px-2 py-1.5 -ml-2'
        }`}
      >
        <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
        {!isCollapsed && <span>Back to Dashboard</span>}
      </Link>
      <div className={`flex items-center px-1 ${isCollapsed ? 'justify-center' : 'space-x-2'}`}>
        <div className="flex items-center justify-center w-7 h-7 rounded-md bg-primary-50 shrink-0">
          <BarChart3 className="w-4 h-4 text-primary" />
        </div>
        {!isCollapsed && <h2 className="text-sm font-semibold text-gray-900">Reports</h2>}
      </div>
    </div>
    <div className={`p-4 space-y-5 ${isCollapsed ? 'px-2' : ''}`}>
      {reportGroupEntries.map(([group, reports], index) => (
        <div key={group} className={index > 0 ? 'pt-4 border-t border-gray-100' : undefined}>
          {!isCollapsed && <h3 className={groupHeadingClass}>{group}</h3>}
          <div className="space-y-0.5">
            {reports.map((report) => {
              const Icon = report.icon;
              return (
                <NavLink
                  key={report.id}
                  to={`/reports/${report.path}`}
                  title={isCollapsed ? report.label : undefined}
                  className={getNavLinkClass(isCollapsed)}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!isCollapsed && <span>{report.label}</span>}
                </NavLink>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const MainPanel: React.FC<{ isManager: boolean; isCollapsed: boolean }> = ({
  isManager,
  isCollapsed
}) => {
  const location = useLocation();
  const isAdvancedPath = ADVANCED_ITEMS.some((item) => location.pathname.startsWith(item.path));
  const [isAdvancedOpen, setIsAdvancedOpen] = useState<boolean>(isAdvancedPath);
  const linkClass = getNavLinkClass(isCollapsed);
  const showAdvancedItems = isCollapsed || isAdvancedOpen;

  return (
    <div className="flex-1 flex flex-col">
      <DayStatusCard isCollapsed={isCollapsed} />
      <div className={`pb-4 flex-1 space-y-0.5 ${isCollapsed ? 'px-2' : 'px-4'}`}>
      {isManager && (
        <>
          <NavLink to="/reports" title={isCollapsed ? 'Reports' : undefined} className={linkClass}>
            <BarChart3 className="w-4 h-4 shrink-0" />
            {!isCollapsed && <span>Reports</span>}
          </NavLink>
          <div className="!mt-3 !mb-2 border-t border-gray-100" />
        </>
      )}
      {NAV_GROUPS.map((group) => (
        <div key={group.label} className="space-y-0.5 pt-3 first:pt-0">
          {!isCollapsed && <h3 className={groupHeadingClass}>{group.label}</h3>}
          {group.items.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                title={isCollapsed ? item.label : undefined}
                className={linkClass}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {!isCollapsed && <span>{item.label}</span>}
                {!isCollapsed && typeof item.badgeCount === 'number' && item.badgeCount > 0 && (
                  <Badge variant="warning" size="sm" className="ml-auto h-4 px-1.5 text-[10px]">
                    {item.badgeCount}
                  </Badge>
                )}
              </NavLink>
            );
          })}
        </div>
      ))}

      <div className="pt-3">
        {!isCollapsed && (
          <button
            onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
            className={`w-full flex items-center justify-between px-3 py-2 rounded-md text-[13px] font-medium transition-colors ${
              isAdvancedPath
                ? 'text-primary font-semibold bg-primary-50'
                : 'text-gray-600 hover:bg-primary-50 hover:text-primary'
            }`}
          >
            <div className="flex items-center space-x-2.5">
              <Settings className="w-4 h-4 shrink-0" />
              <span>Advanced</span>
            </div>
            <ChevronDown
              className={`w-4 h-4 transition-transform duration-200 ${
                isAdvancedOpen ? 'rotate-180 text-primary' : 'text-gray-400'
              }`}
            />
          </button>
        )}

        {showAdvancedItems && (
          <div className={isCollapsed ? 'mt-1 space-y-0.5' : 'mt-1 pl-4 space-y-0.5'}>
            {ADVANCED_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={isCollapsed ? item.label : undefined}
                  className={linkClass}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  {!isCollapsed && <span>{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
      </div>
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const location = useLocation();
  const { isManager } = useAuth();
  const inReports = location.pathname.startsWith('/reports');

  const [isCollapsed, setIsCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(isCollapsed));
    } catch {
      // localStorage unavailable (private mode, etc.) — collapsed state just won't persist.
    }
  }, [isCollapsed]);

  return (
    <aside
      className={`bg-white border-r border-gray-200 sticky top-16 h-[calc(100vh-4rem)] flex flex-col shrink-0 overflow-y-auto overflow-x-hidden font-inter transition-[width] duration-200 ${
        isCollapsed ? 'w-16' : 'w-64'
      }`}
    >
      <div className={`flex items-center py-2 shrink-0 ${isCollapsed ? 'justify-center' : 'justify-end px-2'}`}>
        <button
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1.5 rounded-md text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>
      {inReports ? (
        <ReportsPanel isCollapsed={isCollapsed} />
      ) : (
        <MainPanel isManager={isManager} isCollapsed={isCollapsed} />
      )}
    </aside>
  );
};
