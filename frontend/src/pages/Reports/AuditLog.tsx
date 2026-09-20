import { useCallback, useEffect, useMemo, useState } from 'react';
import { call, formatCurrency } from '@ury/core';
import { StatCard, DataTable, type DataTableColumn } from '@ury/ui';
import { AlertCircle, ShieldAlert, Percent, Ban } from 'lucide-react';
import { DateRangeFilter, type DateRangeValue } from '../../components/reports/DateRangeFilter';
import { toApiDate } from '../../lib/reportDate';
import { startOfMonth, endOfDay } from 'date-fns';
import { t } from '../../i18n';

interface AuditRow {
  name: string;
  event: string;
  reference_doctype: string | null;
  reference_name: string | null;
  branch: string | null;
  pos_profile: string | null;
  amount: number | null;
  performed_by: string | null;
  occurred_at: string | null;
  old_value: string | null;
  new_value: string | null;
  reason: string | null;
  details: string | null;
}

interface SummaryRow {
  event: string;
  count: number;
  total: number;
}

/**
 * Who did what to money, and what it was worth.
 *
 * The two numbers at the top are the question a manager actually opens this
 * with — how much was discounted, how much was voided — because a list of
 * rows to add up by eye is not an answer.
 */
const getColumns = (): DataTableColumn<AuditRow>[] => [
  {
    key: 'occurred_at',
    header: t('reports.audit_log.when'),
    render: (r) => (r.occurred_at ? r.occurred_at.replace('T', ' ').slice(0, 16) : '—'),
  },
  { key: 'event', header: t('reports.audit_log.event'), render: (r) => t(`audit.events.${r.event}`) },
  { key: 'performed_by', header: t('reports.audit_log.by'), render: (r) => r.performed_by || '—' },
  { key: 'reference_name', header: t('reports.audit_log.reference'), render: (r) => r.reference_name || '—' },
  {
    key: 'amount',
    header: t('reports.audit_log.amount'),
    align: 'right',
    render: (r) => (r.amount ? formatCurrency(r.amount) : '—'),
  },
  {
    key: 'old_value',
    header: t('reports.audit_log.change'),
    render: (r) =>
      r.old_value || r.new_value ? `${r.old_value ?? '—'} → ${r.new_value ?? '—'}` : '—',
  },
  { key: 'reason', header: t('reports.audit_log.reason'), render: (r) => r.reason || '—' },
];

export function AuditLog() {
  const [range, setRange] = useState<DateRangeValue>(() => ({
    from: startOfMonth(new Date()),
    to: endOfDay(new Date()),
  }));
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [summary, setSummary] = useState<SummaryRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      setError(null);
      const params = { from_date: toApiDate(range.from), to_date: toApiDate(range.to) };
      const [logRes, summaryRes] = await Promise.all([
        call<{ message: AuditRow[] }>('ury.ury.api.audit.get_audit_log', { ...params, limit: 200 }),
        call<{ message: SummaryRow[] }>('ury.ury.api.audit.get_audit_summary', params),
      ]);
      setRows(logRes.message ?? []);
      setSummary(summaryRes.message ?? []);
    } catch (err) {
      // Not `setRows([])`: an empty trail and an unreadable one must not look
      // the same, least of all on the screen whose job is oversight.
      setError(err instanceof Error ? err.message : t('reports.common.load_failed'));
    } finally {
      setIsLoading(false);
    }
  }, [range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const discounted = useMemo(
    () => summary.find((s) => s.event === 'Discount Applied'),
    [summary],
  );
  const cancelled = useMemo(
    () => summary.find((s) => s.event === 'Invoice Cancelled'),
    [summary],
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold">{t('reports.audit_log.audit_log')}</h1>
          <p className="text-sm text-muted-foreground">{t('reports.audit_log.subtitle')}</p>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label={t('reports.audit_log.discount_given')}
          value={formatCurrency(discounted?.total ?? 0)}
          icon={<Percent className="w-4 h-4" />}
        />
        <StatCard
          label={t('reports.audit_log.value_cancelled')}
          value={formatCurrency(cancelled?.total ?? 0)}
          icon={<Ban className="w-4 h-4" />}
        />
        <StatCard
          label={t('reports.audit_log.events_recorded')}
          value={summary.reduce((sum, s) => sum + s.count, 0)}
          icon={<ShieldAlert className="w-4 h-4" />}
        />
      </div>

      <DataTable
        columns={getColumns()}
        rows={rows}
        isLoading={isLoading}
        emptyMessage={t('reports.audit_log.nothing_recorded')}
      />
    </div>
  );
}
