import { useCallback, useEffect, useState } from 'react';
import { call } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn, Button } from '@ury/ui';
import { Users } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';

interface CustomerRow {
  customer_id: string;
  customer_name: string;
  mobile_number: string | null;
  visit_count: number;
  first_visit: string;
  last_visit: string;
}

interface DaywiseCustomerDetailsData {
  customers: CustomerRow[];
  total_count: number;
}

const columns: DataTableColumn<CustomerRow>[] = [
  { key: 'customer_name', header: 'Name' },
  { key: 'mobile_number', header: 'Mobile', render: (r) => r.mobile_number || '—' },
  { key: 'visit_count', header: 'Visits', align: 'right' },
  { key: 'first_visit', header: 'First Visit' },
  { key: 'last_visit', header: 'Last Visit' },
];

export function DaywiseCustomerDetails() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [data, setData] = useState<DaywiseCustomerDetailsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: DaywiseCustomerDetailsData }>(
        'ury.ury.report_api.customers.get_daywise_customer_details',
        { branch, start_date: toApiDate(range.from), end_date: toApiDate(range.to) },
      );
      setData(res.message ?? (res as unknown as DaywiseCustomerDetailsData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const exportCsv = () => {
    if (!data) return;
    const header = 'Customer Name,Mobile,Visits,First Visit,Last Visit\n';
    const body = data.customers
      .map((c) => `"${c.customer_name}",${c.mobile_number ?? ''},${c.visit_count},${c.first_visit},${c.last_visit}`)
      .join('\n');
    const blob = new Blob([header + body], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers-${toApiDate(range.from)}-to-${toApiDate(range.to)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Daywise Customer Details</h1>
          <p className="text-sm text-muted-foreground">
            Customer contact list {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
                    <Button
            onClick={exportCsv}
            disabled={!data || data.customers.length === 0}
            variant="outline"
            size="sm"
          >
            Export CSV
          </Button>
          <DateRangeFilter value={range} onChange={setRange} />
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {data && <StatCard label="Unique Customers" value={data.total_count} icon={<Users className="w-4 h-4" />} />}

      <DataTable columns={columns} rows={data?.customers ?? []} isLoading={isLoading} />
    </div>
  );
}
