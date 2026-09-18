import React from 'react';
import { formatCurrency } from '@ury/core';
import { Card, StatCard } from '@ury/ui';
import { ArrowUpRight } from 'lucide-react';
import { DashboardSummary } from '../../services/dashboard';
import { t } from '../../i18n';
import uryPosLogo from '../../../../pos/public/ury_pos.png';
import uryMosaicLogo from '../../../../mosaic/src/assets/logos/mosaic.jpg';

interface LinkCardProps {
  logoSrc: string;
  label: string;
  href: string;
}

const LinkCard: React.FC<LinkCardProps> = ({ logoSrc, label, href }) => {
  return (
    <a
      href={href}
      className="group block h-full rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
    >
      <Card variant="interactive" padding="lg" className="h-full">
        <div className="mb-2 flex h-4 items-center">
          <img
            src={logoSrc}
            alt=""
            className="h-full object-contain opacity-70 mix-blend-multiply transition-opacity duration-fast group-hover:opacity-100"
          />
        </div>
        <h3 className="mt-2 text-2xl font-bold tracking-tight text-foreground">{label}</h3>
        {/* Affordance that this tile navigates, revealed on hover so the
            resting grid stays quiet. */}
        <span
          aria-hidden="true"
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary opacity-0 transition-opacity duration-fast group-hover:opacity-100"
        >
          <ArrowUpRight className="h-3.5 w-3.5 rtl-flip" />
        </span>
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
  const activeCashiers = summary?.active_cashiers ?? 0;
  const pendingOrders = summary?.pending_kitchen_orders ?? 0;
  const totalMenuItems = summary?.total_menu_items ?? 0;

  const occupancyRate = totalTables > 0 ? Math.round((occupiedTables / totalTables) * 100) : 0;

  return (
    <section className="w-full">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <LinkCard
          logoSrc={uryPosLogo}
          label="URY POS"
          href="/pos"
        />

        <LinkCard
          logoSrc={uryMosaicLogo}
          label="URY MOSAIC"
          href="/mosaic"
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
