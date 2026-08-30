import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { Users, IndianRupee, Receipt } from 'lucide-react';
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
  { key: 'employee_name', header: 'Employee' },
  { key: 'total_invoices', header: 'Invoices', align: 'right' },
  { key: 'sales_amount', header: 'Gross Sales (incl. tax)', render: (r) => formatCurrency(r.sales_amount), align: 'right' },
  { key: 'net_sales_amount', header: 'Net Sales', render: (r) => formatCurrency(r.net_sales_amount), align: 'right' },
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
        <div className="flex items-center gap-3">
          <a href="/reports/employee-commission" className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            View Commission →
          </a>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {data && data.summary.unattributed_invoices && data.summary.unattributed_invoices > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {data.summary.unattributed_invoices} invoices ({formatCurrency(data.summary.unattributed_sales || 0)}) could not be attributed to an employee. Set the Employee record's linked User first, then re-run the attribution backfill.
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Staff" value={data.summary.total_employees} icon={<Users className="w-4 h-4" />} />
            <StatCard
              label="Total Invoices"
              value={data.summary.period_total_invoices}
              icon={<Receipt className="w-4 h-4" />}
            />
            <StatCard
              label="Total Sales"
              value={formatCurrency(data.summary.period_total_sales)}
              icon={<IndianRupee className="w-4 h-4" />}
            />
          </div>

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
