import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, ChevronLeft, ChevronRight, FilePen, Plus, Search, ShoppingCart, Truck, Wallet, X } from 'lucide-react';
import { formatCurrency, getIntlLocale, parseFrappeError } from '@ury/core';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, ErrorState, Input, Spinner, StatCard, Illustration } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import {
  purchaseService,
  type PurchasePage,
  type PurchaseSetup,
  type PurchaseSummary,
} from '../../services/purchases';
import { formatServerDate, invoiceStatusLabel, invoiceStatusTone } from '../../lib/statusLabels';
import { t } from '../../i18n';

/**
 * Supplier bills: what was bought this period, what is still owed, and the
 * list of bills behind those figures, each opening its own page.
 *
 * Filters live in the URL so opening a bill and pressing back returns to the
 * same filtered page.
 */

type Preset = 'today' | 'week' | 'month' | 'last_month' | 'custom';

const STATUS_OPTIONS = ['', 'Draft', 'Unpaid', 'Overdue', 'Paid', 'Return', 'Cancelled'];
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
    case 'today':
      return [day(0), day(0)];
    case 'week':
      return [day(-6), day(0)];
    case 'last_month':
      return [
        iso(new Date(today.getFullYear(), today.getMonth() - 1, 1)),
        iso(new Date(today.getFullYear(), today.getMonth(), 0)),
      ];
    default:
      return [iso(new Date(today.getFullYear(), today.getMonth(), 1)), day(0)];
  }
}

const selectClass =
  'h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20';

export const PurchasesPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();

  const preset = (params.get('p_range') as Preset) || 'month';
  const [defaultFrom, defaultTo] = presetRange(preset);
  const fromDate = preset === 'custom' ? params.get('p_from') || defaultFrom : defaultFrom;
  const toDate = preset === 'custom' ? params.get('p_to') || defaultTo : defaultTo;
  const status = params.get('p_status') || '';
  const warehouse = params.get('p_wh') || '';
  const supplier = params.get('p_supplier') || '';
  const search = params.get('p_q') || '';
  const page = Math.max(Number(params.get('p_page')) || 1, 1);
  const pageSize = PAGE_SIZES.includes(Number(params.get('p_size'))) ? Number(params.get('p_size')) : 20;

  const [searchDraft, setSearchDraft] = useState(search);
  const [setup, setSetup] = useState<PurchaseSetup | null>(null);
  const [summary, setSummary] = useState<PurchaseSummary | null>(null);
  const [data, setData] = useState<PurchasePage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  const locale = getIntlLocale();

  const update = useCallback(
    (changes: Record<string, string | number | null>, resetPage = true) => {
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [key, value] of Object.entries(changes)) {
            if (value === null || value === '') next.delete(key);
            else next.set(key, String(value));
          }
          if (resetPage) next.delete('p_page');
          return next;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  useEffect(() => {
    if (searchDraft === search) return;
    const timer = window.setTimeout(() => update({ p_q: searchDraft.trim() }), 350);
    return () => window.clearTimeout(timer);
  }, [searchDraft, search, update]);

  useEffect(() => {
    let cancelled = false;
    purchaseService
      .setup(activeBranchId)
      .then((res) => !cancelled && setSetup(res))
      .catch(() => !cancelled && setSetup(null));
    return () => {
      cancelled = true;
    };
  }, [activeBranchId]);

  const load = useCallback(async () => {
    const current = ++requestId.current;
    setLoading(true);
    setError('');
    try {
      const [list, sum] = await Promise.all([
        purchaseService.list({
          branch: activeBranchId,
          from_date: fromDate,
          to_date: toDate,
          status: status || undefined,
          warehouse: warehouse || undefined,
          supplier: supplier || undefined,
          search: search || undefined,
          page,
          page_size: pageSize,
        }),
        purchaseService.summary(activeBranchId, fromDate, toDate),
      ]);
      if (current === requestId.current) {
        setData(list);
        setSummary(sum);
      }
    } catch (err) {
      if (current === requestId.current) setError(parseFrappeError(err, t('dash.purchases.load_failed')));
    } finally {
      if (current === requestId.current) setLoading(false);
    }
  }, [activeBranchId, fromDate, toDate, status, warehouse, supplier, search, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const presets: { key: Preset; label: string }[] = useMemo(
    () => [
      { key: 'today', label: t('dash.transactions.today') },
      { key: 'week', label: t('dash.transactions.last_7_days') },
      { key: 'month', label: t('dash.transactions.this_month') },
      { key: 'last_month', label: t('dash.purchases.last_month') },
      { key: 'custom', label: t('dash.transactions.custom') },
    ],
    [],
  );

  const totalPages = data ? Math.max(Math.ceil(data.total / data.page_size), 1) : 1;
  const firstRow = data && data.total ? (data.page - 1) * data.page_size + 1 : 0;
  const lastRow = data ? Math.min(data.page * data.page_size, data.total) : 0;
  const hasFilters = preset !== 'month' || !!status || !!warehouse || !!supplier || !!search;
  const supplierLabel = supplier
    ? summary?.top_suppliers.find((s) => s.supplier === supplier)?.supplier_name ||
      data?.rows.find((r) => r.supplier === supplier)?.supplier_name ||
      supplier
    : '';
  const warehouseLabel = (name?: string | null) =>
    (name && setup?.warehouses.find((w) => w.name === name)?.label) || name || '—';

  const open = (name: string) => navigate(`/purchases/${encodeURIComponent(name)}`);

  if (error && !data) {
    return (
      <ErrorState
        className="py-24"
        title={t('dash.purchases.load_failed')}
        description={error}
        retryLabel={t('common.retry')}
        onRetry={() => void load()}
      />
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('dash.purchases.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('dash.purchases.subtitle')}</p>
        </div>
        {setup?.permissions.create && (
          <Button className="gap-2 bg-primary text-white" onClick={() => navigate('/purchases/new')}>
            <Plus className="w-4 h-4" /> {t('dash.purchases.new')}
          </Button>
        )}
      </div>

      {/* Period */}
      <div className="flex flex-wrap items-center gap-1.5">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() =>
              update(
                p.key === 'custom'
                  ? { p_range: 'custom', p_from: fromDate, p_to: toDate }
                  : { p_range: p.key === 'month' ? null : p.key, p_from: null, p_to: null },
              )
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
            <Input type="date" value={fromDate} max={toDate} onChange={(e) => update({ p_from: e.target.value })} className="h-9 w-40 text-xs" aria-label={t('dash.transactions.from')} />
            <span className="text-xs text-gray-400">—</span>
            <Input type="date" value={toDate} min={fromDate} onChange={(e) => update({ p_to: e.target.value })} className="h-9 w-40 text-xs" aria-label={t('dash.transactions.to')} />
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          label={t('dash.purchases.kpi_purchases')}
          value={formatCurrency(summary?.purchases_amount ?? 0)}
          isLoading={!summary}
          icon={<ShoppingCart className="w-5 h-5" />}
          tone="primary"
          delta={summary ? { value: t('dash.purchases.bills_count', { count: summary.purchases_count }), direction: 'flat' } : undefined}
        />
        <StatCard
          label={t('dash.purchases.kpi_outstanding')}
          value={formatCurrency(summary?.outstanding_amount ?? 0)}
          isLoading={!summary}
          icon={<Wallet className="w-5 h-5" />}
          tone="warning"
          className="cursor-pointer"
          onClick={() => update({ p_status: 'Unpaid', p_range: 'custom', p_from: '2000-01-01', p_to: presetRange('today')[1] })}
          delta={summary ? { value: t('dash.purchases.bills_count', { count: summary.outstanding_count }), direction: 'flat' } : undefined}
        />
        <StatCard
          label={t('dash.purchases.kpi_overdue')}
          value={formatCurrency(summary?.overdue_amount ?? 0)}
          isLoading={!summary}
          icon={<AlertTriangle className="w-5 h-5" />}
          tone={summary && summary.overdue_count > 0 ? 'danger' : 'default'}
          className="cursor-pointer"
          onClick={() => update({ p_status: 'Overdue', p_range: 'custom', p_from: '2000-01-01', p_to: presetRange('today')[1] })}
          delta={summary ? { value: t('dash.purchases.bills_count', { count: summary.overdue_count }), direction: 'flat' } : undefined}
        />
        <StatCard
          label={t('dash.purchases.kpi_drafts')}
          value={summary?.draft_count ?? 0}
          isLoading={!summary}
          icon={<FilePen className="w-5 h-5" />}
          className="cursor-pointer"
          onClick={() => update({ p_status: 'Draft', p_range: 'custom', p_from: '2000-01-01', p_to: presetRange('today')[1] })}
        />
      </div>

      {/* Top suppliers */}
      {summary && summary.top_suppliers.length > 0 && (
        <Card className="border border-gray-200 p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
            <Truck className="w-4 h-4 text-primary" /> {t('dash.purchases.top_suppliers')}
          </div>
          <div className="flex flex-wrap gap-2">
            {summary.top_suppliers.map((s) => {
              const share = summary.purchases_amount ? Math.round((s.amount / summary.purchases_amount) * 100) : 0;
              const active = supplier === s.supplier;
              return (
                <button
                  key={s.supplier}
                  type="button"
                  onClick={() => update({ p_supplier: active ? null : s.supplier })}
                  className={`flex min-w-[170px] flex-1 flex-col rounded-lg border px-3 py-2 text-start transition-colors sm:flex-none ${
                    active ? 'border-primary bg-primary/5' : 'border-gray-200 bg-white hover:border-primary/40'
                  }`}
                >
                  <span className="truncate text-xs font-semibold text-gray-900">{s.supplier_name || s.supplier}</span>
                  <span className="mt-0.5 text-sm font-bold tabular-nums text-gray-900">{formatCurrency(s.amount)}</span>
                  <span className="mt-1 h-1 w-full overflow-hidden rounded-full bg-gray-100">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${share}%` }} />
                  </span>
                  <span className="mt-1 text-[11px] text-gray-500">
                    {t('dash.purchases.bills_count', { count: s.count })} · {share}%
                  </span>
                </button>
              );
            })}
          </div>
        </Card>
      )}

      {/* List */}
      <Card className="rounded-lg border border-gray-200 bg-white shadow-xs overflow-hidden">
        <CardHeader className="border-b border-gray-100 bg-gray-50/50 p-5 space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <CardTitle className="text-lg font-bold text-gray-900">{t('dash.purchases.bills')}</CardTitle>
            {data && (
              <div className="flex gap-6 text-end">
                <div>
                  <p className="text-[11px] font-semibold text-gray-500">{t('dash.transactions.filtered_total', { count: data.total })}</p>
                  <p className="text-lg font-bold text-gray-900 tabular-nums">{formatCurrency(data.amount)}</p>
                </div>
                {data.outstanding > 0 && (
                  <div>
                    <p className="text-[11px] font-semibold text-gray-500">{t('dash.purchases.outstanding')}</p>
                    <p className="text-lg font-bold text-amber-600 tabular-nums">{formatCurrency(data.outstanding)}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder={t('dash.purchases.search_placeholder')}
                className="ps-9 h-9 bg-white text-xs w-full"
              />
            </div>
            <select value={status} onChange={(e) => update({ p_status: e.target.value })} className={selectClass} aria-label={t('dash.report_widgets.status')}>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s ? invoiceStatusLabel(s) : t('dash.transactions.all_statuses')}
                </option>
              ))}
            </select>
            {setup && setup.warehouses.length > 1 && (
              <select value={warehouse} onChange={(e) => update({ p_wh: e.target.value })} className={selectClass} aria-label={t('dash.purchases.warehouse')}>
                <option value="">{t('dash.purchases.all_warehouses')}</option>
                {setup.warehouses.map((w) => (
                  <option key={w.name} value={w.name}>{w.label}</option>
                ))}
              </select>
            )}
            {supplier && (
              <Badge variant="info" className="gap-1">
                {supplierLabel}
                <button type="button" onClick={() => update({ p_supplier: null })} aria-label={t('common.close')}>
                  <X className="w-3 h-3" />
                </button>
              </Badge>
            )}
            {hasFilters && (
              <button
                type="button"
                onClick={() => {
                  setSearchDraft('');
                  update({ p_range: null, p_from: null, p_to: null, p_status: null, p_wh: null, p_supplier: null, p_q: null });
                }}
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
              >
                <X className="w-3.5 h-3.5" /> {t('dash.menu_page.clear_filters')}
              </button>
            )}
          </div>
        </CardHeader>

        <CardContent className="p-0">
          {error && (
            <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-5 py-2.5 text-xs text-red-700">
              {error}
              <Button variant="outline" size="xs" onClick={() => void load()}>{t('common.retry')}</Button>
            </div>
          )}
          <div className="relative overflow-x-auto">
            {loading && data && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                <Spinner className="w-6 h-6 text-primary" />
              </div>
            )}
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-gray-500 font-semibold border-b border-gray-100">
                <tr>
                  <th className="px-5 py-3.5 text-start">{t('dash.purchases.number')}</th>
                  <th className="px-5 py-3.5 text-start">{t('dash.purchases.supplier')}</th>
                  <th className="px-5 py-3.5 text-start">{t('dash.purchases.bill_no')}</th>
                  <th className="px-5 py-3.5 text-start">{t('fields.date')}</th>
                  <th className="px-5 py-3.5 text-start">{t('dash.purchases.warehouse')}</th>
                  <th className="px-5 py-3.5 text-start">{t('dash.report_widgets.status')}</th>
                  <th className="px-5 py-3.5 text-end">{t('dash.invoice.total')}</th>
                  <th className="px-5 py-3.5 text-end">{t('dash.purchases.outstanding')}</th>
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
                    <td colSpan={8} className="px-5 py-12 text-center">
                      {hasFilters ? (
                        <ShoppingCart className="mx-auto mb-2 h-8 w-8 text-gray-300" />
                      ) : (
                        <Illustration name="purchases" className="mx-auto mb-1" />
                      )}
                      <p className="text-sm text-gray-500">
                        {hasFilters ? t('dash.transactions.no_match') : t('dash.purchases.empty')}
                      </p>
                      {!hasFilters && setup?.permissions.create && (
                        <Button size="sm" className="mt-3 gap-1.5 bg-primary text-white" onClick={() => navigate('/purchases/new')}>
                          <Plus className="w-4 h-4" /> {t('dash.purchases.new')}
                        </Button>
                      )}
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => (
                    <tr
                      key={row.name}
                      onClick={() => open(row.name)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') open(row.name);
                      }}
                      tabIndex={0}
                      role="link"
                      className="cursor-pointer hover:bg-primary/5 focus:bg-primary/5 focus:outline-none transition-colors"
                    >
                      <td className="px-5 py-3.5 font-bold text-primary whitespace-nowrap">{row.name}</td>
                      <td className="px-5 py-3.5 text-gray-900 font-semibold">{row.supplier_name || row.supplier}</td>
                      <td className="px-5 py-3.5 text-gray-600">{row.bill_no || '—'}</td>
                      <td className="px-5 py-3.5 text-gray-600 whitespace-nowrap">{formatServerDate(row.posting_date, locale)}</td>
                      <td className="px-5 py-3.5 text-gray-600">{warehouseLabel(row.set_warehouse)}</td>
                      <td className="px-5 py-3.5">
                        <Badge variant={invoiceStatusTone(row.status)}>{invoiceStatusLabel(row.status)}</Badge>
                      </td>
                      <td className="px-5 py-3.5 text-end font-bold text-gray-900 whitespace-nowrap tabular-nums">
                        {formatCurrency(row.rounded_total || row.grand_total)}
                      </td>
                      <td
                        className={`px-5 py-3.5 text-end whitespace-nowrap tabular-nums ${
                          row.docstatus === 1 && row.outstanding_amount > 0 ? 'font-bold text-amber-600' : 'text-gray-400'
                        }`}
                      >
                        {row.docstatus === 1 && row.outstanding_amount > 0 ? formatCurrency(row.outstanding_amount) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {data && data.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
              <span>{t('dash.transactions.showing', { from: firstRow, to: lastRow, total: data.total })}</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5">
                  {t('dash.transactions.per_page')}
                  <select value={pageSize} onChange={(e) => update({ p_size: Number(e.target.value) === 20 ? null : e.target.value })} className={selectClass}>
                    {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 w-8 p-0"
                    disabled={page <= 1 || loading}
                    onClick={() => update({ p_page: page - 1 === 1 ? null : page - 1 }, false)}
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
                    onClick={() => update({ p_page: page + 1 }, false)}
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
    </div>
  );
};

export default PurchasesPage;
