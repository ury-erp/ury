import React from 'react';
import { formatCurrency } from '@ury/core';
import { Card, StatCard } from '@ury/ui';
import { ArrowUpRight, ChefHat, MonitorSmartphone } from 'lucide-react';
import { DashboardSummary } from '../../services/dashboard';
import { t } from '../../i18n';

interface LinkCardProps {
  icon: React.ElementType;
  label: string;
  description: string;
  href: string;
  accentClassName: string;
  iconClassName: string;
}

const LinkCard: React.FC<LinkCardProps> = ({
  icon: Icon,
  label,
  description,
  href,
  accentClassName,
  iconClassName,
}) => {
  return (
    <a
      href={href}
      className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
      aria-label={`${label} — ${description}`}
    >
      <Card
        variant="interactive"
        padding="lg"
        className={`relative h-full overflow-hidden border-0 bg-gradient-to-br ${accentClassName}`}
      >
        <div className="relative z-10 flex h-full min-h-28 flex-col justify-between gap-5">
          <div className="flex items-start justify-between gap-3">
            <span className={`inline-flex h-11 w-11 items-center justify-center rounded-xl shadow-sm ring-1 ring-black/5 ${iconClassName}`}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/70 text-foreground/60 transition-all duration-fast group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:bg-white group-hover:text-primary rtl:group-hover:-translate-x-0.5">
              <ArrowUpRight className="h-4 w-4 rtl-flip" aria-hidden="true" />
            </span>
          </div>

          <div>
            <h3 className="text-xl font-bold tracking-tight text-foreground">{label}</h3>
            <p className="mt-1 text-sm leading-5 text-muted-foreground">{description}</p>
          </div>
        </div>
      </Card>
    </a>
  );
};

interface KPIGridProps {
  summary: DashboardSummary | null;
  loading: boolean;
}

interface KPICardProps {
  title: string;
  value: string;
  loading?: boolean;
}

/**
 * Thin wrapper over the shared StatCard.
 *
 * This used to be a second implementation of the same tile, which is how the
 * dashboard and the report pages drifted into stating a figure two different
 * ways. StatCard also animates the value, which matters here because these
 * numbers refresh while someone is watching the screen.
 */
const KPICard: React.FC<KPICardProps> = ({ title, value, loading }) => (
  <StatCard
    label={title}
    /* Always numeric/currency ("3 / 10", "1,240", "62%"). `bidi-isolate`
       stops the bidi algorithm reordering them inside an RTL page — a
       reversed ratio would show the wrong number. */
    value={value}
    isLoading={loading}
    className="bidi-isolate"
  />
);

export const KPIGrid: React.FC<KPIGridProps> = ({ summary, loading }) => {
  const todaySales = summary?.today_sales ?? 0;
  const ordersToday = summary?.today_orders ?? 0;
  const occupiedTables = summary?.occupied_tables ?? 0;
  const totalTables = summary?.total_tables ?? 0;
  const aov = summary?.avg_order_value ?? 0;
  const pendingOrders = summary?.pending_kitchen_orders ?? 0;

  const occupancyRate = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;

  return (
    <section className="w-full">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <LinkCard
          icon={MonitorSmartphone}
          label="Smart POS"
          description={t('kpi.smart_pos_description')}
          href="/pos"
          accentClassName="from-blue-50 via-white to-indigo-50"
          iconClassName="bg-blue-600 text-white"
        />

        <LinkCard
          icon={ChefHat}
          label="Smart Kitchen"
          description={t('kpi.smart_kitchen_description')}
          href="/mosaic"
          accentClassName="from-amber-50 via-white to-orange-50"
          iconClassName="bg-amber-600 text-white"
        />

        <KPICard
          title={t('kpi.today_sales')}
          value={formatCurrency(todaySales)}
          loading={loading}
        />

        <KPICard
          title={t('kpi.orders_today')}
          value={ordersToday.toString()}
          loading={loading}
        />

        <KPICard
          title={t('kpi.table_occupancy')}
          value={`${occupancyRate}%`}
          loading={loading}
        />

        <KPICard
          title={t('kpi.occupied_tables')}
          value={`${occupiedTables} / ${totalTables}`}
          
          loading={loading}
        />

        <KPICard
          title={t('kpi.avg_order_value')}
          value={formatCurrency(aov)}
          loading={loading}
        />

        <KPICard
          title={t('kpi.pending_kitchen_orders')}
          value={t('kpi.kot_count', { count: pendingOrders })}
          loading={loading}
        />
      </div>
    </section>
  );
};

export default KPIGrid;
