import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, DataTable, type DataTableColumn, Page, Section } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';

interface PurchaseItemRow {
  item_code: string;
  item_name: string;
  qty: number;
  avg_rate: number;
  amount: number;
  purchase_count: number;
  supplier_count: number;
}

interface ItemWisePurchaseHistoryData {
  items: PurchaseItemRow[];
  summary: { total_qty: number; total_amount: number };
}

const columns: DataTableColumn<PurchaseItemRow>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'qty', header: 'Qty Purchased', align: 'right' },
  { key: 'avg_rate', header: 'Avg Rate', render: (r) => formatCurrency(r.avg_rate), align: 'right' },
  { key: 'amount', header: 'Total Spend', render: (r) => formatCurrency(r.amount), align: 'right' },
  { key: 'purchase_count', header: '# Purchases', align: 'right' },
  { key: 'supplier_count', header: '# Suppliers', align: 'right' },
];

export function ItemWisePurchaseHistory() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [data, setData] = useState<ItemWisePurchaseHistoryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: ItemWisePurchaseHistoryData }>(
        'ury.ury.report_api.items.get_item_wise_purchase_history',
        { branch, start_date: toApiDate(range.from), end_date: toApiDate(range.to) },
      );
      setData(res.message ?? (res as unknown as ItemWisePurchaseHistoryData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <Page>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Item-wise Purchase History</h1>
          <p className="text-sm text-muted-foreground">
            Procurement by item {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <Section>
          <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        </Section>
      )}

      {data && (
        <Section>
          <KpiStrip
            items={[
              { label: 'Total Qty Purchased', value: data.summary.total_qty },
              { label: 'Total Spend', value: formatCurrency(data.summary.total_amount) },
            ]}
          />
        </Section>
      )}

      <Section>
        <DataTable
          columns={columns}
          rows={data?.items ?? []}
          isLoading={isLoading}
          emptyMessage="No purchase records in this range. This report summarizes item-wise spend from recorded Purchase Invoices for the selected period."
        />
      </Section>

      <Section>
        <p className="text-xs text-muted-foreground">
          Recording new Purchase Invoices isn't available in this app yet — that workflow is on
          our roadmap. In the meantime, invoices entered elsewhere in ERPNext will show up here.
        </p>
      </Section>
    </Page>
  );
}
