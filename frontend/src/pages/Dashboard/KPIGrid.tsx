import React, { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { formatCurrency } from '@ury/core';
import { buttonVariants, KpiStrip, KpiItemProps, Spinner } from '@ury/ui';
import { DashboardSummary } from '../../services/dashboard';

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
      <div className="flex flex-col gap-2 sm:flex-row sm:w-fit">
        <LinkCard label="POS" subtitle="Billing & order taking" href="/pos" />
        <LinkCard label="Mosaic" subtitle="Kitchen Display System" href="/mosaic" />
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
