import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { KpiStrip, Input } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { toApiDate } from '../../lib/reportDate';

interface TodaySalesData {
  branch: string | null;
  query_date: string;
  day_of_week: string;
  total_invoices: number;
  item_total: number;
  total_taxes_and_charges: number;
  grand_total: number;
  round_off: number;
  cash_discounts: number;
  last_updated_at: string;
}

const REFRESH_INTERVAL_MS = 15000;

export function TodaysSales() {
  const { activeBranchId } = useBranchContext();
  const [date, setDate] = useState<string>(() => toApiDate(new Date()));
  const [data, setData] = useState<TodaySalesData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const branch = activeBranchId === 'all' ? undefined : activeBranchId;
      const res = await call<{ message: TodaySalesData }>('ury.ury.report_api.sales.get_today_sales', {
        branch,
        date,
      });
      setData(res.message ?? (res as unknown as TodaySalesData));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load report data.');
    } finally {
      setIsLoading(false);
    }
  }, [activeBranchId, date]);

  useEffect(() => {
    setIsLoading(true);
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const isToday = date === toApiDate(new Date());
    if (!isToday) return;
    const interval = setInterval(fetchData, REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [date, fetchData]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">Today's Sales</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.day_of_week}, ${data.query_date}` : 'Live sales snapshot'}
            {activeBranchId === 'all' ? ' · All Branches' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Input
            type="date"
            value={date}
            max={toApiDate(new Date())}
            onChange={(e) => setDate(e.target.value)}
          />
          {data && (
            <span className="text-xs text-muted-foreground">
              Updated {new Date(data.last_updated_at).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {error && (
        <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {isLoading && !data ? (
        <div className="text-sm text-muted-foreground">Loading...</div>
      ) : data ? (
        <KpiStrip
          items={[
            { label: 'Total Invoices', value: data.total_invoices },
            { label: 'Item Total', value: formatCurrency(data.item_total) },
            { label: 'Total Taxes & Charges', value: formatCurrency(data.total_taxes_and_charges) },
            { label: 'Grand Total', value: formatCurrency(data.grand_total) },
            { label: 'Round Off', value: formatCurrency(data.round_off) },
            {
              label: 'Cash Discounts',
              value: formatCurrency(data.cash_discounts),
              hint: data.cash_discounts !== 0 ? (data.cash_discounts < 0 ? 'given away' : 'owed to house') : undefined,
            },
          ]}
        />
      ) : null}
    </div>
  );
}
