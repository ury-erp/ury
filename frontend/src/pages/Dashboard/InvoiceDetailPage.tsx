import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowRight,
  Ban,
  ChefHat,
  CircleDot,
  Clock,
  ExternalLink,
  MessageSquare,
  Printer,
  Receipt,
  RefreshCw,
  Users,
  Wallet,
} from 'lucide-react';
import { formatCurrency, getIntlLocale, parseFrappeError } from '@ury/core';
import { Badge, Button, Card, ErrorState, Spinner, showToast } from '@ury/ui';
import { invoiceService, printViewUrl, type InvoiceActivity, type InvoiceDetail } from '../../services/invoices';
import {
  formatServerDate,
  formatServerTime,
  invoiceStatusLabel,
  invoiceStatusTone,
  orderTypeLabel,
} from '../../lib/statusLabels';
import { t } from '../../i18n';
import { useAccess } from '../../hooks/useAccess';

/**
 * One bill, in full: who, where, what was ordered, how it was paid, what the
 * kitchen received, and everything that happened to it — with a reprint for
 * the bill nobody printed.
 */

const qtyText = (qty: number) => (Number.isInteger(qty) ? String(qty) : qty.toFixed(2));

function dateTime(value: string, locale: string) {
  const [date, time] = value.split(' ');
  return `${formatServerDate(date, locale)} · ${formatServerTime(time, locale)}`;
}

const ACTIVITY_ICON: Record<InvoiceActivity['kind'], React.ReactNode> = {
  created: <Receipt className="w-3.5 h-3.5" />,
  activity: <CircleDot className="w-3.5 h-3.5" />,
  note: <MessageSquare className="w-3.5 h-3.5" />,
  cancelled: <Ban className="w-3.5 h-3.5" />,
};

export const InvoiceDetailPage: React.FC = () => {
  const { name = '' } = useParams();
  const navigate = useNavigate();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState('');
  const [printing, setPrinting] = useState<'' | 'browser' | 'printer' | 'qz'>('');
  const locale = getIntlLocale();
  // Desk links only for people allowed into Desk; the server redirects the rest anyway.
  const { access } = useAccess();

  const load = useCallback(async () => {
    setError('');
    try {
      setInvoice(await invoiceService.detail(name));
    } catch (err) {
      setError(parseFrappeError(err, t('dash.invoice.load_failed')));
    }
  }, [name]);

  useEffect(() => {
    void load();
  }, [load]);

  const print = async (channel: 'browser' | 'printer' | 'qz') => {
    if (!invoice) return;
    // Opened synchronously from the click, before any await, so the browser
    // does not treat it as an unrequested popup.
    const win = channel === 'browser' ? window.open(printViewUrl(invoice.name, invoice.print.format), '_blank') : null;
    if (channel === 'browser' && !win) {
      showToast.error(t('dash.invoice.popup_blocked'));
      return;
    }
    setPrinting(channel);
    try {
      await invoiceService.recordPrint(invoice.name, channel);
      showToast.success(
        channel === 'qz' ? t('dash.invoice.queued_qz') : channel === 'printer' ? t('dash.invoice.sent_to_printer') : t('dash.invoice.print_opened'),
      );
      await load();
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.invoice.print_failed')));
    } finally {
      setPrinting('');
    }
  };

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate('/dashboard'));

  if (error) {
    return (
      <ErrorState
        className="py-24"
        title={t('dash.invoice.load_failed')}
        description={error}
        retryLabel={t('common.retry')}
        onRetry={() => void load()}
      />
    );
  }

  if (!invoice) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  const tot = invoice.totals;
  const cancelled = invoice.docstatus === 2;
  const deskUrl = `/app/pos-invoice/${encodeURIComponent(invoice.name)}`;

  const InfoRow = ({ label, value }: { label: string; value?: React.ReactNode }) =>
    value ? (
      <div className="flex items-start justify-between gap-4 py-2 text-sm">
        <span className="text-gray-500">{label}</span>
        <span className="font-semibold text-gray-900 text-end">{value}</span>
      </div>
    ) : null;

  const TotalRow = ({ label, value, strong, tone }: { label: string; value: number; strong?: boolean; tone?: string }) => (
    <div className={`flex items-center justify-between py-1.5 ${strong ? 'text-base font-bold text-gray-900' : 'text-sm text-gray-600'}`}>
      <span>{label}</span>
      <span className={`tabular-nums ${tone || ''}`}>{formatCurrency(value)}</span>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Button variant="ghost" size="sm" onClick={back} className="mt-0.5 h-9 w-9 p-0" aria-label={t('common.back')}>
            <ArrowRight className="w-5 h-5 ltr:rotate-180" />
          </Button>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-gray-900">{invoice.name}</h1>
              <Badge variant={invoiceStatusTone(invoice.status)}>{invoiceStatusLabel(invoice.status)}</Badge>
              {!invoice.invoice_printed && !cancelled && (
                <Badge variant="warning" className="gap-1">
                  <Printer className="w-3 h-3" /> {t('dash.invoice.not_printed')}
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {dateTime(`${invoice.posting_date} ${invoice.posting_time}`, locale)}
              {invoice.order_number ? ` · ${t('dash.invoice.order_no', { number: invoice.order_number })}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} className="gap-1.5" aria-label={t('common.refresh')}>
            <RefreshCw className="w-4 h-4" />
          </Button>
          {access.desk && (
            <a href={deskUrl} target="_blank" rel="noopener noreferrer">
              <Button variant="outline" size="sm" className="gap-1.5">
                <ExternalLink className="w-4 h-4" /> {t('dash.invoice.open_in_system')}
              </Button>
            </a>
          )}
          {invoice.print.can_print && invoice.print.network_printers.length > 0 && (
            <Button variant="outline" size="sm" className="gap-1.5" disabled={!!printing} onClick={() => void print('printer')}>
              {printing === 'printer' ? <Spinner className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
              {t('dash.invoice.print_on_printer')}
            </Button>
          )}
          {invoice.print.can_print && invoice.print.qz && (
            <Button size="sm" className="gap-1.5 bg-primary text-white" disabled={!!printing} onClick={() => void print('qz')}>
              {printing === 'qz' ? <Spinner className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
              {invoice.invoice_printed ? t('dash.invoice.reprint_qz') : t('dash.invoice.print_qz')}
            </Button>
          )}
          {invoice.print.can_print && (
            <Button
              size="sm"
              variant={invoice.print.qz ? 'outline' : 'default'}
              className={`gap-1.5 ${invoice.print.qz ? '' : 'bg-primary text-white'}`}
              disabled={!!printing}
              onClick={() => void print('browser')}
              title={t('dash.invoice.browser_print_hint')}
            >
              {printing === 'browser' ? <Spinner className="w-4 h-4" /> : <Printer className="w-4 h-4" />}
              {invoice.invoice_printed ? t('dash.invoice.reprint') : t('dash.invoice.print')}
            </Button>
          )}
        </div>
      </div>

      {cancelled && (
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <Ban className="w-4 h-4 mt-0.5 shrink-0" />
          <span>
            {t('dash.invoice.cancelled_notice')}
            {invoice.cancel_reason ? ` — ${invoice.cancel_reason}` : ''}
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Items + totals */}
        <div className="lg:col-span-2 space-y-5">
          <Card className="overflow-hidden border border-gray-200">
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h2 className="text-sm font-bold text-gray-900">{t('dash.invoice.items')}</h2>
              <span className="text-xs text-gray-500">{t('dash.invoice.items_count', { count: invoice.items.length })}</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500">
                  <tr>
                    <th className="px-5 py-2.5 text-start">{t('fields.item')}</th>
                    <th className="px-3 py-2.5 text-center">{t('fields.qty')}</th>
                    <th className="px-3 py-2.5 text-end">{t('dash.quick_item.price')}</th>
                    <th className="px-5 py-2.5 text-end">{t('fields.amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {invoice.items.map((row, i) => (
                    <tr key={`${row.item_code}-${i}`}>
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-900">{row.item_name}</p>
                        {row.comment && <p className="mt-0.5 text-xs text-amber-700">{row.comment}</p>}
                      </td>
                      <td className="px-3 py-3 text-center tabular-nums">{qtyText(row.qty)}</td>
                      <td className="px-3 py-3 text-end tabular-nums text-gray-600 whitespace-nowrap">{formatCurrency(row.rate)}</td>
                      <td className="px-5 py-3 text-end tabular-nums font-semibold whitespace-nowrap">{formatCurrency(row.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-gray-100 bg-gray-50/60 px-5 py-4">
              <div className="ms-auto max-w-sm">
                <TotalRow label={t('dash.invoice.subtotal')} value={tot.total} />
                {tot.discount_amount > 0 && (
                  <TotalRow
                    label={tot.additional_discount_percentage ? `${t('dash.invoice.discount')} (${tot.additional_discount_percentage}%)` : t('dash.invoice.discount')}
                    value={-tot.discount_amount}
                    tone="text-red-600"
                  />
                )}
                {invoice.taxes.map((tax, i) => (
                  <TotalRow key={i} label={tax.description} value={tax.amount} />
                ))}
                {Math.abs(tot.rounding_adjustment) > 0.0001 && <TotalRow label={t('dash.invoice.rounding')} value={tot.rounding_adjustment} />}
                <div className="my-2 border-t border-gray-200" />
                <TotalRow label={t('dash.invoice.total')} value={tot.rounded_total || tot.grand_total} strong />
              </div>
            </div>
          </Card>

          {/* Payments */}
          <Card className="border border-gray-200 p-5">
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
              <Wallet className="w-4 h-4 text-primary" /> {t('dash.invoice.payments')}
            </h2>
            {invoice.payments.length === 0 ? (
              <p className="text-sm text-gray-500">{invoice.docstatus === 0 ? t('dash.invoice.not_paid_yet') : '—'}</p>
            ) : (
              <div className="max-w-sm">
                {invoice.payments.map((p) => (
                  <TotalRow key={p.mode_of_payment} label={p.mode_of_payment} value={p.amount} />
                ))}
                {tot.change_amount > 0 && <TotalRow label={t('dash.invoice.change_given')} value={tot.change_amount} tone="text-amber-700" />}
              </div>
            )}
          </Card>
        </div>

        {/* Side: details, kitchen, activity */}
        <div className="space-y-5">
          <Card className="border border-gray-200 px-5 py-3 divide-y divide-gray-100">
            <InfoRow label={t('dash.report_widgets.order_type')} value={orderTypeLabel(invoice.order_type)} />
            <InfoRow
              label={t('dash.report_widgets.table_location')}
              value={invoice.restaurant_table ? [invoice.restaurant_table, invoice.merged_tables].filter(Boolean).join('، ') : t('labels.counter')}
            />
            <InfoRow label={t('dash.report_widgets.customer')} value={invoice.customer_name || invoice.customer} />
            <InfoRow label={t('fields.mobile')} value={invoice.mobile_number} />
            <InfoRow label={t('dash.invoice.guests')} value={invoice.no_of_pax ? <span className="inline-flex items-center gap-1"><Users className="w-3.5 h-3.5" />{invoice.no_of_pax}</span> : null} />
            <InfoRow label={t('dash.invoice.captain')} value={invoice.waiter} />
            <InfoRow label={t('dash.invoice.cashier')} value={invoice.cashier} />
            <InfoRow label={t('dash.menu.branch')} value={invoice.branch} />
          </Card>

          {invoice.comments && (
            <Card className="border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <p className="mb-1 text-xs font-bold">{t('dash.invoice.order_note')}</p>
              {invoice.comments}
            </Card>
          )}

          {invoice.kots.length > 0 && (
            <Card className="border border-gray-200 p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
                <ChefHat className="w-4 h-4 text-primary" /> {t('dash.invoice.kitchen_tickets')}
              </h2>
              <ul className="space-y-2">
                {invoice.kots.map((k) => (
                  <li key={k.name} className="flex items-center justify-between gap-2 text-xs">
                    <span className="font-semibold text-gray-800">{k.production || k.name}</span>
                    <span className="text-gray-500">
                      {k.type ? `${k.type} · ` : ''}
                      {formatServerTime(k.creation.split(' ')[1], locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card className="border border-gray-200 p-5">
            <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-gray-900">
              <Clock className="w-4 h-4 text-primary" /> {t('dash.invoice.activity')}
            </h2>
            <ol className="relative space-y-4 border-s border-gray-200 ps-5">
              {invoice.activity.map((event, i) => (
                <li key={i} className="relative">
                  <span
                    className={`absolute -start-[1.85rem] top-0 flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-white ${
                      event.kind === 'cancelled' ? 'bg-red-100 text-red-600' : event.kind === 'note' ? 'bg-amber-100 text-amber-700' : 'bg-primary/10 text-primary'
                    }`}
                  >
                    {ACTIVITY_ICON[event.kind]}
                  </span>
                  <p className="text-sm text-gray-900">{event.text}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">
                    {[event.by, dateTime(event.at, locale)].filter(Boolean).join(' · ')}
                  </p>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default InvoiceDetailPage;
