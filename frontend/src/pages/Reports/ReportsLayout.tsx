import { Outlet } from 'react-router-dom';

/**
 * Deliberately minimal — the Reports section's navigation lives inside the
 * single shared Sidebar (see components/layout/Sidebar.tsx), which swaps to
 * a "Reports" panel with a back button when the route is under /reports.
 * This component must never render its own <aside>: DashboardLayout already
 * provides the one sidebar and the one scrollable <main>, and a second
 * nested sidebar/scroll-container here is what caused the double-sidebar
 * and content-overflow bugs.
 */
export function ReportsLayout() {
  return <Outlet />;
}
