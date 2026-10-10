import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { Package, IndianRupee, Search, AlertCircle } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';
import { t } from '../../i18n';
import { ReportSkeleton } from '../../components/reports/ReportSkeleton';

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

const getColumns = (): DataTableColumn<ItemRow>[] => [
  { key: 'item_name', header: t('fields.item') },
  { key: 'item_group', header: t('fields.group'), render: (r) => r.item_group || '—' },
  { key: 'qty', header: t('fields.qty'), align: 'right' },
  { key: 'amount', header: t('fields.amount'), render: (r) => formatCurrency(r.amount), align: 'right' },
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
      setError(err instanceof Error ? err.message : t('reports.common.load_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [selectedEmployee, activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('reports.employee_item_wise_sales.employee_item_wise_sales')}</h1>
          <p className="text-sm text-muted-foreground">{t('reports.employee_item_wise_sales.subtitle')}</p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      <div className="relative max-w-sm">
        <div className="flex items-center border border-input rounded-md px-3 py-2 gap-2">
          <Search className="w-4 h-4 text-muted-foreground shrink-0" />
          <input
            type="text"
            placeholder={t('reports.employee_item_wise_sales.search_employee_by_name')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelectedEmployee(null);
              setData(null);
            }}
            className="flex-1 text-sm outline-none"
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
                className="w-full text-start px-3 py-2 text-sm hover:bg-blue-50"
              >
                {s.full_name}
              </button>
            ))}
          </div>
        )}
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

      {!selectedEmployee && !error && (
        <div className="text-sm text-muted-foreground">{t('reports.employee_item_wise_sales.empty_prompt')}</div>
      )}

      {isLoading && <ReportSkeleton />}

      {data && !isLoading && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <StatCard label={t('reports.employee_item_wise_sales.total_qty')} value={data.summary.total_qty} icon={<Package className="w-4 h-4" />} />
            <StatCard
              label={t('reports.employee_item_wise_sales.total_amount')}
              value={formatCurrency(data.summary.total_amount)}
              icon={<IndianRupee className="w-4 h-4" />}
            />
          </div>
          <DataTable columns={getColumns()} rows={data.items} isLoading={isLoading} />
        </>
      )}
    </div>
  );
}
