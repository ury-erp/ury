import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { Users, IndianRupee, Receipt, AlertCircle } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { BarChartCard } from '../../components/reports/charts/BarChartCard';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';
import { t } from '../../i18n';

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

const getColumns = (): DataTableColumn<EmployeeRow>[] => [
  { key: 'rank', header: '#' },
  { key: 'employee_name', header: t('fields.employee') },
  { key: 'total_invoices', header: t('fields.invoices'), align: 'right' },
  { key: 'sales_amount', header: t('fields.sales_amount'), render: (r) => formatCurrency(r.sales_amount), align: 'right' },
  { key: 'average_invoice_value', header: t('fields.avg_invoice'), render: (r) => formatCurrency(r.average_invoice_value), align: 'right' },
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
      setError(err instanceof Error ? err.message : t('reports.common.load_failed'));
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
          <h1 className="text-xl font-semibold">{t('reports.employee_sales.employee_sales')}</h1>
          <p className="text-sm text-muted-foreground">
            Staff leaderboard {activeBranchId === 'all' ? '· All Branches' : ''}
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
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label={t('reports.employee_sales.staff')} value={data.summary.total_employees} icon={<Users className="w-4 h-4" />} />
            <StatCard
              label={t('reports.employee_sales.total_invoices')}
              value={data.summary.period_total_invoices}
              icon={<Receipt className="w-4 h-4" />}
            />
            <StatCard
              label={t('reports.employee_sales.total_sales')}
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
              labels={{ sales_amount: t('fields.sales_amount') }}
            />
          )}
        </>
      )}

      <DataTable columns={getColumns()} rows={data?.employees ?? []} isLoading={isLoading} />
    </div>
  );
}
