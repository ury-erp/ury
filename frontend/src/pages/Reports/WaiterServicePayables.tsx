import { useCallback, useEffect, useState } from 'react';
import { call } from '@ury/core';
import { DataTable, type DataTableColumn, PageHeader } from '@ury/ui';
import { endOfDay, startOfMonth } from 'date-fns';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';

interface WaiterTotal {
  employee: string;
  employee_name: string;
  amount: number;
  invoices: number;
  currency: string;
}

interface WaiterInvoice {
  invoice: string;
  posting_date: string;
  employee: string;
  employee_name: string;
  amount: number;
  currency: string;
}

interface PayablesReport {
  employees: WaiterTotal[];
  invoices: WaiterInvoice[];
  totals: Array<{ currency: string; amount: number }>;
}

const money = (amount: number, currency: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);

const employeeColumns: DataTableColumn<WaiterTotal>[] = [
  { key: 'employee_name', header: 'Waiter' },
  { key: 'invoices', header: 'Paid Bills', align: 'right' },
  { key: 'amount', header: 'Service Accrued', align: 'right', render: (row) => money(row.amount, row.currency) },
];

const invoiceColumns: DataTableColumn<WaiterInvoice>[] = [
  { key: 'invoice', header: 'Bill' },
  { key: 'posting_date', header: 'Date' },
  { key: 'employee_name', header: 'Waiter' },
  { key: 'amount', header: 'Service Accrued', align: 'right', render: (row) => money(row.amount, row.currency) },
];

export function WaiterServicePayables() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [report, setReport] = useState<PayablesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await call<{ message: PayablesReport }>(
        'ury.ury.report_api.waiter_service.get_waiter_service_payables',
        {
          start_date: toApiDate(range.from),
          end_date: toApiDate(range.to),
          branch: activeBranchId === 'all' ? undefined : activeBranchId,
        },
      );
      setReport(result.message ?? (result as unknown as PayablesReport));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Failed to load waiter service amounts.');
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, range]);

  useEffect(() => { void fetchReport(); }, [fetchReport]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Waiter Service Payables"
        description="Guest-funded service charges credited to each waiter"
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />
      <p className="text-sm text-muted-foreground">
        Accrued amounts from paid bills. Payouts must be recorded separately against the waiter service liability account.
      </p>
      {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
      <div className="rounded-md border border-border p-4">
        <div className="text-xs text-muted-foreground">Total waiter service accrued</div>
        <div className="text-xl font-semibold">
          {report?.totals.length
            ? report.totals.map((total) => <div key={total.currency}>{money(total.amount, total.currency)}</div>)
            : '0'}
        </div>
      </div>
      <section className="space-y-2">
        <h2 className="font-semibold">By waiter</h2>
        <DataTable columns={employeeColumns} rows={report?.employees ?? []} isLoading={loading} />
      </section>
      <section className="space-y-2">
        <h2 className="font-semibold">Bills</h2>
        <DataTable columns={invoiceColumns} rows={report?.invoices ?? []} isLoading={loading} />
      </section>
    </div>
  );
}
