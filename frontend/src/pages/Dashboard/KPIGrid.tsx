import React from 'react';
import { formatCurrency } from '@ury/core';
import { StatCard, Spinner } from '@ury/ui';
import { DashboardSummary } from '../../services/dashboard';

interface KPIGridProps {
  summary: DashboardSummary | null;
  loading: boolean;
}

interface KPITileProps {
  title: string;
  value: string;
  loading?: boolean;
}

// StatCard's `value` prop only accepts `string | number`, so it can't carry a
// spinner + "Loading..." node. The loading state is rendered as a lightweight
// placeholder that mirrors StatCard's own shell/tokens instead; once data is
// available, the tile renders through StatCard itself.
const KPITile: React.FC<KPITileProps> = ({ title, value, loading }) => {
  if (loading) {
    return (
      <div className="rounded-lg border border-border bg-card shadow-sm p-5 transition-all duration-200 hover:shadow-md hover:border-primary/20">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        <div className="mt-2 flex items-center space-x-2">
          <Spinner className="w-4 h-4 text-primary" />
          <span className="text-sm text-muted-foreground">Loading...</span>
        </div>
      </div>
    );
  }

  return (
    <StatCard
      label={title}
      value={value}
      className="transition-all duration-200 hover:shadow-md hover:border-primary/20"
    />
  );
};

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
        <KPITile
          title="Today's Sales"
          value={formatCurrency(todaySales)}
          loading={loading}
        />

        <KPITile
          title="Orders Today"
          value={ordersToday.toString()}
          loading={loading}
        />

        <KPITile
          title="Active Tables"
          value={`${totalTables} Tables`}
          loading={loading}
        />

        <KPITile
          title="Occupied Tables"
          value={`${occupiedTables} / ${totalTables}`}
          loading={loading}
        />

        <KPITile
          title="Active Menu Items"
          value={`${totalMenuItems} Items`}
          loading={loading}
        />

        <KPITile
          title="Average Order Value"
          value={formatCurrency(aov)}
          loading={loading}
        />

        <KPITile
          title="Pending Kitchen Orders"
          value={`${pendingOrders} KOTs`}
          loading={loading}
        />

        <KPITile
          title="Active Cashiers"
          value={`${activeCashiers} Online`}
          loading={loading}
        />
      </div>
    </section>
  );
};

export default KPIGrid;
