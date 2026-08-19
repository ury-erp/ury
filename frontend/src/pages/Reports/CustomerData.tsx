import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { Receipt, IndianRupee, TrendingUp, Search } from 'lucide-react';
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

const columns: DataTableColumn<InvoiceRow>[] = [
  { key: 'date', header: 'Date' },
  { key: 'invoice', header: 'Invoice' },
  { key: 'amount', header: 'Amount', render: (r) => formatCurrency(r.amount), align: 'right' },
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Customer Data</h1>
          <p className="text-sm text-muted-foreground">Per-customer purchase history</p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="relative max-w-sm">
        <div className="flex items-center border border-input rounded-md px-3 py-2 gap-2">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder="Search customer by name..."
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedCustomer(null);
              setData(null);
            }}
            className="flex-1 text-sm outline-none"
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

      {!selectedCustomer && !error && (
        <div className="text-sm text-muted-foreground">Search and select a customer to view their history.</div>
      )}

      {isLoading && <div className="text-sm text-muted-foreground">Loading...</div>}

      {data && !isLoading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Visits" value={data.summary.visit_count} icon={<Receipt className="w-4 h-4" />} />
            <StatCard
              label="Total Spend"
              value={formatCurrency(data.summary.total_spend)}
              icon={<IndianRupee className="w-4 h-4" />}
            />
            <StatCard
              label="Avg Spend / Visit"
              value={formatCurrency(data.summary.avg_spend)}
              icon={<TrendingUp className="w-4 h-4" />}
            />
          </div>
          <DataTable columns={columns} rows={data.invoices} isLoading={isLoading} />
        </>
      )}
    </div>
  );
}
