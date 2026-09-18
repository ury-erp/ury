import { useCallback, useEffect, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard } from '@ury/ui';
import { Receipt, IndianRupee, Percent, Sigma, Equal, BadgePercent, AlertCircle } from 'lucide-react';
import { useBranchContext } from '../../context/BranchContext';
import { toApiDate } from '../../lib/reportDate';
import { DatePicker } from '../../components/setup/DatePicker';
import { t } from '../../i18n';
import { ReportSkeleton } from '../../components/reports/ReportSkeleton';

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
      setError(err instanceof Error ? err.message : t('reports.common.load_failed'));
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
          <h1 className="text-xl font-semibold">{t('reports.todays_sales.today_s_sales')}</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.day_of_week}, ${data.query_date}` : t('reports.todays_sales.subtitle')}
            {activeBranchId === 'all' ? ' · All Branches' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <DatePicker
            id="todays-sales-date"
            value={date}
            maxDate={toApiDate(new Date())}
            onChange={(_id, val) => setDate(val)}
            className="w-36"
          />
          {data && (
            <span className="text-xs text-muted-foreground">
              Updated {new Date(data.last_updated_at).toLocaleTimeString()}
            </span>
          )}
        </div>
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

      {isLoading && !data ? (
        <ReportSkeleton />
      ) : data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatCard label={t('reports.todays_sales.total_invoices')} value={data.total_invoices} icon={<Receipt className="w-4 h-4" />} />
          <StatCard
            label={t('reports.todays_sales.item_total')}
            value={formatCurrency(data.item_total)}
            icon={<IndianRupee className="w-4 h-4" />}
          />
          <StatCard
            label={t('reports.todays_sales.total_taxes_charges')}
            value={formatCurrency(data.total_taxes_and_charges)}
            icon={<Percent className="w-4 h-4" />}
          />
          <StatCard
            label={t('reports.todays_sales.grand_total')}
            value={formatCurrency(data.grand_total)}
            icon={<Sigma className="w-4 h-4" />}
            className="border-primary-200"
          />
          <StatCard
            label={t('reports.todays_sales.round_off')}
            value={formatCurrency(data.round_off)}
            icon={<Equal className="w-4 h-4" />}
          />
          <StatCard
            label={t('reports.todays_sales.cash_discounts')}
            value={formatCurrency(data.cash_discounts)}
            icon={<BadgePercent className="w-4 h-4" />}
            delta={
              data.cash_discounts !== 0
                ? { value: data.cash_discounts < 0 ? 'given away' : 'owed to house', direction: data.cash_discounts < 0 ? 'down' : 'up' }
                : undefined
            }
          />
        </div>
      ) : null}
    </div>
  );
}
