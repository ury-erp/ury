import { useCallback, useEffect, useState } from 'react';
import { call } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { Factory, Package, AlertCircle } from 'lucide-react';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';
import { subMonths, endOfDay } from 'date-fns';
import { t } from '../../i18n';

interface WorkOrderRow {
  name: string;
  production_item: string;
  item_name: string | null;
  qty: number;
  produced_qty: number;
  planned_end_date: string | null;
  actual_end_date: string | null;
}

interface CompletedWorkOrdersData {
  work_orders: WorkOrderRow[];
  summary: { total_completed: number; total_qty_produced: number };
}

const getColumns = (): DataTableColumn<WorkOrderRow>[] => [
  { key: 'name', header: t('fields.work_order') },
  { key: 'item_name', header: t('fields.item'), render: (r) => r.item_name || r.production_item },
  { key: 'qty', header: t('fields.planned_qty'), align: 'right' },
  { key: 'produced_qty', header: t('fields.produced_qty'), align: 'right' },
  { key: 'actual_end_date', header: t('fields.completed'), render: (r) => r.actual_end_date || r.planned_end_date || '—' },
];

export function CompletedWorkOrders() {
  // Manufacturing data is sparse (a handful of records total) — default to
  // a wide 6-month window rather than "this month" so the report isn't
  // empty by default.
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: subMonths(new Date(), 6),
    to: endOfDay(new Date()),
  }));
  const [data, setData] = useState<CompletedWorkOrdersData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const res = await call<{ message: CompletedWorkOrdersData }>(
        'ury.ury.report_api.operations.get_completed_work_orders',
        { start_date: toApiDate(range.from), end_date: toApiDate(range.to) },
      );
      setData(res.message ?? (res as unknown as CompletedWorkOrdersData));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('reports.common.load_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('reports.completed_work_orders.completed_work_orders')}</h1>
          <p className="text-sm text-muted-foreground">{t('reports.completed_work_orders.subtitle')}</p>
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
          <StatCard label={t('reports.completed_work_orders.completed')} value={data.summary.total_completed} icon={<Factory className="w-4 h-4" />} />
          <StatCard label={t('reports.completed_work_orders.qty_produced')} value={data.summary.total_qty_produced} icon={<Package className="w-4 h-4" />} />
        </div>
      )}

      <DataTable
        columns={getColumns()}
        rows={data?.work_orders ?? []}
        isLoading={isLoading}
        emptyMessage={t('reports.completed_work_orders.no_completed_work_orders_in_this_range')}
      />
    </div>
  );
}
