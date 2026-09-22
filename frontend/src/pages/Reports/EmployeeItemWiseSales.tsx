import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, type KpiItemProps, DataTable, type DataTableColumn, Input, PageHeader } from '@ury/ui';
import { Search } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';

interface EmployeeSuggestion {
  name: string;
  full_name: string;
}

interface ItemRow {
  item_code: string;
  item_name: string;
  item_group: string | null;
  qty: number;
  amount: number;
}

interface EmployeeItemWiseSalesData {
  employee_name: string;
  items: ItemRow[];
  summary: { total_qty: number; total_amount: number };
}

// Real rows from `get_employee_sales`, the existing staff leaderboard --
// used here as the default employee picker instead of `search_employees`,
// which lists every `User` regardless of whether they have ever sold
// anything (on the demo site: 6 Users, 1 of whom actually appears as a
// `waiter` on any POS Invoice). `employee_id` is the same `waiter` value
// `get_employee_item_wise_sales` expects.
interface EmployeeListingRow {
  employee_id: string;
  employee_name: string;
  total_invoices: number;
  sales_amount: number;
}

const columns: DataTableColumn<ItemRow>[] = [
  { key: 'item_name', header: 'Item' },
  { key: 'item_group', header: 'Group', render: (r) => r.item_group || '—' },
  { key: 'qty', header: 'Qty', align: 'right' },
  { key: 'amount', header: 'Amount', render: (r) => formatCurrency(r.amount), align: 'right' },
];

const listingColumns: DataTableColumn<EmployeeListingRow>[] = [
  { key: 'employee_name', header: 'Employee' },
  { key: 'total_invoices', header: 'Invoices', align: 'right' },
  { key: 'sales_amount', header: 'Sales', render: (r) => formatCurrency(r.sales_amount), align: 'right' },
];

export function EmployeeItemWiseSales() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<EmployeeSuggestion[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null);
  const [data, setData] = useState<EmployeeItemWiseSalesData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [listingRows, setListingRows] = useState<EmployeeListingRow[]>([]);
  const [listingLoading, setListingLoading] = useState(true);
  const [listingError, setListingError] = useState<string | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await call<{ message: EmployeeSuggestion[] }>('ury.ury.report_api.employees.search_employees', {
          query,
        });
        setSuggestions(res.message ?? (res as unknown as EmployeeSuggestion[]) ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  // Default listing: the same staff leaderboard the Employee Sales report
  // uses, so the page opens on employees who actually sold something in the
  // selected range instead of an empty "search and select" prompt.
  useEffect(() => {
    let cancelled = false;
    setListingLoading(true);
    setListingError(null);

    (async () => {
      try {
        const branch = activeBranchId === 'all' ? undefined : activeBranchId;
        const res = await call<{ message: { employees: EmployeeListingRow[] } }>(
          'ury.ury.report_api.employees.get_employee_sales',
          { branch, start_date: toApiDate(range.from), end_date: toApiDate(range.to) },
        );
        if (cancelled) return;
        setListingRows(res.message?.employees ?? []);
      } catch (err) {
        if (!cancelled) {
          setListingRows([]);
          setListingError(err instanceof Error ? err.message : 'Unable to load the employee list.');
        }
      } finally {
        if (!cancelled) setListingLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, range]);

  const fetchData = useCallback(async () => {
    if (!selectedEmployee) return;
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: EmployeeItemWiseSalesData }>(
        'ury.ury.report_api.employees.get_employee_item_wise_sales',
        { employee: selectedEmployee, branch, start_date: toApiDate(range.from), end_date: toApiDate(range.to) },
      );
      setData(res.message ?? (res as unknown as EmployeeItemWiseSalesData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedEmployee, activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Item Wise Sales"
        description="Item breakdown per employee"
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      <div className="relative max-w-sm">
        <div className="flex items-center border border-input rounded-md px-3 gap-2">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input
            type="text"
            placeholder="Search employee by name..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedEmployee(null);
              setData(null);
            }}
            className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
            aria-label="Search employee by name"
          />
        </div>
        {suggestions.length > 0 && !selectedEmployee && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.name}
                onClick={() => {
                  setSelectedEmployee(s.name);
                  setQuery(s.full_name);
                  setSuggestions([]);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
              >
                {s.full_name}
              </button>
            ))}
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}

      {data && !isLoading && (
        <>
          <KpiStrip
            items={[
              { label: 'Total Qty', value: data.summary.total_qty },
              { label: 'Total Amount', value: formatCurrency(data.summary.total_amount) },
            ] satisfies KpiItemProps[]}
          />
          <DataTable columns={columns} rows={data.items} isLoading={isLoading} />
        </>
      )}

      {!selectedEmployee && !error && (
        <>
          {listingError && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {listingError}
            </div>
          )}
          <DataTable
            columns={listingColumns}
            rows={listingRows}
            isLoading={listingLoading}
            emptyMessage="No employee sales recorded in this range."
            onRowClick={(row) => {
              setSelectedEmployee(row.employee_id);
              setQuery(row.employee_name);
            }}
          />
        </>
      )}
    </div>
  );
}
