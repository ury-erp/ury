import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { Gauge, IndianRupee, Receipt } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { LineChartCard } from '../../components/reports/charts/LineChartCard';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';

interface ABVRow {
  date: string;
  bill_count: number;
  total_sales: number;
  abv: number;
}

interface AverageBillValueData {
  data: ABVRow[];
  summary: { total_bills: number; total_sales: number; average_abv: number };
}

const columns: DataTableColumn<ABVRow>[] = [
  { key: 'date', header: 'Date' },
  { key: 'bill_count', header: 'Bills', align: 'right' },
  { key: 'total_sales', header: 'Total Sales', render: (r) => formatCurrency(r.total_sales), align: 'right' },
  { key: 'abv', header: 'ABV', render: (r) => formatCurrency(r.abv), align: 'right' },
];

export function AverageBillValue() {
  const { activeBranchId } = useBranchContext();
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [data, setData] = useState<AverageBillValueData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: AverageBillValueData }>('ury.ury.report_api.sales.get_average_bill_value', {
        branch,
        start_date: toApiDate(range.from),
        end_date: toApiDate(range.to),
      });
      setData(res.message ?? (res as unknown as AverageBillValueData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Average Bill Value</h1>
          <p className="text-sm text-muted-foreground">
            Daily average bill trend {activeBranchId === 'all' ? '· All Branches' : ''}
          </p>
        </div>
        <DateRangeFilter value={range} onChange={setRange} />
      </div>

      {error && (
        <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading && !data ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total Bills" value={data.summary.total_bills} icon={<Receipt className="w-4 h-4" />} />
            <StatCard
              label="Total Sales"
              value={formatCurrency(data.summary.total_sales)}
              icon={<IndianRupee className="w-4 h-4" />}
            />
            <StatCard
              label="Average Bill Value"
              value={formatCurrency(data.summary.average_abv)}
              icon={<Gauge className="w-4 h-4" />}
            />
          </div>

          <LineChartCard title="ABV Trend" data={data.data} xKey="date" yKeys={['abv']} labels={{ abv: 'Avg Bill Value' }} />

          <DataTable columns={columns} rows={data.data} isLoading={isLoading} />
        </>
      ) : null}
    </div>
  );
}
