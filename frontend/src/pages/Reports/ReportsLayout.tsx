import { Link, Outlet } from 'react-router-dom';
import { groupReports, reportsRegistry } from './reportsRegistry';

export function ReportsLayout() {
  const grouped = groupReports(reportsRegistry);

  return (
    <div className="min-h-screen flex">
      <aside className="w-60 flex-shrink-0 bg-muted border-r overflow-y-auto">
        <div className="p-4">
          <h1 className="text-lg font-semibold mb-4 px-2">Reports</h1>
          <nav className="space-y-6">
            {Object.entries(grouped).map(([group, reports]) => (
              <div key={group}>
                <h2 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2 px-2">
                  {group}
                </h2>
                <ul className="space-y-0.5">
                  {reports.map((report) => (
                    <li key={report.id}>
                      <Link
                        to={`/reports/${report.path}`}
                        className="block rounded-md px-2 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        {report.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>
      </aside>
      <main className="flex-1 overflow-y-auto p-6">
        <Outlet />
      </main>
    </div>
  );
}
