import React, { useCallback, useEffect, useState } from 'react';
import { Bike, Clock, Wallet, AlertTriangle, Phone, MapPin, Check, X } from 'lucide-react';
import { Button, Badge, Textarea, Spinner, showToast } from '@ury/ui';
import { formatCurrency, parseFrappeError } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import SideDrawer from '../../components/layout/SideDrawer';
import { LoadErrorBanner } from '../../components/common/LoadErrorBanner';
import {
  deliveryService,
  type DeliveryRow,
  type DriverRow,
  type DeliverySummary,
} from '../../services/delivery';
import { t } from '../../i18n';

/** The board's columns, in the order an order actually moves through them. */
const COLUMNS = ['Pending', 'Assigned', 'On The Way'] as const;
type Column = (typeof COLUMNS)[number];

const COLUMN_KEY: Record<Column, string> = {
  Pending: 'pending',
  Assigned: 'assigned',
  'On The Way': 'on_the_way',
};

/** How long this has been out, shouted only when it is actually late. */
const Elapsed: React.FC<{ row: DeliveryRow }> = ({ row }) => (
  <span
    className={`inline-flex items-center gap-1 text-xs font-medium ${
      row.lateness.late ? 'text-red-700' : 'text-gray-500'
    }`}
  >
    <Clock className="h-3.5 w-3.5" />
    {t('dash.delivery.minutes', { count: String(row.elapsed_minutes) })}
    {row.lateness.late && (
      <span>
        ·{' '}
        {row.lateness.against === 'promise'
          ? t('dash.delivery.over_promise', { count: String(row.lateness.over_by) })
          : t('dash.delivery.very_late')}
      </span>
    )}
  </span>
);

export const DeliveryPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [summary, setSummary] = useState<DeliverySummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [assigning, setAssigning] = useState<DeliveryRow | null>(null);
  const [failing, setFailing] = useState<DeliveryRow | null>(null);
  const [reason, setReason] = useState('');

  const fetch = useCallback(async () => {
    try {
      const [board, people, stats] = await Promise.all([
        deliveryService.board(),
        deliveryService.drivers(),
        deliveryService.summary(),
      ]);
      setRows(board.deliveries ?? []);
      setDrivers(people ?? []);
      setSummary(stats);
      setLoadError(false);
    } catch {
      // An empty board and an unreachable one look identical, and only one of
      // them means there is nothing to deliver.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void fetch();
  }, [fetch, activeBranchId]);

  // Times on this board age on their own, so it reloads even when nobody
  // touches it — a dispatcher watching the screen must not see 20 minutes
  // when the order has been out for 50.
  useEffect(() => {
    const timer = window.setInterval(() => void fetch(), 60_000);
    return () => window.clearInterval(timer);
  }, [fetch]);

  const act = async (work: () => Promise<unknown>) => {
    try {
      await work();
      await fetch();
    } catch (error) {
      showToast.error(parseFrappeError(error, t('dash.delivery.action_failed')));
    }
  };

  const settle = (driver: DriverRow) =>
    act(async () => {
      const result = await deliveryService.settleCash(driver.name);
      showToast.success(
        t('dash.delivery.cash_settled', {
          amount: formatCurrency(result.amount),
          driver: driver.driver_name,
        }),
      );
    });

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 border-b border-gray-200 pb-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-semibold">
            <Bike className="h-5 w-5 text-primary" />
            {t('dash.delivery.title')}
          </h1>
          <p className="text-sm text-gray-500">{t('dash.delivery.subtitle')}</p>
        </div>
        <Button variant="outline" onClick={() => window.open('/app/ury-delivery-zone', '_blank', 'noopener')}>
          {t('dash.delivery.zones')}
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">{t('dash.delivery.stats.open')}</p>
            <p className="text-lg font-bold text-gray-900">{summary.open}</p>
          </div>
          <div className={`rounded-xl border p-3 ${summary.late > 0 ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-white'}`}>
            <p className="text-xs text-gray-500">{t('dash.delivery.stats.late')}</p>
            <p className={`text-lg font-bold ${summary.late > 0 ? 'text-red-700' : 'text-gray-900'}`}>
              {summary.late}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">{t('dash.delivery.stats.on_time')}</p>
            <p className="text-lg font-bold text-gray-900">
              {summary.on_time_rate === null ? '—' : `${summary.on_time_rate}%`}
            </p>
          </div>
          <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-xs text-gray-500">{t('dash.delivery.stats.cash')}</p>
            <p className="text-lg font-bold text-gray-900">
              {formatCurrency(summary.cash_with_drivers)}
            </p>
          </div>
        </div>
      )}

      {loadError && <LoadErrorBanner onRetry={() => void fetch()} />}

      {loading ? (
        <div className="flex justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {COLUMNS.map((column) => {
            const columnRows = rows.filter((row) => row.status === column);
            return (
              <section key={column} className="space-y-3">
                <h2 className="flex items-center justify-between text-sm font-semibold text-gray-800">
                  {t(`dash.delivery.columns.${COLUMN_KEY[column]}`)}
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs">
                    {columnRows.length}
                  </span>
                </h2>

                {columnRows.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-xs text-gray-500">
                    {t('dash.delivery.column_empty')}
                  </p>
                ) : (
                  <ul className="space-y-3">
                    {columnRows.map((row) => (
                      <li
                        key={row.name}
                        className={`rounded-xl border bg-white p-3 ${
                          row.lateness.late ? 'border-red-300' : 'border-gray-200'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate font-medium text-gray-900">
                              {row.customer_name || row.invoice}
                            </p>
                            <p className="flex items-start gap-1 text-xs text-gray-500">
                              <MapPin className="mt-0.5 h-3 w-3 shrink-0" />
                              <span className="line-clamp-2">{row.address}</span>
                            </p>
                          </div>
                          {Boolean(row.cash_on_delivery) && (
                            <Badge variant="warning">
                              {formatCurrency(row.order_total + row.delivery_fee)}
                            </Badge>
                          )}
                        </div>

                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          <Elapsed row={row} />
                          {row.mobile_number && (
                            <a
                              href={`tel:${row.mobile_number}`}
                              className="inline-flex items-center gap-1 text-xs font-medium text-primary-700"
                              dir="ltr"
                            >
                              <Phone className="h-3 w-3" />
                              {row.mobile_number}
                            </a>
                          )}
                        </div>

                        {row.driver && (
                          <p className="mt-1 text-xs text-gray-600">
                            {t('dash.delivery.with_driver', { driver: row.driver })}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {column === 'Pending' && (
                            <Button size="xs" onClick={() => setAssigning(row)}>
                              {t('dash.delivery.assign')}
                            </Button>
                          )}
                          {column === 'Assigned' && (
                            <>
                              <Button
                                size="xs"
                                onClick={() => act(() => deliveryService.setStatus(row.name, 'On The Way'))}
                              >
                                {t('dash.delivery.depart')}
                              </Button>
                              <Button size="xs" variant="outline" onClick={() => setAssigning(row)}>
                                {t('dash.delivery.change_driver')}
                              </Button>
                            </>
                          )}
                          {column === 'On The Way' && (
                            <Button
                              size="xs"
                              onClick={() => act(() => deliveryService.setStatus(row.name, 'Delivered'))}
                            >
                              <Check className="me-1 h-3.5 w-3.5" />
                              {t('dash.delivery.delivered')}
                            </Button>
                          )}
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => {
                              setFailing(row);
                              setReason('');
                            }}
                          >
                            <X className="me-1 h-3.5 w-3.5" />
                            {t('dash.delivery.failed')}
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <section className="space-y-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-800">
          <Wallet className="h-4 w-4 text-primary" />
          {t('dash.delivery.drivers')}
        </h2>
        {drivers.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
            {t('dash.delivery.no_drivers')}
          </p>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {drivers.map((driver) => (
              <li
                key={driver.name}
                className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 bg-white p-3"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900">{driver.driver_name}</p>
                  <p className="text-xs text-gray-500">
                    {t('dash.delivery.carrying', { count: String(driver.open_deliveries) })}
                    {driver.cash_held > 0
                      ? ` · ${t('dash.delivery.holds_cash', { amount: formatCurrency(driver.cash_held) })}`
                      : ''}
                  </p>
                </div>
                {driver.cash_held > 0 && (
                  <Button size="xs" variant="outline" onClick={() => settle(driver)}>
                    {t('dash.delivery.settle_cash')}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <SideDrawer
        isOpen={Boolean(assigning)}
        onClose={() => setAssigning(null)}
        title={t('dash.delivery.assign')}
      >
        {drivers.length === 0 ? (
          <p className="text-sm text-gray-500">{t('dash.delivery.no_drivers')}</p>
        ) : (
          <ul className="space-y-2">
            {drivers.map((driver) => (
              <li key={driver.name}>
                <button
                  type="button"
                  onClick={() =>
                    assigning &&
                    act(async () => {
                      await deliveryService.assign(assigning.name, driver.name);
                      setAssigning(null);
                    })
                  }
                  className="flex w-full items-center justify-between rounded-xl border border-gray-200 p-3 text-start hover:border-primary-400"
                >
                  <span>
                    <span className="block font-medium text-gray-900">{driver.driver_name}</span>
                    <span className="block text-xs text-gray-500">
                      {t('dash.delivery.carrying', { count: String(driver.open_deliveries) })}
                    </span>
                  </span>
                  {driver.open_deliveries > 2 && (
                    <Badge variant="warning">{t('dash.delivery.busy')}</Badge>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </SideDrawer>

      <SideDrawer
        isOpen={Boolean(failing)}
        onClose={() => setFailing(null)}
        title={t('dash.delivery.failed')}
      >
        <div className="space-y-4">
          <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            {t('dash.delivery.reason_required')}
          </p>
          <Textarea rows={3} value={reason} onChange={(e) => setReason(e.target.value)} />
          <div className="flex gap-2">
            <Button
              fullWidth
              variant="outline"
              disabled={!reason.trim()}
              onClick={() =>
                failing &&
                act(async () => {
                  await deliveryService.setStatus(failing.name, 'Returned', reason);
                  setFailing(null);
                })
              }
            >
              {t('dash.delivery.returned')}
            </Button>
            <Button
              fullWidth
              variant="destructive"
              disabled={!reason.trim()}
              onClick={() =>
                failing &&
                act(async () => {
                  await deliveryService.setStatus(failing.name, 'Failed', reason);
                  setFailing(null);
                })
              }
            >
              {t('dash.delivery.failed')}
            </Button>
          </div>
        </div>
      </SideDrawer>
    </div>
  );
};

export default DeliveryPage;
