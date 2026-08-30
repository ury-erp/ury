import React from 'react';
import { useLocation } from 'react-router-dom';
import { NAV_GROUPS, SETUP_ITEMS } from './Sidebar';
import { reportsRegistry } from '../../pages/Reports/reportsRegistry';

/**
 * Route -> {group, label} lookup built directly from the Sidebar's own nav
 * structure so the breadcrumb can never drift out of sync with the rail.
 * `SETUP_ITEMS` isn't a `NAV_GROUPS` entry (it lives in its own collapsed
 * disclosure pinned to the bottom of the rail), but every item in it is a
 * setup-style screen, so it's grouped under "Setup" here.
 */
const ROUTE_MAP: Record<string, { group: string; label: string }> = {};

NAV_GROUPS.forEach((group) => {
  group.items.forEach((item) => {
    ROUTE_MAP[item.path] = { group: group.label, label: item.label };
  });
});

SETUP_ITEMS.forEach((item) => {
  ROUTE_MAP[item.path] = { group: 'Setup', label: item.label };
});

const REPORTS_GROUP_LABEL = 'Reports';

function resolveBreadcrumb(pathname: string): { group: string; label: string } | null {
  if (pathname.startsWith('/reports')) {
    const reportPath = pathname.replace(/^\/reports\/?/, '');
    if (!reportPath) {
      return { group: REPORTS_GROUP_LABEL, label: 'Home' };
    }
    const entry = reportsRegistry.find((r) => r.path === reportPath);
    return { group: REPORTS_GROUP_LABEL, label: entry?.label ?? reportPath };
  }

  const match = Object.entries(ROUTE_MAP).find(
    ([path]) => pathname === path || pathname.startsWith(`${path}/`)
  );
  return match ? match[1] : null;
}

export const Breadcrumbs: React.FC = () => {
  const location = useLocation();
  const crumb = resolveBreadcrumb(location.pathname);

  if (!crumb) return null;

  return (
    <div className="flex items-center gap-1 text-[12.5px] leading-none min-w-0">
      <span className="text-muted-foreground truncate">{crumb.group}</span>
      <span className="text-muted-foreground">/</span>
      <span className="font-semibold text-foreground truncate">{crumb.label}</span>
    </div>
  );
};

export default Breadcrumbs;
