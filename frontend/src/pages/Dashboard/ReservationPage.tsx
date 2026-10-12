import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { CalendarClock, Plus, Check, X, UserCheck } from 'lucide-react';
import { Button, Badge, Input, Spinner, showToast } from '@ury/ui';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';
import { LoadErrorBanner } from '../../components/common/LoadErrorBanner';
import { t } from '../../i18n';

interface Reservation {
  name: string;
  guest_name: string;
  mobile_number: string | null;
  table: string | null;
  restaurant_room: string | null;
  no_of_pax: number;
  reserved_from: string;
  reserved_to: string | null;
  status: string;
  notes: string | null;
}

interface AvailableTable {
  name: string;
  no_of_seats: number | null;
  restaurant_room: string | null;
  fits: boolean;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'outline'> = {
  Confirmed: 'success',
  Seated: 'warning',
  Requested: 'outline',
  Completed: 'outline',
  'No Show': 'outline',
  Cancelled: 'outline',
};

/** Local datetime in the shape a Frappe Datetime field expects. */
function toApiDatetime(value: string): string {
  return value ? value.replace('T', ' ') + ':00' : '';
}

function localDayBounds(day: string): { from: string; to: string } {
  return { from: `${day} 00:00:00`, to: `${day} 23:59:59` };
}

export const ReservationPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  const [rows, setRows] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableTables, setAvailableTables] = useState<AvailableTable[]>([]);

  const [form, setForm] = useState({
    guest_name: '',
    mobile_number: '',
    no_of_pax: '2',
    reserved_from: '',
    table: '',
    notes: '',
  });

  const fetchReservations = useCallback(async () => {
    setLoading(true);
    try {
      const bounds = localDayBounds(day);
      const res = await call<{ message: Reservation[] }>(
        'ury.ury.api.reservations.get_reservations',
        { from_date: bounds.from, to_date: bounds.to },
      );
      setRows(res.message ?? []);
      setLoadError(false);
    } catch {
      // An empty day and an unreadable one must not look the same: a host
      // seeing "no bookings" when the call failed will seat over them.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [day, activeBranchId]);

  useEffect(() => {
    fetchReservations();
  }, [fetchReservations]);

  // Only the tables actually free for the requested window are offered.
  // Letting a host pick any table and then refusing on save teaches them to
  // guess, which is what a booking book already does.
  useEffect(() => {
    if (!drawerOpen || !form.reserved_from) {
      setAvailableTables([]);
      return;
    }
    let cancelled = false;
    call<{ message: AvailableTable[] }>('ury.ury.api.reservations.get_available_tables', {
      reserved_from: toApiDatetime(form.reserved_from),
      no_of_pax: form.no_of_pax,
    })
      .then((res) => {
        if (!cancelled) setAvailableTables(res.message ?? []);
      })
      .catch(() => {
        if (!cancelled) setAvailableTables([]);
      });
    return () => {
      cancelled = true;
    };
  }, [drawerOpen, form.reserved_from, form.no_of_pax]);

  const handleCreateReservation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.guest_name || !form.reserved_from) return;

    setSaving(true);
    try {
      await call('ury.ury.api.reservations.create_reservation', {
        guest_name: form.guest_name,
        mobile_number: form.mobile_number || undefined,
        no_of_pax: parseInt(form.no_of_pax, 10) || 2,
        reserved_from: toApiDatetime(form.reserved_from),
        table: form.table || undefined,
        notes: form.notes || undefined,
      });
      showToast.success(t('dash.reservations.saved'));
      setDrawerOpen(false);
      setForm({ guest_name: '', mobile_number: '', no_of_pax: '2', reserved_from: '', table: '', notes: '' });
      fetchReservations();
    } catch (err) {
      // The clash message from the server names the guest already holding
      // the table, which is exactly what the host needs to hear.
      showToast.error(err instanceof Error ? err.message : t('dash.reservations.save_failed'));
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (reservation: string, status: string) => {
    try {
      await call('ury.ury.api.reservations.set_reservation_status', { reservation, status });
      fetchReservations();
    } catch (err) {
      showToast.error(err instanceof Error ? err.message : t('dash.reservations.save_failed'));
    }
  };

  const expected = useMemo(
    () => rows.filter((r) => ['Requested', 'Confirmed'].includes(r.status)).reduce((n, r) => n + r.no_of_pax, 0),
    [rows],
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-gray-200">
        <div>
          <h1 className="text-xl font-semibold flex items-center gap-2">
            <CalendarClock className="w-5 h-5 text-primary" />
            {t('dash.reservations.title')}
          </h1>
          <p className="text-sm text-gray-500">
            {t('dash.reservations.covers_expected', { count: expected })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} className="w-44" />
          <Button onClick={() => setDrawerOpen(true)} className="bg-primary text-white">
            <Plus className="w-4 h-4 me-2" />
            {t('dash.reservations.new')}
          </Button>
        </div>
      </div>

      {loadError && <LoadErrorBanner onRetry={fetchReservations} />}

      {loading ? (
        <div className="flex justify-center py-12"><Spinner /></div>
      ) : rows.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-500">{t('dash.reservations.none_today')}</p>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <table className="w-full text-start text-sm text-gray-600">
            <thead className="bg-gray-50 border-b text-xs uppercase text-gray-500 font-semibold">
              <tr>
                <th className="px-5 py-3">{t('dash.reservations.time')}</th>
                <th className="px-5 py-3">{t('dash.reservations.guest')}</th>
                <th className="px-5 py-3">{t('dash.reservations.pax')}</th>
                <th className="px-5 py-3">{t('dash.reservations.table')}</th>
                <th className="px-5 py-3">{t('dash.reservations.status')}</th>
                <th className="px-5 py-3 text-end">{t('dash.reservations.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((r) => (
                <tr key={r.name} className="hover:bg-primary/5">
                  <td className="px-5 py-3 font-mono">{r.reserved_from.slice(11, 16)}</td>
                  <td className="px-5 py-3">
                    <div className="font-semibold text-gray-900">{r.guest_name}</div>
                    {r.mobile_number && <div className="text-xs text-gray-500">{r.mobile_number}</div>}
                    {r.notes && <div className="text-xs text-amber-700">{r.notes}</div>}
                  </td>
                  <td className="px-5 py-3 font-mono">{r.no_of_pax}</td>
                  <td className="px-5 py-3">{r.table || '—'}</td>
                  <td className="px-5 py-3">
                    <Badge variant={STATUS_TONE[r.status] ?? 'outline'} size="sm">
                      {t(`dash.reservations.statuses.${r.status}`)}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-end">
                    {['Requested', 'Confirmed'].includes(r.status) && (
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" title={t('dash.reservations.seat')} onClick={() => setStatus(r.name, 'Seated')}>
                          <UserCheck className="w-4 h-4 text-green-600" />
                        </Button>
                        <Button variant="ghost" size="sm" title={t('dash.reservations.no_show')} onClick={() => setStatus(r.name, 'No Show')}>
                          <X className="w-4 h-4 text-gray-500" />
                        </Button>
                      </div>
                    )}
                    {r.status === 'Seated' && (
                      <Button variant="ghost" size="sm" title={t('dash.reservations.complete')} onClick={() => setStatus(r.name, 'Completed')}>
                        <Check className="w-4 h-4 text-green-600" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SideDrawer isOpen={drawerOpen} onClose={() => setDrawerOpen(false)} title={t('dash.reservations.new')}>
        <form onSubmit={handleCreateReservation} className="space-y-4">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('dash.reservations.guest')}</label>
            <Input value={form.guest_name} onChange={(e) => setForm({ ...form, guest_name: e.target.value })} required />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('dash.reservations.mobile')}</label>
            <Input value={form.mobile_number} onChange={(e) => setForm({ ...form, mobile_number: e.target.value })} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('dash.reservations.pax')}</label>
              <Input type="number" min={1} value={form.no_of_pax} onChange={(e) => setForm({ ...form, no_of_pax: e.target.value })} />
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">{t('dash.reservations.time')}</label>
              <Input type="datetime-local" value={form.reserved_from} onChange={(e) => setForm({ ...form, reserved_from: e.target.value })} required />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('dash.reservations.table')}</label>
            <SearchableSelect
              id="reservation_table"
              value={form.table}
              onChange={(_, value) => setForm({ ...form, table: value })}
              options={[
                { value: '', label: t('dash.reservations.any_table') },
                ...availableTables.map((tbl) => ({
                  value: tbl.name,
                  label: tbl.fits ? `${tbl.name} (${tbl.no_of_seats ?? '?'})` : `${tbl.name} (${tbl.no_of_seats ?? '?'}) — ${t('dash.reservations.too_small')}`,
                })),
              ]}
            />
            <p className="mt-1 text-xs text-gray-500">{t('dash.reservations.only_free_shown')}</p>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1">{t('dash.reservations.notes')}</label>
            <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder={t('dash.reservations.notes_hint')} />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={() => setDrawerOpen(false)} disabled={saving}>
              {t('dash.reservations.cancel')}
            </Button>
            <Button type="submit" className="bg-primary text-white" disabled={saving}>
              {t('dash.reservations.save')}
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default ReservationPage;
