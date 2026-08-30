import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, DataTable, type DataTableColumn } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';

interface EmployeeRow {
  employee_id: string;
  employee_name: string;
  total_invoices: number;
  sales_amount: number;
  average_invoice_value: number;
  rank: number;
}

interface EmployeeSalesData {
  employees: EmployeeRow[];
  summary: { total_employees: number; period_total_invoices: number; period_total_sales: number };
}

const columns: DataTableColumn<EmployeeRow>[] = [
  { key: 'rank', header: '#' },
  { key: 'employee_name', header: 'Employee' },
  { key: 'total_invoices', header: 'Invoices', align: 'right' },
  { key: 'sales_amount', header: 'Sales Amount', render: (r) => formatCurrency(r.sales_amount), align: 'right' },
  { key: 'average_invoice_value', header: 'Avg / Invoice', render: (r) => formatCurrency(r.average_invoice_value), align: 'right' },
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
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Employee Sales</h1>
          <p className="text-sm text-muted-foreground">
            Staff leaderboard {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && (
        <>
          <KpiStrip
            items={[
              { label: 'Staff', value: data.summary.total_employees },
              { label: 'Total Invoices', value: data.summary.period_total_invoices },
              { label: 'Total Sales', value: formatCurrency(data.summary.period_total_sales) },
            ]}
          />

          {top10.length >= 2 && (
            <BarChartCard
              title={`Top ${Math.min(10, top10.length)} by Sales`}
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
