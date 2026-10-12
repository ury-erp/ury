import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { Package, IndianRupee, AlertCircle } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';
import { t } from '../../i18n';

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

const getColumns = (): DataTableColumn<PurchaseItemRow>[] => [
  { key: 'item_name', header: t('fields.item') },
  { key: 'qty', header: t('fields.qty_purchased'), align: 'right' },
  { key: 'avg_rate', header: t('fields.avg_rate'), render: (r) => formatCurrency(r.avg_rate), align: 'right' },
  { key: 'amount', header: t('fields.total_spend'), render: (r) => formatCurrency(r.amount), align: 'right' },
  { key: 'purchase_count', header: t('fields.purchases'), align: 'right' },
  { key: 'supplier_count', header: t('fields.suppliers'), align: 'right' },
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
      setError(err instanceof Error ? err.message : t('reports.common.load_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('reports.item_wise_purchase_history.item_wise_purchase_history')}</h1>
          <p className="text-sm text-muted-foreground">
            Procurement by item {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 animate-slide-in"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      {data && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <StatCard label={t('reports.item_wise_purchase_history.total_qty_purchased')} value={data.summary.total_qty} icon={<Package className="w-4 h-4" />} />
          <StatCard
            label={t('reports.item_wise_purchase_history.total_spend')}
            value={formatCurrency(data.summary.total_amount)}
            icon={<IndianRupee className="w-4 h-4" />}
          />
        </div>
      )}

      <DataTable
        columns={getColumns()}
        rows={data?.items ?? []}
        isLoading={isLoading}
        emptyMessage="No purchase records in this range — Purchase Invoices are created via standard ERPNext Desk, not a URY-specific workflow, so this may legitimately be sparse."
      />
    </div>
  );
}
