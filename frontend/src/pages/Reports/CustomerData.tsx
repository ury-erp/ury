import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, type KpiItemProps, DataTable, type DataTableColumn, Input, PageHeader } from '@ury/ui';
import { Search } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';

interface CustomerSuggestion {
  name: string;
  customer_name: string;
  mobile_no: string | null;
}

interface InvoiceRow {
  date: string;
  invoice: string;
  amount: number;
}

interface CustomerDataResult {
  invoices: InvoiceRow[];
  summary: {
    customer_name: string;
    mobile_number: string | null;
    visit_count: number;
    total_spend: number;
    avg_spend: number;
    last_purchase_date: string | null;
  };
}

// Real per-customer rows from `get_daywise_customer_details`, grouped on
// POS Invoice's `customer` link field -- not the denormalized `customer_name`
// text that search_customers matches on, so two customers sharing a display
// name (real data on the demo site: "fairooz" and "Fairooz BZ") stay
// distinct rows here.
interface CustomerListingRow {
  customer_id: string;
  customer_name: string;
  mobile_number: string | null;
  visit_count: number;
  first_visit: string;
  last_visit: string;
}

const columns: DataTableColumn<InvoiceRow>[] = [
  { key: 'date', header: 'Date' },
  { key: 'invoice', header: 'Invoice' },
  { key: 'amount', header: 'Amount', render: (r) => formatCurrency(r.amount), align: 'right' },
];

const listingColumns: DataTableColumn<CustomerListingRow>[] = [
  { key: 'customer_name', header: 'Customer' },
  { key: 'mobile_number', header: 'Mobile', render: (r) => r.mobile_number || '—' },
  { key: 'visit_count', header: 'Visits', align: 'right' },
  { key: 'first_visit', header: 'First Visit' },
  { key: 'last_visit', header: 'Last Visit' },
];

export function CustomerData() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<CustomerSuggestion[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string | null>(null);
  const [data, setData] = useState<CustomerDataResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [listingRows, setListingRows] = useState<CustomerListingRow[]>([]);
  const [listingLoading, setListingLoading] = useState(true);
  const [listingError, setListingError] = useState<string | null>(null);

  useEffect(() => {
    if (query.length < 2) {
      setSuggestions([]);
      return;
    }
    const timeout = setTimeout(async () => {
      try {
        const res = await call<{ message: CustomerSuggestion[] }>('ury.ury.report_api.customers.search_customers', {
          query,
        });
        setSuggestions(res.message ?? (res as unknown as CustomerSuggestion[]) ?? []);
      } catch {
        setSuggestions([]);
      }
    }, 250);
    return () => clearTimeout(timeout);
  }, [query]);

  // Default listing: every customer who actually visited in the selected
  // range, so the page opens on a real table instead of an empty "search
  // and select" prompt. Sorted by visit count so the most frequent
  // customers surface first -- the backend itself orders by name.
  useEffect(() => {
    let cancelled = false;
    setListingLoading(true);
    setListingError(null);

    (async () => {
      try {
        const branch = activeBranchId === 'all' ? undefined : activeBranchId;
        const res = await call<{ message: { customers: CustomerListingRow[] } }>(
          'ury.ury.report_api.customers.get_daywise_customer_details',
          { branch, start_date: toApiDate(range.from), end_date: toApiDate(range.to) },
        );
        if (cancelled) return;
        const rows = res.message?.customers ?? [];
        setListingRows([...rows].sort((a, b) => b.visit_count - a.visit_count));
      } catch (err) {
        if (!cancelled) {
          setListingRows([]);
          setListingError(err instanceof Error ? err.message : 'Unable to load the customer list.');
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
    if (!selectedCustomer) return;
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: CustomerDataResult }>('ury.ury.report_api.customers.get_customer_data', {
        customer: selectedCustomer,
        branch,
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
      });
      setData(res.message ?? (res as unknown as CustomerDataResult));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [selectedCustomer, activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Customer Data"
        description="Per-customer purchase history"
        actions={<DateRangeFilter value={range} onChange={setRange} />}
      />

      <div className="relative max-w-sm">
        <div className="flex items-center border border-input rounded-md px-3.5 gap-2">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <Input
            type="text"
            placeholder="Search customer by name..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedCustomer(null);
              setData(null);
            }}
            className="border-0 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0"
            aria-label="Search customer by name"
          />
        </div>
        {suggestions.length > 0 && !selectedCustomer && (
          <div className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-60 overflow-y-auto">
            {suggestions.map((s) => (
              <button
                key={s.name}
                onClick={() => {
                  setSelectedCustomer(s.customer_name);
                  setQuery(s.customer_name);
                  setSuggestions([]);
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center justify-between"
              >
                <span>{s.customer_name}</span>
                {s.mobile_no && <span className="text-xs text-muted-foreground">{s.mobile_no}</span>}
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
              { label: 'Visits', value: data.summary.visit_count },
              { label: 'Total Spend', value: formatCurrency(data.summary.total_spend) },
              { label: 'Avg Spend / Visit', value: formatCurrency(data.summary.avg_spend) },
            ] satisfies KpiItemProps[]}
          />
          <DataTable columns={columns} rows={data.invoices} isLoading={isLoading} />
        </>
      )}

      {!selectedCustomer && !error && (
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
            emptyMessage="No customers visited in this range."
            onRowClick={(row) => {
              setSelectedCustomer(row.customer_name);
              setQuery(row.customer_name);
            }}
          />
        </>
      )}
    </div>
  );
}
