import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { reportsRegistry } from './reportsRegistry';
import { useActiveReportContext } from '../../components/chat/ActiveReportContext';

/**
 * Deliberately minimal — the Reports section's navigation lives inside the
 * single shared Sidebar (see components/layout/Sidebar.tsx), which swaps to
 * a "Reports" panel with a back button when the route is under /reports.
 * This component must never render its own <aside>: DashboardLayout already
 * provides the one sidebar and the one scrollable <main>, and a second
 * nested sidebar/scroll-container here is what caused the double-sidebar
 * and content-overflow bugs.
 *
 * It is, however, the one place that knows "what report slug is currently
 * open" for every report route (they're all mounted as children of this
 * layout's `<Outlet />`), so it's the natural place to keep the chat
 * widget's `ActiveReportContext` (PLAN.md item 4) in sync with the URL —
 * individual report pages don't need to know about the chat widget at all.
 */
export function ReportsLayout() {
  const location = useLocation();
  const { setActiveReport } = useActiveReportContext();

  useEffect(() => {
    // location.pathname is absolute (basename already stripped by the
    // router); the report slug is the last path segment, e.g.
    // "/reports/today-sales" -> "today-sales". The reports index page
    // ("/reports") has no specific slug.
    const slug = location.pathname.replace(/\/+$/, '').split('/').pop();
    const entry = slug ? reportsRegistry.find((r) => r.path === slug) : undefined;

    setActiveReport(entry ? { reportSlug: entry.id, label: entry.label } : null);

    return () => setActiveReport(null);
  }, [location.pathname, setActiveReport]);

  return <Outlet />;
}
