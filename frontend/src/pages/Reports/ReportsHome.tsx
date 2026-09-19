import { Link } from 'react-router-dom';
import { reportsRegistry, groupReports, reportLabel, reportGroupLabel } from './reportsRegistry';
import { t } from '../../i18n';

/**
 * The reports landing page.
 *
 * This used to redirect straight to whichever report happened to be first in
 * the registry, so asking for "Reports" dropped the user into an arbitrary
 * one with no sense of what else existed — and adding a report at the top of
 * the list silently changed where everyone landed (UX-23).
 *
 * A hub instead: the groups, and what is in them.
 */
export function ReportsHome() {
  const groups = Object.entries(groupReports(reportsRegistry));

  if (groups.length === 0) {
    return (
      <div className="py-16 text-center text-muted-foreground">
        {t('reports.none_available')}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-bold text-foreground">{t('nav.reports')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{t('reports.hub_subtitle')}</p>
      </header>

      {groups.map(([group, reports]) => (
        <section key={group} className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {reportGroupLabel(group)}
          </h2>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {reports.map((report) => {
              const Icon = report.icon;
              return (
                <Link
                  key={report.id}
                  to={`/reports/${report.path}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 text-sm font-medium text-foreground">
                    {reportLabel(report)}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

export default ReportsHome;
