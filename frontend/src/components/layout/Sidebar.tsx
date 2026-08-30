import React, { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Badge } from '@ury/ui';
import { useAuth } from '../../store/useAuth';
import { reportsRegistry, groupReports } from '../../pages/Reports/reportsRegistry';
import { DayStatusCard } from './DayStatusCard';
import {
  LayoutDashboard,
  Utensils,
  Table2,
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
  PanelLeftOpen,
  Bot,
  Percent
} from 'lucide-react';

const SIDEBAR_COLLAPSED_STORAGE_KEY = 'ury.sidebar.collapsed';
const SIDEBAR_GROUP_STATE_STORAGE_KEY = 'ury.sidebar.groupState';

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
 *
 * Grouping follows the rail's lifecycle order — Plan -> Operate -> Observe ->
 * Control -> (Reports, expandable) -> Setup (collapsed disclosure, pinned to
 * the bottom of the rail). This replaces the old Plan/Observe/Control/Setup +
 * separate "Advanced" list: "Advanced" had no consistent membership rule
 * (this was the user's own complaint), so every former ADVANCED_ITEMS entry
 * has been redistributed here. All four turned out to be one-time/rare
 * configuration screens, so they moved into Setup rather than a lifecycle
 * group.
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
    label: 'Operate',
    items: [
      { label: 'Service Board', path: '/dashboard', icon: LayoutDashboard },
      { label: 'Service', path: '/service', icon: ClipboardCheck }
    ]
  },
  {
    label: 'Observe',
    items: [
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
  }
];

/**
 * One-time or rare setup/configuration screens. Rendered as a single
 * collapsed disclosure row pinned to the bottom of the rail instead of
 * permanently occupying rail space (the user's complaint: "I dont see why
 * setup and one time or rare actions need to be there always visible").
 * Includes the four former ADVANCED_ITEMS entries (Report Settings,
 * Production Units, Departments, Item Config), which are all configuration.
 */
export const SETUP_ITEMS: NavItem[] = [
  { label: 'Menu', path: '/menu', icon: Utensils },
  { label: 'Tables', path: '/table', icon: Table2 },
  { label: 'Rooms', path: '/room', icon: DoorOpen },
  { label: 'POS Profile', path: '/pos-profile', icon: SlidersHorizontal },
  { label: 'Users', path: '/user', icon: Users },
  { label: 'Branches', path: '/branch', icon: Building2 },
  { label: 'Self Ordering', path: '/self-ordering-profile', icon: Smartphone },
  { label: 'Aggregators', path: '/aggregator', icon: Globe },
  { label: 'Payment Terminals', path: '/payment-terminals', icon: CreditCard },
  { label: 'Report Settings', path: '/report-settings', icon: FileCog },
  { label: 'AI Assistant', path: '/ai-settings', icon: Bot },
  { label: 'Commission', path: '/commission-settings', icon: Percent },
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
// Matches ury-app.html's `.it` / `.it.on` spec (lines 55-59). The active
// item is a WHITE CHIP RAISED OFF THE GREY RAIL -- a hairline ring plus a
// barely-there shadow -- and the accent colour is carried by the *icon*,
// not by a filled background. The previous saturated-blue filled pill was
// the single most visible reason the sidebar read as a different product
// from the mockup. See tracks/sa-ury-app-transition/DESIGN_GAP.md.
const getNavLinkClass =
  (isCollapsed: boolean) =>
  ({ isActive }: { isActive: boolean }) =>
    `flex items-center rounded-md text-[12.5px] transition-all ${
      isCollapsed ? 'justify-center px-2 py-[5.5px]' : 'space-x-2 px-2 py-[5.5px]'
    } ${
      isActive
        ? 'bg-card text-foreground font-[550] shadow-[0_0_0_1px_hsl(var(--hair)),0_1px_2px_rgba(0,0,0,0.03)] [&_svg]:text-primary [&_svg]:opacity-100'
        : 'text-muted-foreground font-medium hover:bg-hair/60 hover:text-foreground [&_svg]:opacity-60'
    }`;

const reportGroups = groupReports(reportsRegistry);
const reportGroupEntries = Object.entries(reportGroups);
const REPORTS_PATH_PREFIX = '/reports';

/** Every collapse/expand key this rail tracks, persisted together as one JSON blob. */
type GroupKey = 'Plan' | 'Operate' | 'Observe' | 'Control' | 'Reports' | 'Setup';

const DEFAULT_GROUP_STATE: Record<GroupKey, boolean> = {
  Plan: true,
  Operate: true,
  Observe: true,
  Control: true,
  Reports: false,
  Setup: false
};

function loadGroupState(): Record<GroupKey, boolean> {
  try {
    const raw = localStorage.getItem(SIDEBAR_GROUP_STATE_STORAGE_KEY);
    if (!raw) return DEFAULT_GROUP_STATE;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_GROUP_STATE, ...parsed };
  } catch {
    return DEFAULT_GROUP_STATE;
  }
}

function saveGroupState(state: Record<GroupKey, boolean>): void {
  try {
    localStorage.setItem(SIDEBAR_GROUP_STATE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // localStorage unavailable (private mode, etc.) — expand/collapse just won't persist.
  }
}

/** Disclosure header row shared by the lifecycle groups, Reports and Setup. */
const GroupHeaderButton: React.FC<{
  label: string;
  isOpen: boolean;
  isActive: boolean;
  onToggle: () => void;
  icon?: React.ElementType;
}> = ({ label, isOpen, isActive, onToggle, icon: Icon }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-expanded={isOpen}
    className={`w-full flex items-center justify-between rounded-md text-[10.5px] font-medium uppercase tracking-[0.04em] transition-colors px-2 py-[5px] ${
      isActive ? 'text-foreground' : 'text-text-tertiary hover:text-foreground'
    }`}
  >
    <span className="flex items-center space-x-1.5">
      {Icon && <Icon className="w-3.5 h-3.5 shrink-0" />}
      <span>{label}</span>
    </span>
    <ChevronDown
      className={`w-3.5 h-3.5 transition-transform duration-200 ${isOpen ? 'rotate-180 text-primary' : ''}`}
    />
  </button>
);

const MainPanel: React.FC<{ isManager: boolean; isCollapsed: boolean }> = ({
  isManager,
  isCollapsed
}) => {
  const location = useLocation();
  const linkClass = getNavLinkClass(isCollapsed);

  const isSetupPath = SETUP_ITEMS.some((item) => location.pathname.startsWith(item.path));
  const isReportsPath = location.pathname.startsWith(REPORTS_PATH_PREFIX);

  const [groupState, setGroupState] = useState<Record<GroupKey, boolean>>(() => {
    const stored = loadGroupState();
    // Deep-link handling: if the user lands directly on a Setup or Reports
    // route, make sure that section is open even if it was previously
    // collapsed, so the active link is visible instead of hidden.
    return {
      ...stored,
      Setup: stored.Setup || isSetupPath,
      Reports: stored.Reports || isReportsPath
    };
  });

  useEffect(() => {
    saveGroupState(groupState);
  }, [groupState]);

  const toggleGroup = (key: GroupKey) => {
    setGroupState((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  // The four lifecycle groups (Plan/Operate/Observe/Control) hide their
  // header when the rail is collapsed, so without an override their items
  // would become unreachable — force them open. Reports and Setup keep
  // their own disclosure header (rendered as a toggle button) even when
  // collapsed, so `groupState` stays authoritative for them: collapsing the
  // rail must not force-expand ~30 extra icon rows into a flat column.
  const LIFECYCLE_GROUP_KEYS: GroupKey[] = ['Plan', 'Operate', 'Observe', 'Control'];
  const isGroupOpen = (key: GroupKey) =>
    (isCollapsed && LIFECYCLE_GROUP_KEYS.includes(key)) || groupState[key];

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      <DayStatusCard isCollapsed={isCollapsed} />
      <div className={`pb-2 flex-1 space-y-0.5 ${isCollapsed ? 'px-2' : 'px-4'}`}>
        {NAV_GROUPS.map((group) => {
          const key = group.label as GroupKey;
          const isActive = group.items.some((item) => location.pathname.startsWith(item.path));
          const isOpen = isGroupOpen(key);
          return (
            <div key={group.label} className="space-y-0.5 pt-3 first:pt-0">
              {!isCollapsed && (
                <GroupHeaderButton
                  label={group.label}
                  isOpen={isOpen}
                  isActive={isActive}
                  onToggle={() => toggleGroup(key)}
                />
              )}
              {isOpen &&
                group.items.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.path}
                      to={item.path}
                      title={isCollapsed ? item.label : undefined}
                      aria-label={isCollapsed ? item.label : undefined}
                      className={linkClass}
                    >
                      <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
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
          );
        })}

        {isManager && (
          <div className="pt-3">
            {!isCollapsed ? (
              <GroupHeaderButton
                label="Reports"
                isOpen={isGroupOpen('Reports')}
                isActive={isReportsPath}
                onToggle={() => toggleGroup('Reports')}
                icon={BarChart3}
              />
            ) : (
              <button
                type="button"
                onClick={() => toggleGroup('Reports')}
                aria-expanded={isGroupOpen('Reports')}
                aria-label="Reports"
                title="Reports"
                className={linkClass({ isActive: isReportsPath })}
              >
                <BarChart3 className="w-4 h-4 shrink-0" aria-hidden="true" />
              </button>
            )}

            {isGroupOpen('Reports') && (
              <div className={isCollapsed ? 'mt-1 space-y-2' : 'mt-1 pl-2 space-y-2'}>
                {reportGroupEntries.map(([reportGroup, reports]) => (
                  <div key={reportGroup}>
                    {!isCollapsed && (
                      <h4 className="text-[9.5px] font-medium uppercase tracking-[0.04em] text-text-tertiary px-2 pb-[3px]">
                        {reportGroup}
                      </h4>
                    )}
                    <div className="space-y-0.5">
                      {reports.map((report) => {
                        const Icon = report.icon;
                        return (
                          <NavLink
                            key={report.id}
                            to={`/reports/${report.path}`}
                            title={isCollapsed ? report.label : undefined}
                            aria-label={isCollapsed ? report.label : undefined}
                            className={linkClass}
                          >
                            <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                            {!isCollapsed && <span>{report.label}</span>}
                          </NavLink>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className={`shrink-0 pt-2 pb-4 border-t border-hair mt-auto ${isCollapsed ? 'px-2' : 'px-4'}`}>
        {!isCollapsed ? (
          <GroupHeaderButton
            label="Setup"
            isOpen={isGroupOpen('Setup')}
            isActive={isSetupPath}
            onToggle={() => toggleGroup('Setup')}
            icon={Settings}
          />
        ) : (
          <button
            type="button"
            onClick={() => toggleGroup('Setup')}
            aria-expanded={isGroupOpen('Setup')}
            aria-label="Setup"
            title="Setup"
            className={linkClass({ isActive: isSetupPath })}
          >
            <Settings className="w-4 h-4 shrink-0" aria-hidden="true" />
          </button>
        )}

        {isGroupOpen('Setup') && (
          <div className={isCollapsed ? 'mt-1 space-y-0.5' : 'mt-1 space-y-0.5'}>
            {SETUP_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  title={isCollapsed ? item.label : undefined}
                  aria-label={isCollapsed ? item.label : undefined}
                  className={linkClass}
                >
                  <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                  {!isCollapsed && <span>{item.label}</span>}
                </NavLink>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const { isManager } = useAuth();

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
      className={`bg-rail border-r border-hair sticky top-12 h-[calc(100vh-3rem)] flex flex-col shrink-0 overflow-y-auto overflow-x-hidden transition-[width] duration-200 ${
        isCollapsed ? 'w-16' : 'w-[232px]'
      }`}
    >
      <div className={`flex items-center py-2 shrink-0 ${isCollapsed ? 'justify-center' : 'justify-end px-2'}`}>
        <button
          onClick={() => setIsCollapsed((prev) => !prev)}
          title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className="p-1.5 rounded-md text-text-tertiary hover:bg-muted hover:text-muted-foreground transition-colors"
        >
          {isCollapsed ? (
            <PanelLeftOpen className="w-4 h-4" />
          ) : (
            <PanelLeftClose className="w-4 h-4" />
          )}
        </button>
      </div>
      <MainPanel isManager={isManager} isCollapsed={isCollapsed} />
    </aside>
  );
};
