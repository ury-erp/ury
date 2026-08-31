import React, { useMemo } from 'react';
import { formatCurrency } from '@ury/core';
import { Card, KpiStrip, KpiItemProps, Spinner } from '@ury/ui';
import { DashboardSummary } from '../../services/dashboard';
import uryPosLogo from '../../../../pos/public/ury_pos.png';
import uryMosaicLogo from '../../../../mosaic/src/assets/logos/mosaic.jpg';

interface LinkCardProps {
  logoSrc: string;
  label: string;
  subtitle?: string;
  href: string;
}

const LinkCard: React.FC<LinkCardProps> = ({ logoSrc, label, subtitle, href }) => {
  return (
    <a href={href} className="block outline-none h-full">
      <Card className="h-full rounded-lg border border-border bg-card p-5 shadow-xs transition-all duration-200 hover:shadow-md hover:border-primary/20">
        <div className="flex h-4 items-center mb-2">
          <img src={logoSrc} alt="Logo" className="h-full object-contain opacity-70 mix-blend-multiply" />
        </div>
        <h3 className="mt-2 text-2xl font-bold text-foreground tracking-tight">{label}</h3>
        {subtitle && (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        )}
      </Card>
    </a>
  );
};

interface KPIGridProps {
  summary: DashboardSummary | null;
  loading: boolean;
}

export const KPIGrid: React.FC<KPIGridProps> = ({ summary, loading }) => {
  const todaySales = summary?.today_sales ?? 0;
  const ordersToday = summary?.today_orders ?? 0;
  const occupiedTables = summary?.occupied_tables ?? 0;
  const totalTables = summary?.total_tables ?? 0;
  const aov = summary?.avg_order_value ?? 0;
  const activeCashiers = summary?.active_cashiers ?? 0;
  const pendingOrders = summary?.pending_kitchen_orders ?? 0;
  const totalMenuItems = summary?.total_menu_items ?? 0;

  const kpiItems = useMemo<KpiItemProps[]>(() => {
    if (loading) {
      // Return placeholder items with a loading hint
      return [
        { label: 'Today\'s Sales', value: '—' },
        { label: 'Orders Today', value: '—' },
        { label: 'Active Tables', value: '—' },
        { label: 'Occupied Tables', value: '—' },
        { label: 'Active Menu Items', value: '—' },
        { label: 'Average Order Value', value: '—' },
        { label: 'Pending Kitchen Orders', value: '—' },
        { label: 'Active Cashiers', value: '—' },
      ];
    }
    return [
      { label: 'Today\'s Sales', value: formatCurrency(todaySales) },
      { label: 'Orders Today', value: ordersToday.toString() },
      { label: 'Active Tables', value: `${totalTables} Tables` },
      { label: 'Occupied Tables', value: `${occupiedTables} / ${totalTables}` },
      { label: 'Active Menu Items', value: `${totalMenuItems} Items` },
      { label: 'Average Order Value', value: formatCurrency(aov) },
      { label: 'Pending Kitchen Orders', value: `${pendingOrders} KOTs` },
      { label: 'Active Cashiers', value: `${activeCashiers} Online` },
    ];
  }, [loading, todaySales, ordersToday, totalTables, occupiedTables, totalMenuItems, aov, pendingOrders, activeCashiers]);

  return (
    <section className="w-full space-y-4">
      {/* Navigation Links */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <LinkCard
          logoSrc={uryPosLogo}
          label="POS"
          subtitle="Billing & order taking"
          href="/pos"
        />
        <LinkCard
          logoSrc={uryMosaicLogo}
          label="Mosaic"
          subtitle="Kitchen Display System"
          href="/mosaic"
        />
      </div>

      {/* KPI Metrics Strip */}
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
