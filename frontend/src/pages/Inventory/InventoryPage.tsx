import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeftRight,
  Boxes,
  Building2,
  ChevronLeft,
  ChevronRight,
  CircleSlash,
  Hourglass,
  LayoutGrid,
  Move3d,
  RefreshCw,
  RotateCcw,
  Search,
  Star,
  Warehouse as WarehouseIcon,
  X,
} from 'lucide-react';
import { formatCompactCurrency, formatCurrency, getIntlLocale, parseFrappeError } from '@ury/core';
import { Button, Card, ErrorState, Input, Spinner, StatCard } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import {
  inventoryService,
  type InventoryOverview,
  type StockStatus,
  type WarehouseLayout,
  type WarehouseStockPage,
  type WarehouseSummary,
} from '../../services/inventory';
import { BarList, MovementChart } from './InventoryCharts';
import {
  EMPTY_COLOR,
  GOODS_COLOR,
  STAGNANT_COLOR,
  STATUS_COLOR,
  StatusBadge,
  StatusIcon,
  formatQty,
  healthColor,
  healthLabel,
  shortName,
  warehouseHealth,
} from './stockStatus';
import { formatServerDate } from '../../lib/statusLabels';
import { t } from '../../i18n';

/**
 * The warehouses at a glance — what stock is worth, where it sits, what has
 * run low or out, what has not moved in a quarter — and, one click in, any
 * warehouse's shelves and items.
 *
 * The 3D map is loaded only when shown (three.js is large), and falls back
 * to the grid view on a device without WebGL or if the scene fails; the grid
 * and the item table carry everything the picture does.
 */

const WarehouseScene = lazy(() => import('./WarehouseScene'));

const PERIODS = [30, 90, 365];
const PAGE_SIZES = [20, 50, 100];
const STATUS_FILTERS: (StockStatus | 'stagnant')[] = ['low', 'out', 'negative', 'stagnant'];
const selectClass =
  'h-9 rounded-lg border border-gray-200 bg-white px-2.5 text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary/20';

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

class SceneBoundary extends React.Component<{ fallback: React.ReactNode; children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: unknown) {
    console.error('Warehouse 3D view failed', error);
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

// ------------------------------------------------------------------ grid view

const WarehouseGrid: React.FC<{
  warehouses: WarehouseSummary[];
  selected: string | null;
  onSelect: (name: string) => void;
}> = ({ warehouses, selected, onSelect }) => {
  const byName = new Map(warehouses.map((w) => [w.name, w]));
  const zones = new Map<string, WarehouseSummary[]>();
  for (const w of warehouses) {
    if (w.is_group) continue;
    const parent = w.parent && byName.get(w.parent);
    const key = parent && parent.parent ? parent.name : '';
    if (!zones.has(key)) zones.set(key, []);
    zones.get(key)!.push(w);
  }
  const ordered = [...zones.entries()].sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : 0));

  return (
    <div className="max-h-[460px] space-y-4 overflow-y-auto p-4">
      {ordered.map(([zone, members]) => (
        <div key={zone || 'root'}>
          <div className="mb-2 flex items-center gap-2">
            {zone ? (
              <button type="button" onClick={() => onSelect(zone)} className="text-xs font-bold text-primary hover:underline">
                {shortName(byName.get(zone)?.label || zone)}
              </button>
            ) : (
              <span className="text-xs font-bold text-gray-700">{t('dash.inventory.site')}</span>
            )}
            <span className="h-px flex-1 bg-gray-200" />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {[...members]
              .sort((a, b) => Number(b.is_main) - Number(a.is_main) || b.stock_value - a.stock_value)
              .map((w) => {
                const health = warehouseHealth(w);
                return (
                  <button
                    key={w.name}
                    type="button"
                    onClick={() => onSelect(w.name)}
                    className={`overflow-hidden rounded-lg border bg-white text-start transition-colors ${
                      selected === w.name ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200 hover:border-primary/40'
                    }`}
                  >
                    <div className="h-1.5" style={{ background: healthColor(health) }} />
                    <div className="p-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-bold text-gray-900">{shortName(w.label)}</span>
                        {w.is_main && <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-500" aria-label={t('dash.inventory.main_warehouse')} />}
                      </div>
                      <p className="mt-1 text-base font-bold tabular-nums text-gray-900">{formatCurrency(w.stock_value)}</p>
                      <p className="text-[11px] text-gray-500">{t('dash.inventory.n_items', { count: w.item_count })}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
                        {health === 'empty' ? (
                          <span className="text-gray-400">{healthLabel(health)}</span>
                        ) : health === 'ok' ? (
                          <StatusBadge status="ok" />
                        ) : (
                          <>
                            {w.negative_count > 0 && <StatusBadge status="negative" />}
                            {w.out_count > 0 && (
                              <span className="inline-flex items-center gap-1 font-semibold text-red-700">
                                <StatusIcon status="out" /> {w.out_count} {t('dash.inventory.status_out')}
                              </span>
                            )}
                            {w.low_count > 0 && (
                              <span className="inline-flex items-center gap-1 font-semibold text-amber-800">
                                <StatusIcon status="low" /> {w.low_count} {t('dash.inventory.status_low')}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
          </div>
        </div>
      ))}
    </div>
  );
};

// ------------------------------------------------------------------ page

export const InventoryPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [params, setParams] = useSearchParams();
  const locale = getIntlLocale();

  const days = PERIODS.includes(Number(params.get('days'))) ? Number(params.get('days')) : 30;
  const [webgl] = useState(supportsWebGL);
  const view = params.get('view') === 'grid' || !webgl ? 'grid' : '3d';
  const inside = params.get('inside') === '1';

  const [overview, setOverview] = useState<InventoryOverview | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reset, setReset] = useState(0);

  const [stock, setStock] = useState<WarehouseStockPage | null>(null);
  const [stockLoading, setStockLoading] = useState(false);
  const [stockError, setStockError] = useState('');
  const [layout, setLayout] = useState<WarehouseLayout | null>(null);
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [group, setGroup] = useState('');
  const [sort, setSort] = useState<'value' | 'qty' | 'name' | 'status'>('status');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const tableRef = useRef<HTMLDivElement>(null);
  const stockReq = useRef(0);

  const setParam = useCallback(
    (changes: Record<string, string | null>) =>
      setParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(changes)) {
            if (v === null || v === '') next.delete(k);
            else next.set(k, v);
          }
          return next;
        },
        { replace: true },
      ),
    [setParams],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setOverview(await inventoryService.overview(activeBranchId, days));
    } catch (err) {
      setError(parseFrappeError(err, t('dash.inventory.load_failed')));
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, days]);

  useEffect(() => {
    void load();
  }, [load]);

  const warehouses = overview?.warehouses || [];
  const byName = useMemo(() => new Map(warehouses.map((w) => [w.name, w])), [warehouses]);
  const root = warehouses.find((w) => w.is_group && (!w.parent || !byName.has(w.parent))) || null;
  // The main warehouse is where the page opens: it is the one most people came to see.
  const selectedName = params.get('wh') && byName.has(params.get('wh')!) ? params.get('wh')! : overview?.main_warehouse || root?.name || null;
  const selected = selectedName ? byName.get(selectedName) || null : null;

  // Reset the table when the warehouse changes.
  useEffect(() => {
    setPage(1);
    setHighlighted(null);
    setGroup('');
  }, [selectedName]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchDraft.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft]);

  const loadStock = useCallback(async () => {
    if (!selectedName) return;
    const current = ++stockReq.current;
    setStockLoading(true);
    setStockError('');
    try {
      const res = await inventoryService.stock(selectedName, {
        search: search || undefined,
        status: status || undefined,
        item_group: group || undefined,
        sort,
        page,
        page_size: pageSize,
      });
      if (current === stockReq.current) setStock(res);
    } catch (err) {
      if (current === stockReq.current) setStockError(parseFrappeError(err, t('dash.inventory.load_failed')));
    } finally {
      if (current === stockReq.current) setStockLoading(false);
    }
  }, [selectedName, search, status, group, sort, page, pageSize]);

  useEffect(() => {
    void loadStock();
  }, [loadStock]);

  useEffect(() => {
    if (!inside || !selectedName || view !== '3d') return;
    let cancelled = false;
    setLayout(null);
    inventoryService
      .layout(selectedName)
      .then((res) => !cancelled && setLayout(res))
      .catch((err) => !cancelled && setStockError(parseFrappeError(err, t('dash.inventory.load_failed'))));
    return () => {
      cancelled = true;
    };
  }, [inside, selectedName, view]);

  const select = (name: string, goInside = true) => setParam({ wh: name, inside: goInside && view === '3d' ? '1' : null });

  const filterStatus = (s: string) => {
    setStatus(s);
    setPage(1);
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const pickItem = (code: string) => {
    setHighlighted(code);
    setSearchDraft('');
    setSearch('');
    setStatus('');
    setGroup('');
    tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  if (error && !overview) {
    return (
      <ErrorState
        className="py-24"
        title={t('dash.inventory.load_failed')}
        description={error}
        retryLabel={t('common.retry')}
        onRetry={() => void load()}
      />
    );
  }

  if (!overview) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  const k = overview.kpis;
  const leaves = warehouses.filter((w) => !w.is_group);
  const groupWarehouses = warehouses.filter((w) => w.is_group);
  const rootLabel = t('dash.inventory.site');
  const totalPages = stock ? Math.max(Math.ceil(stock.total / stock.page_size), 1) : 1;
  const crumbs: WarehouseSummary[] = [];
  for (let cur = selected; cur; cur = cur.parent ? byName.get(cur.parent) || null : null) crumbs.unshift(cur);

  const grid = <WarehouseGrid warehouses={warehouses} selected={selectedName} onSelect={(n) => select(n, false)} />;

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{t('dash.inventory.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('dash.inventory.subtitle', { company: overview.company })}</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => { void load(); void loadStock(); }} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t('common.refresh')}
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard className="col-span-2 lg:col-span-1" label={t('dash.inventory.stock_value')} value={formatCompactCurrency(k.stock_value)} title={formatCurrency(k.stock_value)} icon={<WarehouseIcon className="w-5 h-5" />} tone="primary" />
        <StatCard label={t('dash.inventory.items_in_stock')} value={k.items_in_stock} icon={<Boxes className="w-5 h-5" />} delta={{ value: t('dash.inventory.in_n_warehouses', { count: k.warehouse_count }), direction: 'flat' }} />
        <StatCard
          label={t('dash.inventory.kpi_low')}
          value={k.low_count}
          icon={<AlertTriangle className="w-5 h-5" />}
          tone={k.low_count ? 'warning' : 'default'}
          className="cursor-pointer"
          onClick={() => filterStatus('low')}
        />
        <StatCard
          label={t('dash.inventory.kpi_out')}
          value={k.out_count}
          icon={<CircleSlash className="w-5 h-5" />}
          tone={k.out_count ? 'danger' : 'default'}
          className="cursor-pointer"
          onClick={() => filterStatus('out')}
          delta={k.negative_count ? { value: t('dash.inventory.n_negative', { count: k.negative_count }), direction: 'down' } : undefined}
        />
        <StatCard
          label={t('dash.inventory.kpi_stagnant')}
          value={formatCompactCurrency(k.stagnant_value)}
          title={formatCurrency(k.stagnant_value)}
          icon={<Hourglass className="w-5 h-5" />}
          className="cursor-pointer"
          onClick={() => filterStatus('stagnant')}
          delta={{ value: t('dash.inventory.n_positions', { count: k.stagnant_count }), direction: 'flat' }}
        />
      </div>

      {/* Map + warehouse list */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="overflow-hidden border border-gray-200 lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-4 py-2.5">
            <nav className="flex min-w-0 flex-wrap items-center gap-1 text-sm" aria-label={t('dash.inventory.map')}>
              <button
                type="button"
                onClick={() => setParam({ inside: null })}
                className={`inline-flex items-center gap-1.5 font-bold ${inside && view === '3d' ? 'text-primary hover:underline' : 'text-gray-900'}`}
              >
                <Building2 className="w-4 h-4" /> {t('dash.inventory.map')}
              </button>
              {inside && view === '3d' && selected && (
                <>
                  <ChevronLeft className="w-4 h-4 text-gray-400 ltr:rotate-180" />
                  <span className="truncate font-semibold text-gray-700">{shortName(selected.label)}</span>
                </>
              )}
            </nav>
            <div className="flex items-center gap-1.5">
              {view === '3d' && (
                <Button variant="ghost" size="xs" className="gap-1" onClick={() => setReset((n) => n + 1)} title={t('dash.inventory.reset_view')}>
                  <RotateCcw className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t('dash.inventory.reset_view')}</span>
                </Button>
              )}
              <div className="flex rounded-lg border border-gray-200 p-0.5" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === '3d'}
                  disabled={!webgl}
                  onClick={() => setParam({ view: null })}
                  title={webgl ? undefined : t('dash.inventory.no_webgl')}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold disabled:opacity-40 ${view === '3d' ? 'bg-primary text-white' : 'text-gray-600'}`}
                >
                  <Move3d className="w-3.5 h-3.5" /> 3D
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={view === 'grid'}
                  onClick={() => setParam({ view: 'grid', inside: null })}
                  className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold ${view === 'grid' ? 'bg-primary text-white' : 'text-gray-600'}`}
                >
                  <LayoutGrid className="w-3.5 h-3.5" /> {t('dash.inventory.grid')}
                </button>
              </div>
            </div>
          </div>

          {view === '3d' ? (
            <div className="relative h-[360px] sm:h-[460px]">
              <SceneBoundary
                fallback={
                  <div>
                    <p className="border-b border-amber-100 bg-amber-50 px-4 py-2 text-xs text-amber-800">{t('dash.inventory.scene_failed')}</p>
                    {grid}
                  </div>
                }
              >
                <Suspense
                  fallback={
                    <div className="flex h-full items-center justify-center gap-2 text-sm text-gray-500">
                      <Spinner className="w-5 h-5 text-primary" /> {t('dash.inventory.loading_map')}
                    </div>
                  }
                >
                  <WarehouseScene
                    mode={inside ? 'interior' : 'campus'}
                    warehouses={warehouses}
                    rootLabel={rootLabel}
                    layout={inside && layout?.warehouse === selectedName ? layout : null}
                    selected={selectedName}
                    highlighted={highlighted}
                    resetSignal={reset}
                    onSelect={(n) => select(n)}
                    onPickItem={pickItem}
                  />
                </Suspense>
              </SceneBoundary>

              {/* Legend */}
              <div className="pointer-events-none absolute bottom-2 start-2 flex max-w-[calc(100%-1rem)] flex-wrap items-center gap-x-3 gap-y-1 rounded-lg bg-white/90 px-2.5 py-1.5 text-[11px] text-gray-700 shadow-sm">
                {inside ? (
                  <>
                    <LegendDot color={GOODS_COLOR} label={t('dash.inventory.status_ok')} />
                    <LegendDot color={STATUS_COLOR.low} label={t('dash.inventory.status_low')} icon="low" />
                    <LegendDot color={STATUS_COLOR.out} label={t('dash.inventory.legend_out_slot')} icon="out" outline />
                    <LegendDot color={STAGNANT_COLOR} label={t('dash.inventory.stagnant')} />
                    {layout && layout.total_items > layout.shown_items && (
                      <span className="text-gray-500">{t('dash.inventory.showing_top', { shown: layout.shown_items, total: layout.total_items })}</span>
                    )}
                  </>
                ) : (
                  <>
                    <LegendDot color={STATUS_COLOR.ok} label={t('dash.inventory.health_ok')} icon="ok" />
                    <LegendDot color={STATUS_COLOR.low} label={t('dash.inventory.health_low')} icon="low" />
                    <LegendDot color={STATUS_COLOR.out} label={t('dash.inventory.health_out')} icon="out" />
                    <LegendDot color={EMPTY_COLOR} label={t('dash.inventory.health_empty')} />
                    <span className="text-gray-500">{t('dash.inventory.height_hint')}</span>
                  </>
                )}
              </div>
              <p className="pointer-events-none absolute top-2 end-2 hidden rounded-md bg-white/80 px-2 py-1 text-[10px] text-gray-500 sm:block">
                {t('dash.inventory.controls_hint')}
              </p>
            </div>
          ) : (
            grid
          )}
        </Card>

        <Card className="border border-gray-200 p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-gray-900">{t('dash.inventory.value_by_warehouse')}</h2>
            {root && (
              <button type="button" onClick={() => select(root.name, false)} className="text-xs font-semibold text-primary hover:underline">
                {t('dash.inventory.all_warehouses')}
              </button>
            )}
          </div>
          <div className="max-h-[440px] overflow-y-auto pe-1">
            <BarList
              data={[...leaves]
                .filter((w) => w.stock_value > 0 || w.is_main)
                .sort((a, b) => b.stock_value - a.stock_value)
                .map((w) => ({
                  key: w.name,
                  label: `${w.is_main ? '★ ' : ''}${shortName(w.label)}`,
                  value: w.stock_value,
                  hint: t('dash.inventory.n_items', { count: w.item_count }),
                }))}
              selected={selectedName}
              onSelect={(n) => select(n, false)}
              empty={t('dash.inventory.no_stock')}
            />
            {leaves.some((w) => w.stock_value <= 0 && !w.is_main) && (
              <p className="mt-3 text-[11px] text-gray-400">
                {t('dash.inventory.empty_warehouses', { count: leaves.filter((w) => w.stock_value <= 0 && !w.is_main).length })}
              </p>
            )}
          </div>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Card className="border border-gray-200 p-4 lg:col-span-2">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
              <ArrowLeftRight className="w-4 h-4 text-primary" /> {t('dash.inventory.movement_title')}
            </h2>
            <div className="flex gap-1">
              {PERIODS.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setParam({ days: d === 30 ? null : String(d) })}
                  className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                    days === d ? 'border-primary bg-primary text-white' : 'border-gray-200 text-gray-600 hover:border-primary/50'
                  }`}
                >
                  {t('dash.inventory.last_n_days', { count: d })}
                </button>
              ))}
            </div>
          </div>
          <MovementChart
            points={overview.movement.points}
            granularity={overview.movement.granularity}
            onWiden={days < 365 ? () => setParam({ days: '365' }) : undefined}
          />
        </Card>
        <Card className="border border-gray-200 p-4">
          <h2 className="mb-3 text-sm font-bold text-gray-900">{t('dash.inventory.value_by_group')}</h2>
          <BarList
            data={overview.value_by_group.map((g) => ({ key: g.item_group, label: g.item_group, value: g.value }))}
            empty={t('dash.inventory.no_stock')}
          />
        </Card>
      </div>

      {/* Selected warehouse */}
      <div ref={tableRef} className="scroll-mt-4">
        <Card className="overflow-hidden border border-gray-200">
          <div className="space-y-4 border-b border-gray-100 bg-gray-50/50 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <nav className="mb-1 flex flex-wrap items-center gap-1 text-[11px] text-gray-500">
                  {crumbs.slice(0, -1).map((c) => (
                    <React.Fragment key={c.name}>
                      <button type="button" onClick={() => select(c.name, false)} className="hover:text-primary hover:underline">
                        {c === root ? t('dash.inventory.all_warehouses') : shortName(c.label)}
                      </button>
                      <ChevronLeft className="w-3 h-3 ltr:rotate-180" />
                    </React.Fragment>
                  ))}
                </nav>
                <h2 className="flex flex-wrap items-center gap-2 text-lg font-bold text-gray-900">
                  {selected ? (selected === root ? t('dash.inventory.all_warehouses') : shortName(selected.label)) : '—'}
                  {selected?.is_main && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-gray-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" /> {t('dash.inventory.main_warehouse')}
                    </span>
                  )}
                </h2>
                {selected && (
                  <p className="mt-0.5 text-xs text-gray-500">
                    {t('dash.inventory.n_items', { count: selected.item_count })} · {formatCurrency(selected.stock_value)}
                    {selected.last_movement && ` · ${t('dash.inventory.last_movement', { date: formatServerDate(selected.last_movement, locale) })}`}
                  </p>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={selectedName || ''}
                  onChange={(e) => select(e.target.value, false)}
                  className={selectClass}
                  aria-label={t('dash.inventory.choose_warehouse')}
                >
                  {root && <option value={root.name}>{t('dash.inventory.all_warehouses')}</option>}
                  {groupWarehouses.filter((g) => g !== root).map((g) => (
                    <option key={g.name} value={g.name}>{`▸ ${shortName(g.label)}`}</option>
                  ))}
                  {leaves.map((w) => (
                    <option key={w.name} value={w.name}>{`${w.is_main ? '★ ' : ''}${shortName(w.label)}`}</option>
                  ))}
                </select>
                {view === '3d' && selected && !inside && (
                  <Button size="sm" variant="outline" className="gap-1.5" onClick={() => select(selected.name)}>
                    <Move3d className="w-4 h-4" /> {t('dash.inventory.view_inside')}
                  </Button>
                )}
              </div>
            </div>

            {/* Status chips with counts */}
            <div className="flex flex-wrap items-center gap-1.5">
              <Chip active={!status} onClick={() => filterStatus('')} label={t('dash.inventory.all_items')} />
              {STATUS_FILTERS.map((s) => {
                const count = s === 'stagnant' ? selected?.stagnant_count ?? 0 : stock?.status_counts[s as StockStatus] ?? 0;
                if (!count && status !== s) return null;
                return (
                  <Chip
                    key={s}
                    active={status === s}
                    onClick={() => filterStatus(status === s ? '' : s)}
                    label={s === 'stagnant' ? t('dash.inventory.stagnant') : t(`dash.inventory.status_${s}`)}
                    count={count}
                    icon={s === 'stagnant' ? <Hourglass className="h-3 w-3 text-stone-500" /> : <StatusIcon status={s as StockStatus} className="h-3 w-3" />}
                  />
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[200px] flex-1">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <Input
                  type="search"
                  value={searchDraft}
                  onChange={(e) => setSearchDraft(e.target.value)}
                  placeholder={t('dash.inventory.search_placeholder')}
                  className="ps-9 h-9 bg-white text-xs w-full"
                />
              </div>
              {stock && stock.item_groups.length > 1 && (
                <select value={group} onChange={(e) => { setGroup(e.target.value); setPage(1); }} className={selectClass} aria-label={t('dash.inventory.item_group')}>
                  <option value="">{t('dash.inventory.all_groups')}</option>
                  {stock.item_groups.map((g) => <option key={g} value={g}>{g}</option>)}
                </select>
              )}
              <select value={sort} onChange={(e) => { setSort(e.target.value as typeof sort); setPage(1); }} className={selectClass} aria-label={t('dash.inventory.sort')}>
                <option value="status">{t('dash.inventory.sort_status')}</option>
                <option value="value">{t('dash.inventory.sort_value')}</option>
                <option value="qty">{t('dash.inventory.sort_qty')}</option>
                <option value="name">{t('dash.inventory.sort_name')}</option>
              </select>
              {(status || search || group) && (
                <button
                  type="button"
                  onClick={() => { setStatus(''); setSearchDraft(''); setSearch(''); setGroup(''); setPage(1); }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  <X className="w-3.5 h-3.5" /> {t('dash.menu_page.clear_filters')}
                </button>
              )}
            </div>
          </div>

          {stockError && (
            <div className="flex items-center justify-between gap-3 border-b border-red-100 bg-red-50 px-5 py-2.5 text-xs text-red-700">
              {stockError}
              <Button variant="outline" size="xs" onClick={() => void loadStock()}>{t('common.retry')}</Button>
            </div>
          )}

          <div className="relative overflow-x-auto">
            {stockLoading && stock && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
                <Spinner className="w-6 h-6 text-primary" />
              </div>
            )}
            <table className="w-full min-w-[720px] text-xs">
              <thead className="border-b border-gray-100 bg-gray-50 font-semibold text-gray-500">
                <tr>
                  <th className="px-5 py-3 text-start">{t('fields.item')}</th>
                  <th className="px-3 py-3 text-start">{t('dash.inventory.item_group')}</th>
                  <th className="px-3 py-3 text-end">{t('dash.inventory.qty')}</th>
                  <th className="px-3 py-3 text-end">{t('dash.inventory.reserved')}</th>
                  <th className="px-3 py-3 text-end">{t('dash.inventory.reorder_level')}</th>
                  <th className="px-3 py-3 text-end">{t('dash.inventory.valuation_rate')}</th>
                  <th className="px-3 py-3 text-end">{t('dash.inventory.stock_value')}</th>
                  <th className="px-5 py-3 text-start">{t('dash.report_widgets.status')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {stockLoading && !stock ? (
                  <tr><td colSpan={8} className="py-12"><div className="flex justify-center"><Spinner className="w-6 h-6 text-primary" /></div></td></tr>
                ) : !stock || stock.rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-12 text-center text-sm text-gray-400">
                      {status || search || group ? t('dash.transactions.no_match') : t('dash.inventory.empty_warehouse')}
                    </td>
                  </tr>
                ) : (
                  stock.rows.map((r) => (
                    <tr
                      key={`${r.item_code}-${r.warehouse || ''}`}
                      onMouseEnter={() => inside && setHighlighted(r.item_code)}
                      className={`transition-colors ${highlighted === r.item_code ? 'bg-primary/10' : 'hover:bg-gray-50'}`}
                    >
                      <td className="px-5 py-3">
                        <p className="font-semibold text-gray-900">{r.item_name}</p>
                        <p className="text-[11px] text-gray-400">{r.item_code !== r.item_name ? r.item_code : ''}</p>
                      </td>
                      <td className="px-3 py-3 text-gray-600">{r.item_group}</td>
                      <td className={`px-3 py-3 text-end font-bold tabular-nums whitespace-nowrap ${r.actual_qty < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                        {formatQty(r.actual_qty)} <span className="text-[10px] font-normal text-gray-500">{r.stock_uom}</span>
                      </td>
                      <td className="px-3 py-3 text-end tabular-nums text-gray-500">{r.reserved_qty ? formatQty(r.reserved_qty) : '—'}</td>
                      <td className="px-3 py-3 text-end tabular-nums text-gray-500">{r.reorder_level ? formatQty(r.reorder_level) : '—'}</td>
                      <td className="px-3 py-3 text-end tabular-nums text-gray-600 whitespace-nowrap">{formatCurrency(r.valuation_rate)}</td>
                      <td className="px-3 py-3 text-end font-semibold tabular-nums text-gray-900 whitespace-nowrap">{formatCurrency(r.stock_value)}</td>
                      <td className="px-5 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge status={r.status} />
                          {r.stagnant && (
                            <span
                              className="inline-flex items-center gap-1 rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] font-semibold text-stone-700"
                              title={r.last_out ? t('dash.inventory.last_out', { date: formatServerDate(r.last_out, locale) }) : t('dash.inventory.never_issued')}
                            >
                              <Hourglass className="h-3 w-3" /> {t('dash.inventory.stagnant')}
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {stock && stock.total > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 px-5 py-3 text-xs text-gray-500">
              <span>
                {t('dash.transactions.showing', {
                  from: (stock.page - 1) * stock.page_size + 1,
                  to: Math.min(stock.page * stock.page_size, stock.total),
                  total: stock.total,
                })}
                {' · '}
                <span className="font-semibold text-gray-700">{formatCurrency(stock.value)}</span>
              </span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5">
                  {t('dash.transactions.per_page')}
                  <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className={selectClass}>
                    {PAGE_SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </label>
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page <= 1 || stockLoading} onClick={() => setPage(page - 1)} aria-label={t('common.prev')}>
                    <ChevronRight className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
                  </Button>
                  <span className="min-w-[4rem] text-center tabular-nums">{t('dash.transactions.page_of', { page, pages: totalPages })}</span>
                  <Button variant="outline" size="sm" className="h-8 w-8 p-0" disabled={page >= totalPages || stockLoading} onClick={() => setPage(page + 1)} aria-label={t('common.next')}>
                    <ChevronLeft className="w-4 h-4 rtl:rotate-0 ltr:rotate-180" />
                  </Button>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* Recent movements */}
      <Card className="border border-gray-200 p-5">
        <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
          <ArrowLeftRight className="w-4 h-4 text-primary" /> {t('dash.inventory.recent_title')}
        </h2>
        {overview.recent.length === 0 ? (
          <p className="text-sm text-gray-400">{t('dash.inventory.no_movement')}</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {overview.recent.map((m, i) => {
              const incoming = m.actual_qty > 0;
              return (
                <li key={`${m.voucher_no}-${m.item_code}-${i}`} className="flex flex-wrap items-center justify-between gap-3 py-2.5 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold ${incoming ? 'bg-blue-50 text-blue-700' : 'bg-red-50 text-red-700'}`}
                      aria-label={incoming ? t('dash.inventory.received') : t('dash.inventory.issued')}
                    >
                      {incoming ? '+' : '−'}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-gray-900">{m.item_name}</p>
                      <p className="truncate text-[11px] text-gray-500">
                        {shortName(byName.get(m.warehouse)?.label || m.warehouse)} · {t(`dash.inventory.voucher.${voucherKey(m.voucher_type)}`, {}) || m.voucher_type} · {formatServerDate(m.posting_date, locale)}
                      </p>
                    </div>
                  </div>
                  <div className="text-end">
                    <p className={`font-bold tabular-nums ${incoming ? 'text-blue-700' : 'text-red-700'}`} dir="ltr">
                      {incoming ? '+' : ''}{formatQty(m.actual_qty)} {m.stock_uom}
                    </p>
                    <p className="text-[11px] tabular-nums text-gray-500">{formatCurrency(Math.abs(m.stock_value_difference))}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
};

const VOUCHER_KEYS: Record<string, string> = {
  'Purchase Invoice': 'purchase_invoice',
  'Purchase Receipt': 'purchase_receipt',
  'Sales Invoice': 'sales_invoice',
  'POS Invoice': 'pos_invoice',
  'Delivery Note': 'delivery_note',
  'Stock Entry': 'stock_entry',
  'Stock Reconciliation': 'stock_reconciliation',
};
const voucherKey = (v: string) => VOUCHER_KEYS[v] || 'other';

const Chip: React.FC<{ active: boolean; onClick: () => void; label: string; count?: number; icon?: React.ReactNode }> = ({
  active,
  onClick,
  label,
  count,
  icon,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={active}
    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
      active ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-primary/50'
    }`}
  >
    {icon && <span className={active ? 'rounded-full bg-white p-0.5' : ''}>{icon}</span>}
    {label}
    {count !== undefined && <span className={`tabular-nums ${active ? 'text-white/80' : 'text-gray-400'}`}>{count}</span>}
  </button>
);

const LegendDot: React.FC<{ color: string; label: string; icon?: StockStatus; outline?: boolean }> = ({ color, label, icon, outline }) => (
  <span className="inline-flex items-center gap-1">
    <span
      className="h-2.5 w-2.5 rounded-sm"
      style={outline ? { border: `1.5px solid ${color}`, background: 'transparent' } : { background: color }}
    />
    {icon && <StatusIcon status={icon} className="h-3 w-3" />}
    {label}
  </span>
);

export default InventoryPage;
