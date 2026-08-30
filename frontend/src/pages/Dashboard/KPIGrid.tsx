import React from 'react';
import { formatCurrency } from '@ury/core';
import { KpiStrip } from '@ury/ui';
import { DashboardSummary } from '../../services/dashboard';

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

  const placeholder = loading ? '—' : undefined;

  return (
    <section className="w-full">
      <KpiStrip
        items={[
          { label: "Today's Sales", value: placeholder ?? formatCurrency(todaySales) },
          { label: 'Orders Today', value: placeholder ?? ordersToday.toString() },
          { label: 'Active Tables', value: placeholder ?? `${totalTables} Tables` },
          { label: 'Occupied Tables', value: placeholder ?? `${occupiedTables} / ${totalTables}` },
          { label: 'Active Menu Items', value: placeholder ?? `${totalMenuItems} Items` },
          { label: 'Average Order Value', value: placeholder ?? formatCurrency(aov) },
          { label: 'Pending Kitchen Orders', value: placeholder ?? `${pendingOrders} KOTs` },
          { label: 'Active Cashiers', value: placeholder ?? `${activeCashiers} Online` },
        ]}
      />
    </section>
  );
};

export default KPIGrid;
