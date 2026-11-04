import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, DataTable, type DataTableColumn, type KpiItemProps, PageHeader } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';
import { __ } from '../../i18n';

interface EmployeeRow {
  employee_id: string;
  employee_name: string;
  total_invoices: number;
  sales_amount: number;
  net_sales_amount: number;
  average_invoice_value: number;
  rank: number;
}

interface EmployeeSalesData {
  employees: EmployeeRow[];
  summary: { total_employees: number; period_total_invoices: number; period_total_sales: number; unattributed_invoices?: number; unattributed_sales?: number };
}

const columns: DataTableColumn<EmployeeRow>[] = [
  { key: 'rank', header: '#' },
  { key: 'employee_name', header: __('Employee') },
  { key: 'total_invoices', header: __('Invoices'), align: 'right' },
  { key: 'sales_amount', header: __('Gross Sales (incl. tax)'), render: (r) => formatCurrency(r.sales_amount), align: 'right' },
  { key: 'net_sales_amount', header: __('Net Sales'), render: (r) => formatCurrency(r.net_sales_amount), align: 'right' },
  { key: 'average_invoice_value', header: __('Avg / Invoice'), render: (r) => formatCurrency(r.average_invoice_value), align: 'right' },
];

export function EmployeeSales() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [data, setData] = useState<EmployeeSalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: EmployeeSalesData }>('ury.ury.report_api.employees.get_employee_sales', {
        branch,
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
      });
      setData(res.message ?? (res as unknown as EmployeeSalesData));
    } catch (err) {
      setError(err instanceof Error ? err.message : __('Failed to load report data.'));
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const top10 = data?.employees.slice(0, 10) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title={__('Employee Sales')}
        description={__('Staff leaderboard {0}', [activeBranchId === 'all' ? '· All Branches' : ''])}
        actions={
          <>
            <a href="/reports/employee-commission" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              {__('View Commission')} <span className="inline-block rtl:-scale-x-100">→</span>
            </a>
            <DateRangeFilter value={range} onChange={setRange} />
          </>
        }
      />

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && data.summary.unattributed_invoices && data.summary.unattributed_invoices > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {__("{0} invoices ({1}) could not be attributed to an employee. Set the Employee record's linked User first, then re-run the attribution backfill.", [data.summary.unattributed_invoices, formatCurrency(data.summary.unattributed_sales || 0)])}
        </div>
      )}

      {data && (
        <>
          <KpiStrip
            items={
              [
                { label: __('Staff'), value: data.summary.total_employees },
                { label: __('Total Invoices'), value: data.summary.period_total_invoices },
                { label: __('Total Sales'), value: formatCurrency(data.summary.period_total_sales) },
              ] satisfies KpiItemProps[]
            }
          />

          {top10.length >= 2 && (
            <BarChartCard
              title={__('Top {0} by Sales', [Math.min(10, top10.length)])}
              data={top10}
              xKey="employee_name"
              yKeys={['sales_amount']}
              labels={{ sales_amount: 'Sales Amount' }}
            />
          )}
        </>
      )}

      <DataTable columns={columns} rows={data?.employees ?? []} isLoading={isLoading} />
    </div>
  );
}
