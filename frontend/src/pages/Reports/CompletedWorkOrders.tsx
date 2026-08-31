import { useCallback, useEffect, useState } from 'react';
import { call } from '@ury/core';
import { KpiStrip, type KpiItemProps, DataTable, type DataTableColumn } from '@ury/ui';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { DeskLink } from '../../components/DeskLink';
import { toApiDate } from '../../lib/reportDate';
import { subMonths, endOfDay } from 'date-fns';

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

const columns: DataTableColumn<WorkOrderRow>[] = [
  {
    key: 'name',
    header: 'Work Order',
    render: (r) => (
      <span className="inline-flex items-center gap-1.5">
        {r.name}
        {/* Link to editable desk document; this report is read-only */}
        <DeskLink doctype="Work Order" name={r.name} iconOnly />
      </span>
    ),
  },
  { key: 'item_name', header: 'Item', render: (r) => r.item_name || r.production_item },
  { key: 'qty', header: 'Planned Qty', align: 'right' },
  { key: 'produced_qty', header: 'Produced Qty', align: 'right' },
  { key: 'actual_end_date', header: 'Completed', render: (r) => r.actual_end_date || r.planned_end_date || '—' },
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
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
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
          <h1 className="text-xl font-semibold">Completed Work Orders</h1>
          <p className="text-sm text-muted-foreground">Manufacturing production history</p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <KpiStrip
          items={[
            { label: 'Completed', value: data.summary.total_completed },
            { label: 'Qty Produced', value: data.summary.total_qty_produced },
          ] satisfies KpiItemProps[]}
        />
      )}

      <DataTable
        columns={columns}
        rows={data?.work_orders ?? []}
        isLoading={isLoading}
        emptyMessage="No completed work orders in this range."
      />
    </div>
  );
}
