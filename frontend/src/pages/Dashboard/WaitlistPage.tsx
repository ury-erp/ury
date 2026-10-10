import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Hourglass,
  Plus,
  BellRing,
  Check,
  X,
  UserX,
  Users,
  Timer,
} from 'lucide-react';
import { Button, Input, Textarea, Badge, Spinner, showToast } from '@ury/ui';
import { parseFrappeError } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import SideDrawer from '../../components/layout/SideDrawer';
import { LoadErrorBanner } from '../../components/common/LoadErrorBanner';
import { subscribeRealtimeEvent } from '../../lib/realtimeClient';
import {
  waitlistService,
  type WaitlistEntry,
  type WaitlistSummary,
  type SuggestedTable,
  type WaitEstimate,
} from '../../services/waitlist';
import { t } from '../../i18n';

const STATUS_TONE: Record<string, 'success' | 'warning' | 'pending' | 'cancelled'> = {
  Waiting: 'pending',
  Notified: 'warning',
  Seated: 'success',
  Cancelled: 'cancelled',
  'No Show': 'cancelled',
};

/** A quote the host can read aloud: "about 25 minutes", or the honest alternative. */
function quoteText(estimate?: WaitEstimate): string {
  if (!estimate) return '—';
  if (estimate.reason === 'no_suitable_table') return t('dash.waitlist.no_table_fits');
  if (estimate.minutes === 0) return t('dash.waitlist.seat_now');
  return t('dash.waitlist.about_minutes', { count: String(estimate.minutes) });
}

const StatCard: React.FC<{ icon: React.ElementType; label: string; value: string }> = ({
  icon: Icon,
  label,
  value,
}) => (
  <div className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3">
    <span className="rounded-lg bg-primary-50 p-2 text-primary-700">
      <Icon className="h-4 w-4" />
    </span>
    <div>
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-base font-bold text-gray-900">{value}</p>
    </div>
  </div>
);

export const WaitlistPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [summary, setSummary] = useState<WaitlistSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [seating, setSeating] = useState<WaitlistEntry | null>(null);
  const [tables, setTables] = useState<SuggestedTable[]>([]);
  const [quote, setQuote] = useState<WaitEstimate | null>(null);
  const [form, setForm] = useState({ guest_name: '', mobile_number: '', no_of_pax: '2', notes: '' });

  const fetch = useCallback(async () => {
    try {
      const [list, stats] = await Promise.all([
        waitlistService.getWaitlist(),
        waitlistService.getSummary(),
      ]);
      setEntries(list.entries ?? []);
      setSummary(stats);
      setLoadError(false);
    } catch {
      // An empty queue and an unreadable one must not look the same: a host
      // who believes nobody is waiting will seat walk-ins past the queue.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetch();
  }, [fetch, activeBranchId]);

  /**
   * The queue moves when a bill is settled somewhere else in the building,
   * so the screen has to hear about it rather than wait to be reopened.
   */
  useEffect(() => {
    if (!activeBranchId || activeBranchId === 'all') return;
    return subscribeRealtimeEvent(`ury_waitlist_${activeBranchId}`, (payload: any) => {
      void fetch();
      if (payload?.event === 'table_free' && payload?.guest_name) {
        showToast.success(
          t('dash.waitlist.table_free_toast', {
            table: String(payload.table),
            guest: String(payload.guest_name),
          }),
        );
      }
    });
  }, [activeBranchId, fetch]);

  // The quote shown while writing a party down is the one that gets recorded,
  // so it is fetched for the size actually typed rather than assumed.
  useEffect(() => {
    if (!drawerOpen) return;
    const pax = parseInt(form.no_of_pax, 10);
    if (!pax || pax < 1) {
      setQuote(null);
      return;
    }
    let cancelled = false;
    waitlistService
      .quote(pax)
      .then((result) => !cancelled && setQuote(result))
      .catch(() => !cancelled && setQuote(null));
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, form.no_of_pax]);

  const waitingGuests = useMemo(
    () => entries.filter((e) => e.status === 'Waiting' || e.status === 'Notified'),
    [entries],
  );

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.guest_name.trim()) return;

    setSaving(true);
    try {
      await waitlistService.join({
        guest_name: form.guest_name.trim(),
        mobile_number: form.mobile_number || undefined,
        no_of_pax: parseInt(form.no_of_pax, 10) || 2,
        notes: form.notes || undefined,
        quoted_minutes: quote?.minutes ?? null,
      });
      setDrawerOpen(false);
      setForm({ guest_name: '', mobile_number: '', no_of_pax: '2', notes: '' });
      showToast.success(t('dash.waitlist.added'));
      await fetch();
    } catch (error) {
      showToast.error(parseFrappeError(error, t('dash.waitlist.save_failed')));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (entry: WaitlistEntry, status: string, table?: string) => {
    try {
      await waitlistService.setStatus(entry.name, status, table);
      setSeating(null);
      await fetch();
    } catch (error) {
      showToast.error(parseFrappeError(error, t('dash.waitlist.save_failed')));
    }
  };

  const openSeating = async (entry: WaitlistEntry) => {
    setSeating(entry);
    setTables([]);
    try {
      setTables(await waitlistService.suggestTables(entry.name));
    } catch {
      // The picker still opens: the host can seat from the table screen and
      // mark the party seated afterwards.
      setTables([]);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Hourglass className="h-5 w-5 text-primary" />
            {t('dash.waitlist.title')}
          </h1>
          <p className="text-sm text-gray-500">
            {t('dash.waitlist.subtitle', { count: String(summary?.guests_waiting ?? 0) })}
          </p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus className="me-2 h-4 w-4" />
          {t('dash.waitlist.add')}
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label={t('dash.waitlist.stats.waiting')}
            value={String(summary.waiting)}
          />
          <StatCard
            icon={Timer}
            label={t('dash.waitlist.stats.average_wait')}
            value={t('dash.waitlist.minutes', { count: String(summary.average_wait) })}
          />
          <StatCard
            icon={Check}
            label={t('dash.waitlist.stats.seated_today')}
            value={String(summary.seated_today)}
          />
          <StatCard
            icon={Hourglass}
            label={t('dash.waitlist.stats.turn')}
            value={t('dash.waitlist.minutes', { count: String(summary.turn_minutes) })}
          />
        </div>
      )}

      {summary && summary.average_quote > 0 && summary.average_wait > 0 && (
        <p className="rounded-xl bg-gray-50 p-3 text-xs text-gray-600">
          {t('dash.waitlist.quote_accuracy', {
            quoted: String(summary.average_quote),
            actual: String(summary.average_wait),
          })}
        </p>
      )}

      {loadError && <LoadErrorBanner onRetry={() => void fetch()} />}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : waitingGuests.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500">{t('dash.waitlist.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-start text-sm text-gray-600">
            <thead className="border-b bg-gray-50 text-xs font-semibold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">{t('dash.waitlist.guest')}</th>
                <th className="px-4 py-3">{t('dash.waitlist.pax')}</th>
                <th className="px-4 py-3">{t('dash.waitlist.waited')}</th>
                <th className="px-4 py-3">{t('dash.waitlist.estimate')}</th>
                <th className="px-4 py-3">{t('dash.waitlist.status')}</th>
                <th className="px-4 py-3 text-end">{t('dash.waitlist.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {waitingGuests.map((entry) => (
                <tr key={entry.name} className="hover:bg-primary/5">
                  <td className="px-4 py-3 font-bold text-gray-900">{entry.position}</td>
                  <td className="px-4 py-3">
                    <span className="block font-medium text-gray-900">{entry.guest_name}</span>
                    {entry.mobile_number && (
                      <span className="block text-xs text-gray-500" dir="ltr">
                        {entry.mobile_number}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">{entry.no_of_pax}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        entry.quoted_minutes > 0 && entry.waited_minutes > entry.quoted_minutes
                          ? 'font-semibold text-red-700'
                          : ''
                      }
                    >
                      {t('dash.waitlist.minutes', { count: String(entry.waited_minutes) })}
                    </span>
                  </td>
                  <td className="px-4 py-3">{quoteText(entry.estimate)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={STATUS_TONE[entry.status] ?? 'outline'}>
                      {t(`dash.waitlist.statuses.${entry.status.replace(' ', '_').toLowerCase()}`)}
                    </Badge>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {entry.status === 'Waiting' && (
                        <Button
                          size="xs"
                          variant="outline"
                          onClick={() => setStatus(entry, 'Notified')}
                        >
                          <BellRing className="me-1 h-3.5 w-3.5" />
                          {t('dash.waitlist.notify')}
                        </Button>
                      )}
                      <Button size="xs" onClick={() => openSeating(entry)}>
                        <Check className="me-1 h-3.5 w-3.5" />
                        {t('dash.waitlist.seat')}
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setStatus(entry, 'No Show')}
                        title={t('dash.waitlist.no_show')}
                        aria-label={t('dash.waitlist.no_show')}
                      >
                        <UserX className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="xs"
                        variant="ghost"
                        onClick={() => setStatus(entry, 'Cancelled')}
                        title={t('dash.waitlist.cancel')}
                        aria-label={t('dash.waitlist.cancel')}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SideDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title={t('dash.waitlist.add')}>
        <form className="space-y-4" onSubmit={handleJoin}>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">{t('dash.waitlist.guest')}</label>
            <Input
              value={form.guest_name}
              onChange={(e) => setForm({ ...form, guest_name: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">{t('dash.waitlist.pax')}</label>
              <Input
                type="number"
                min={1}
                value={form.no_of_pax}
                onChange={(e) => setForm({ ...form, no_of_pax: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-gray-700">{t('dash.waitlist.mobile')}</label>
              <Input
                value={form.mobile_number}
                onChange={(e) => setForm({ ...form, mobile_number: e.target.value })}
              />
            </div>
          </div>

          <div className="rounded-xl bg-primary-50 p-3 text-sm text-primary-900">
            <p className="font-semibold">{t('dash.waitlist.tell_the_guest')}</p>
            <p>{quote ? quoteText(quote) : '—'}</p>
            {quote?.minutes != null && quote.suitable_tables > 0 && (
              <p className="mt-1 text-xs text-primary-800">
                {t('dash.waitlist.quote_basis', {
                  tables: String(quote.suitable_tables),
                  turn: String(quote.turn_minutes),
                })}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-gray-700">{t('dash.waitlist.notes')}</label>
            <Textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>

          <Button type="submit" fullWidth loading={saving} disabled={!form.guest_name.trim()}>
            {t('dash.waitlist.add')}
          </Button>
        </form>
      </SideDrawer>

      <SideDrawer
        isOpen={Boolean(seating)}
        onClose={() => setSeating(null)}
        title={t('dash.waitlist.seat_title', { guest: seating?.guest_name ?? '' })}
      >
        {tables.length === 0 ? (
          <p className="text-sm text-gray-500">{t('dash.waitlist.no_tables_yet')}</p>
        ) : (
          <ul className="space-y-2">
            {tables.map((table) => (
              <li key={table.name}>
                <button
                  type="button"
                  onClick={() => seating && setStatus(seating, 'Seated', table.name)}
                  disabled={table.occupied}
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 p-3 text-start hover:border-primary-400 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span>
                    <span className="block font-medium text-gray-900">{table.name}</span>
                    <span className="block text-xs text-gray-500">
                      {t('dash.waitlist.seats', { count: String(table.no_of_seats) })}
                      {table.restaurant_room ? ` · ${table.restaurant_room}` : ''}
                    </span>
                  </span>
                  <Badge variant={table.occupied ? 'warning' : 'success'}>
                    {table.occupied
                      ? t('dash.waitlist.free_in', { count: String(table.free_in_minutes) })
                      : t('dash.waitlist.free_now')}
                  </Badge>
                </button>
              </li>
            ))}
          </ul>
        )}
      </SideDrawer>
    </div>
  );
};

export default WaitlistPage;
