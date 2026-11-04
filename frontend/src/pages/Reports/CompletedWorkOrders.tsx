import { useCallback, useEffect, useState } from 'react';
import { call } from '@ury/core';
import { KpiStrip, type KpiItemProps, DataTable, type DataTableColumn, PageHeader } from '@ury/ui';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { DeskLink } from '../../components/DeskLink';
import { toApiDate } from '../../lib/reportDate';
import { subMonths, endOfDay } from 'date-fns';
import { __ } from '../../i18n';

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
    header: __('Work Order'),
    render: (r) => (
      <span className="inline-flex items-center gap-1.5">
        {r.name}
        {/* Link to editable desk document; this report is read-only */}
        <DeskLink doctype="Work Order" name={r.name} iconOnly />
      </span>
    ),
  },
  { key: 'item_name', header: __('Item'), render: (r) => r.item_name || r.production_item },
  { key: 'qty', header: __('Planned Qty'), align: 'right' },
  { key: 'produced_qty', header: __('Produced Qty'), align: 'right' },
  { key: 'actual_end_date', header: __('Completed'), render: (r) => r.actual_end_date || r.planned_end_date || '—' },
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
      setError(err instanceof Error ? err.message : __('Failed to load report data.'));
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={__('Completed Work Orders')}
        description={__('Manufacturing production history')}
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && (
        <KpiStrip
          items={[
            { label: __('Completed'), value: data.summary.total_completed },
            { label: __('Qty Produced'), value: data.summary.total_qty_produced },
          ] satisfies KpiItemProps[]}
        />
      )}

      <DataTable
        columns={columns}
        rows={data?.work_orders ?? []}
        isLoading={isLoading}
        emptyMessage={__('No completed work orders in this range.')}
      />
    </div>
  );
}
