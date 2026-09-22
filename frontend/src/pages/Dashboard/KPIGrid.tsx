import React, { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { buttonVariants, KpiStrip, Spinner } from '@ury/ui';
import { DashboardSummary } from '../../services/dashboard';
import { buildDashboardStatsKpiItems, summaryToDashboardStats } from '../../lib/dashboardStatsKpis';

interface LinkCardProps {
  label: string;
  subtitle: string;
  href: string;
}

const LinkCard: React.FC<LinkCardProps> = ({ label, subtitle, href }) => {
  return (
    <a
      href={href}
      className={buttonVariants({ variant: 'chrome', size: 'sm', className: 'w-full justify-start gap-2 font-medium' })}
      title={subtitle}
    >
      <ExternalLink className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
      <span>{label}</span>
      <span className="text-muted-foreground font-normal truncate">— {subtitle}</span>
    </a>
  );
};

interface KPIGridProps {
  summary: DashboardSummary | null;
  loading: boolean;
}

export const KPIGrid: React.FC<KPIGridProps> = ({ summary, loading }) => {
  const kpiItems = useMemo(
    () => buildDashboardStatsKpiItems(summaryToDashboardStats(summary), { loading }),
    [summary, loading],
  );

  return (
    <section className="w-full space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:w-fit">
        <LinkCard label="POS" subtitle="Billing & order taking" href="/pos" />
        <LinkCard label="Mosaic" subtitle="Kitchen Display System" href="/mosaic" />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-8">
          <Spinner className="w-6 h-6 text-primary" />
        </div>
      ) : (
        <KpiStrip items={kpiItems} />
      )}
    </section>
  );
};

export default KPIGrid;
