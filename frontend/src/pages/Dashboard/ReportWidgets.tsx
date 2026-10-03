import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Printer, Search, X } from 'lucide-react';
import { formatCurrency, getIntlLocale, parseFrappeError } from '@ury/core';
import { Card, CardHeader, CardTitle, CardContent, Badge, Spinner, Input, Button } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { invoiceService, type InvoicePage } from '../../services/invoices';
import {
  formatServerDate,
  formatServerTime,
  invoiceStatusLabel,
  invoiceStatusTone,
  orderTypeLabel,
} from '../../lib/statusLabels';
import { t } from '../../i18n';

/**
 * The cashier's bills, filterable and paged, each opening its own page.
 *
 * Filters live in the URL (tx_* params) so opening a bill and pressing back
 * returns to the same filtered page instead of resetting to "today".
 */

type Preset = 'today' | 'yesterday' | 'week' | 'month' | 'custom';

const STATUS_OPTIONS = ['', 'Draft', 'Paid', 'Consolidated', 'Unpaid', 'Return', 'Cancelled'];
const ORDER_TYPES = ['', 'Dine In', 'Take Away', 'Delivery', 'Phone In', 'Aggregators'];
const PAGE_SIZES = [20, 50, 100];

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function presetRange(preset: Preset): [string, string] {
  const today = new Date();
  const day = (offset: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + offset);
    return iso(d);
  };
  switch (preset) {
    case 'yesterday':
      return [day(-1), day(-1)];
    case 'week':
      return [day(-6), day(0)];
    case 'month':
      return [iso(new Date(today.getFullYear(), today.getMonth(), 1)), day(0)];
    default:
      return [day(0), day(0)];
  }
}

const selectClass =
  'h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20';

export const ReportWidgets: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const preset = (params.get('tx_range') as Preset) || 'today';
  const [defaultFrom, defaultTo] = presetRange(preset);
  const fromDate = preset === 'custom' ? params.get('tx_from') || defaultFrom : defaultFrom;
  const toDate = preset === 'custom' ? params.get('tx_to') || defaultTo : defaultTo;
  const status = params.get('tx_status') || '';
  const orderType = params.get('tx_type') || '';
  const search = params.get('tx_q') || '';
  const page = Math.max(Number(params.get('tx_page')) || 1, 1);
  const pageSize = PAGE_SIZES.includes(Number(params.get('tx_size'))) ? Number(params.get('tx_size')) : 20;

  const [searchDraft, setSearchDraft] = useState(search);
  const [data, setData] = useState<InvoicePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);

  const update = useCallback(
    (changes: Record<string, string | number | null>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, String(value));
          }
          if (resetPage) next.delete('tx_page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  // Debounced search: typing does not fire a request per keystroke.
  useEffect(() => {
    if (searchDraft === search) return;
    const timer = window.setTimeout(() => update({ tx_q: searchDraft.trim() }), 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, search, update]);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const res = await invoiceService.list({
        branch: activeBranchId,
        from_date: fromDate,
        to_date: toDate,
        status: status || undefined,
        order_type: orderType || undefined,
        search: search || undefined,
        page,
        page_size: pageSize,
      });
      if (current === requestId.current) setData(res);
    } catch (err) {
      if (current === requestId.current) setError(parseFrappeError(err, t('dash.transactions.load_failed')));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [activeBranchId, fromDate, toDate, status, orderType, search, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = data ? Math.max(Math.ceil(data.total / data.page_size), 1) : 1;
  const firstRow = data && data.total ? (data.page - 1) * data.page_size + 1 : 0;
  const lastRow = data ? Math.min(data.page * data.page_size, data.total) : 0;
  const hasFilters = preset !== 'today' || !!status || !!orderType || !!search;
  const locale = getIntlLocale();

  const presets: { key: Preset; label: string }[] = useMemo(
    () => [
      { key: 'today', label: t('dash.transactions.today') },
      { key: 'yesterday', label: t('dash.transactions.yesterday') },
      { key: 'week', label: t('dash.transactions.last_7_days') },
      { key: 'month', label: t('dash.transactions.this_month') },
      { key: 'custom', label: t('dash.transactions.custom') },
    ],
    [],
  );

  const openInvoice = (name: string) => navigate(`/invoices/${encodeURIComponent(name)}`);

  return (
    <Card className="rounded-lg border border-gray-200 bg-white shadow-xs overflow-hidden">
      <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-5 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <CardTitle className="text-lg font-bold text-gray-900">{t('dash.report_widgets.live_pos_transactions')}</CardTitle>
            <p className="text-xs text-gray-500 mt-0.5">{t('dash.report_widgets.real_time_sales_and_active_checkouts')}</p>
          </div>
          {data && (
            <div className="text-end">
              <p className="text-[11px] font-semibold text-gray-500">{t('dash.transactions.filtered_total', { count: data.total })}</p>
              <p className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(data.amount)}</p>
            </div>
          )}
        </div>

        {/* Period */}
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => (
            <button
              key={p.key}
              type="button"
              onClick={() =>
                update(p.key === 'custom' ? { tx_range: 'custom', tx_from: fromDate, tx_to: toDate } : { tx_range: p.key === 'today' ? null : p.key, tx_from: null, tx_to: null })
              }
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                preset === p.key ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-primary/50'
              }`}
            >
              {p.label}
            </button>
          ))}
          {preset === 'custom' && (
            <div className="flex items-center gap-1.5">
              <Input type="date" value={fromDate} max={toDate} onChange={(e) => update({ tx_from: e.target.value })} className="h-9 w-40 text-xs" aria-label={t('dash.transactions.from')} />
              <span className="text-xs text-gray-400">—</span>
              <Input type="date" value={toDate} min={fromDate} onChange={(e) => update({ tx_to: e.target.value })} className="h-9 w-40 text-xs" aria-label={t('dash.transactions.to')} />
            </div>
          )}
        </div>

        {/* Search, status, type */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={t('dash.transactions.search_placeholder')}
              className="ps-9 h-9 bg-white text-xs w-full"
            />
          </div>
          <select value={status} onChange={(e) => update({ tx_status: e.target.value })} className={selectClass} aria-label={t('dash.report_widgets.status')}>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s ? invoiceStatusLabel(s) : t('dash.transactions.all_statuses')}</option>
            ))}
          </select>
          <select value={orderType} onChange={(e) => update({ tx_type: e.target.value })} className={selectClass} aria-label={t('dash.report_widgets.order_type')}>
            {ORDER_TYPES.map((o) => (
              <option key={o} value={o}>{o ? orderTypeLabel(o) : t('dash.transactions.all_order_types')}</option>
            ))}
          </select>
          {hasFilters && (
            <button
              type="button"
              onClick={() => {
                setSearchDraft('');
                update({ tx_range: null, tx_from: null, tx_to: null, tx_status: null, tx_type: null, tx_q: null });
              }}
              className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              <X className="w-3.5 h-3.5" /> {t('dash.menu_page.clear_filters')}
            </button>
          )}
        </div>
      </CardHeader>

      <CardContent className="p-0">
        {error ? (
          <div className="flex flex-col items-center gap-3 py-12 text-sm text-red-600">
            {error}
            <Button variant="outline" size="sm" onClick={() => void load()}>{t('common.retry')}</Button>
          </div>
        ) : (
          <div className="relative overflow-x-auto">
            {loading && data && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                <Spinner className="w-6 h-6 text-primary" />
              </div>
            )}
            <table className="w-full text-start text-xs">
              <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3.5 text-start">{t('dash.report_widgets.invoice_id')}</th>
                  <th className="px-5 py-3.5 text-start">{t('dash.report_widgets.customer')}</th>
                  <th className="px-5 py-3.5 text-start">{t('dash.report_widgets.table_location')}</th>
                  <th className="px-5 py-3.5 text-start">{t('dash.report_widgets.order_type')}</th>
                  <th className="px-5 py-3.5 text-start">{t('fields.date')}</th>
                  <th className="px-5 py-3.5 text-start">{t('fields.time')}</th>
                  <th className="px-5 py-3.5 text-start">{t('dash.report_widgets.status')}</th>
                  <th className="px-5 py-3.5 text-end">{t('dash.report_widgets.grand_total')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 font-medium text-gray-700">
                {loading && !data ? (
                  <tr>
                    <td colSpan={8} className="py-12">
                      <div className="flex justify-center"><Spinner className="w-6 h-6 text-primary" /></div>
                    </td>
                  </tr>
                ) : !data || data.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-gray-400">
                      {hasFilters ? t('dash.transactions.no_match') : t('dash.report_widgets.no_transactions_recorded_yet_today')}
                    </td>
                  </tr>
                ) : (
                  data.rows.map((tx) => (
                    <tr
                      key={tx.name}
                      onClick={() => openInvoice(tx.name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') openInvoice(tx.name);
                      }}
                      tabIndex={0}
                      role="link"
                      className="cursor-pointer hover:bg-primary/5 focus:bg-primary/5 focus:outline-none transition-colors"
                    >
                      <td className="px-5 py-3.5 font-bold text-primary whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5">
                          {tx.name}
                          {!tx.invoice_printed && tx.docstatus !== 2 && (
                            <Printer className="w-3.5 h-3.5 text-amber-500" aria-label={t('dash.invoice.not_printed')} />
                          )}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-gray-900 font-semibold">{tx.customer_name || tx.customer || t('labels.walk_in_customer')}</td>
                      <td className="px-5 py-3.5 text-gray-600">{tx.restaurant_table || t('labels.counter')}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary font-semibold">
                          {orderTypeLabel(tx.order_type || 'Dine In')}
                        </Badge>
                      </td>
                      <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">{formatServerDate(tx.posting_date, locale)}</td>
                      <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap tabular-nums">{formatServerTime(tx.posting_time, locale)}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant={invoiceStatusTone(tx.status)}>{invoiceStatusLabel(tx.status)}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-end font-bold text-gray-900 whitespace-nowrap tabular-nums">
                        {formatCurrency(tx.rounded_total || tx.grand_total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Paging */}
        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
            <span>{t('dash.transactions.showing', { from: firstRow, to: lastRow, total: data.total })}</span>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5">
                {t('dash.transactions.per_page')}
                <select value={pageSize} onChange={(e) => update({ tx_size: Number(e.target.value) === 20 ? null : e.target.value })} className={selectClass}>
                  {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </label>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={page <= 1 || loading}
                  onClick={() => update({ tx_page: page - 1 === 1 ? null : page - 1 }, false)}
                  aria-label={t('common.prev')}
                >
                  <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
                </Button>
                <span className="min-w-[4rem] text-center tabular-nums">{t('dash.transactions.page_of', { page, pages: totalPages })}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  disabled={page >= totalPages || loading}
                  onClick={() => update({ tx_page: page + 1 }, false)}
                  aria-label={t('common.next')}
                >
                  <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default ReportWidgets;
