import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AlertTriangle, BookOpen, CheckCircle2, ChefHat, CircleSlash, Clock, Flame, Package, Plus, RefreshCw, Search } from 'lucide-react';
import { formatCompactCurrency, formatCurrency, getIntlLocale, parseFrappeError } from '@ury/core';
import { Button, Card, ErrorState, Input, Spinner, StatCard, showToast, Illustration } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { recipeService, type ConsumptionReport, type RecipeList } from '../../services/recipes';
import { BarList } from '../Inventory/InventoryCharts';
import { formatQty } from '../Inventory/stockStatus';
import { formatServerDate } from '../../lib/statusLabels';
import { FoodCostBadge } from './foodCost';
import { t } from '../../i18n';

/**
 * Recipes and what they consume.
 *
 * Recipes tab: every product that is sold, whether it has a recipe, what one
 * portion costs at today's purchase prices, and its food-cost share of the
 * price. Consumption tab: what the recipes took off the shelves in a period,
 * and any deduction that did not go through, with a retry.
 */

type Tab = 'recipes' | 'consumption';
const FILTERS = ['', 'without', 'with', 'warning'] as const;
const PERIODS = [7, 30, 90];

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const RecipesPage: React.FC = () => {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'consumption' ? 'consumption' : 'recipes';
  const setTab = (next: Tab) =>
    setParams((prev) => {
      const p = new URLSearchParams(prev);
      if (next === 'recipes') p.delete('tab');
      else p.set('tab', next);
      return p;
    }, { replace: true });

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-10">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">{t('dash.recipes.title')}</h1>
        <p className="mt-1 text-sm text-gray-500">{t('dash.recipes.subtitle')}</p>
      </div>
      <div className="flex gap-1 border-b border-gray-200" role="tablist">
        {(['recipes', 'consumption'] as Tab[]).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px inline-flex items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-semibold transition-colors ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {key === 'recipes' ? <BookOpen className="w-4 h-4" /> : <Flame className="w-4 h-4" />}
            {t(`dash.recipes.tab_${key}`)}
          </button>
        ))}
      </div>
      {tab === 'recipes' ? <RecipesTab /> : <ConsumptionTab />}
    </div>
  );
};

// ------------------------------------------------------------------ recipes

const RecipesTab: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = (params.get('f') || '') as (typeof FILTERS)[number];
  const [searchDraft, setSearchDraft] = useState(params.get('q') || '');
  const search = params.get('q') || '';
  const [data, setData] = useState<RecipeList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const req = useRef(0);

  const setParam = useCallback(
    (key: string, value: string) =>
      setParams((prev) => {
        const p = new URLSearchParams(prev);
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      }, { replace: true }),
    [setParams],
  );

  useEffect(() => {
    if (searchDraft === search) return;
    const timer = window.setTimeout(() => setParam('q', searchDraft.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [searchDraft, search, setParam]);

  const load = useCallback(async () => {
    const current = ++req.current;
    setLoading(true);
    setError('');
    try {
      const res = await recipeService.list(activeBranchId, search || undefined, filter || undefined);
      if (current === req.current) setData(res);
    } catch (err) {
      if (current === req.current) setError(parseFrappeError(err, t('dash.recipes.load_failed')));
    } finally {
      if (current === req.current) setLoading(false);
    }
  }, [activeBranchId, search, filter]);

  useEffect(() => {
    void load();
  }, [load]);

  if (error && !data) {
    return <ErrorState className="py-20" title={t('dash.recipes.load_failed')} description={error} retryLabel={t('common.retry')} onRetry={() => void load()} />;
  }

  const s = data?.summary;
  const open = (code: string) => navigate(`/recipes/${encodeURIComponent(code)}`);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={t('dash.recipes.kpi_products')} value={s?.products ?? 0} isLoading={!s} icon={<ChefHat className="w-5 h-5" />} />
        <StatCard
          label={t('dash.recipes.kpi_with')}
          value={s?.with_recipe ?? 0}
          isLoading={!s}
          icon={<CheckCircle2 className="w-5 h-5" />}
          tone="success"
          className="cursor-pointer"
          onClick={() => setParam('f', 'with')}
        />
        <StatCard
          label={t('dash.recipes.kpi_without')}
          value={s?.without_recipe ?? 0}
          isLoading={!s}
          icon={<CircleSlash className="w-5 h-5" />}
          tone={s?.without_recipe ? 'warning' : 'default'}
          className="cursor-pointer"
          onClick={() => setParam('f', 'without')}
        />
        <StatCard
          label={t('dash.recipes.kpi_food_cost')}
          value={s?.average_food_cost_percent != null ? `${s.average_food_cost_percent.toFixed(1)}%` : '—'}
          isLoading={!s}
          icon={<Flame className="w-5 h-5" />}
        />
      </div>

      <Card className="overflow-hidden border border-gray-200">
        <div className="space-y-3 border-b border-gray-100 bg-gray-50/50 p-4">
          <div className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f || 'all'}
                type="button"
                onClick={() => setParam('f', f)}
                aria-pressed={filter === f}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${
                  filter === f ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-700 hover:border-primary/50'
                }`}
              >
                {t(`dash.recipes.filter_${f || 'all'}`)}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="search"
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              placeholder={t('dash.recipes.search_placeholder')}
              className="ps-9 h-9 bg-white text-xs w-full"
            />
          </div>
        </div>

        <div className="relative overflow-x-auto">
          {loading && data && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/60">
              <Spinner className="w-6 h-6 text-primary" />
            </div>
          )}
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs font-semibold text-gray-500">
              <tr>
                <th className="px-5 py-3 text-start">{t('dash.recipes.product')}</th>
                <th className="px-3 py-3 text-start">{t('dash.recipes.recipe')}</th>
                <th className="px-3 py-3 text-end">{t('dash.recipes.portion_cost')}</th>
                <th className="px-3 py-3 text-end">{t('dash.recipes.price')}</th>
                <th className="px-3 py-3 text-start">{t('dash.recipes.food_cost')}</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {!data ? (
                <tr><td colSpan={6} className="py-12"><div className="flex justify-center"><Spinner className="w-6 h-6 text-primary" /></div></td></tr>
              ) : data.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-sm text-gray-400">
                    <Illustration name="recipes" className="mx-auto mb-1" />
                    {t('dash.recipes.empty')}
                  </td>
                </tr>
              ) : (
                data.rows.map((r) => (
                  <tr
                    key={r.item_code}
                    onClick={() => open(r.item_code)}
                    onKeyDown={(e) => e.key === 'Enter' && open(r.item_code)}
                    tabIndex={0}
                    role="link"
                    className="cursor-pointer hover:bg-primary/5 focus:bg-primary/5 focus:outline-none"
                  >
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        {r.image ? (
                          <img src={r.image} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" loading="lazy" />
                        ) : (
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-400"><Package className="h-4 w-4" /></span>
                        )}
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-gray-900">{r.item_name}</p>
                          <p className="text-[11px] text-gray-400">{r.item_group}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      {r.warning === 'stock_item' ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-500" /> {t('dash.recipes.warn_stock_item_short')}
                        </span>
                      ) : r.recipe ? (
                        <span className="text-xs text-gray-700">{t('dash.recipes.n_ingredients', { count: r.ingredient_count })}</span>
                      ) : r.is_stock_item ? (
                        <span className="text-xs text-gray-400">{t('dash.recipes.resale_item')}</span>
                      ) : (
                        <span className="text-xs font-semibold text-gray-400">{t('dash.recipes.no_recipe')}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-end tabular-nums whitespace-nowrap">
                      {r.cost != null ? (
                        <span className={r.cost_complete ? 'font-semibold text-gray-900' : 'font-semibold text-amber-700'} title={r.cost_complete ? undefined : t('dash.recipes.cost_incomplete')}>
                          {formatCurrency(r.cost)}
                          {!r.cost_complete && ' *'}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-end tabular-nums text-gray-600 whitespace-nowrap">{r.price ? formatCurrency(r.price) : '—'}</td>
                    <td className="px-3 py-3"><FoodCostBadge percent={r.food_cost_percent} /></td>
                    <td className="px-5 py-3 text-end">
                      {!r.recipe && !r.is_stock_item && (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-primary">
                          <Plus className="h-3.5 w-3.5" /> {t('dash.recipes.create')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data?.rows.some((r) => r.cost != null && !r.cost_complete) && (
          <p className="border-t border-gray-100 px-5 py-2.5 text-[11px] text-amber-700">* {t('dash.recipes.cost_incomplete')}</p>
        )}
      </Card>
    </div>
  );
};

// ------------------------------------------------------------------ consumption

const ConsumptionTab: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [days, setDays] = useState(30);
  const [data, setData] = useState<ConsumptionReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState<string | 'all' | ''>('');
  const locale = getIntlLocale();

  const range = useMemo(() => {
    const to = new Date();
    const from = new Date();
    from.setDate(from.getDate() - (days - 1));
    return [iso(from), iso(to)] as const;
  }, [days]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await recipeService.consumption(activeBranchId, range[0], range[1]));
    } catch (err) {
      setError(parseFrappeError(err, t('dash.recipes.load_failed')));
    } finally {
      setLoading(false);
    }
  }, [activeBranchId, range]);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = async (name?: string) => {
    setRetrying(name || 'all');
    try {
      const res = await recipeService.retry(name ? [name] : undefined, activeBranchId);
      if (res.Failed) showToast.error(t('dash.recipes.retry_some_failed', { done: res.Done || 0, failed: res.Failed }));
      else showToast.success(t('dash.recipes.retry_done', { count: res.Done || 0 }));
      await load();
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.recipes.retry_failed')));
    } finally {
      setRetrying('');
    }
  };

  if (error && !data) {
    return <ErrorState className="py-20" title={t('dash.recipes.load_failed')} description={error} retryLabel={t('common.retry')} onRetry={() => void load()} />;
  }
  if (!data) {
    return <div className="flex justify-center py-20"><Spinner className="w-8 h-8 text-primary" /></div>;
  }

  const problems = data.counts.Failed + data.counts.Pending;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          {PERIODS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${days === d ? 'border-primary bg-primary text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-primary/50'}`}
            >
              {t('dash.inventory.last_n_days', { count: d })}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> {t('common.refresh')}
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard className="col-span-2 lg:col-span-1" label={t('dash.recipes.kpi_consumed')} value={formatCompactCurrency(data.cost)} title={formatCurrency(data.cost)} icon={<Flame className="w-5 h-5" />} tone="primary" />
        <StatCard label={t('dash.recipes.kpi_deducted')} value={data.counts.Done} icon={<CheckCircle2 className="w-5 h-5" />} />
        <StatCard label={t('dash.recipes.kpi_problems')} value={problems} icon={<AlertTriangle className="w-5 h-5" />} tone={problems ? 'danger' : 'default'} />
        <StatCard label={t('dash.recipes.kpi_reversed')} value={data.counts.Cancelled} icon={<CircleSlash className="w-5 h-5" />} />
      </div>

      {problems > 0 && (
        <Card className="border border-red-200">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-red-100 bg-red-50 px-5 py-3">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-bold text-red-900">
                <AlertTriangle className="h-4 w-4" /> {t('dash.recipes.problems_title', { count: problems })}
              </h2>
              <p className="mt-0.5 text-xs text-red-800">{t('dash.recipes.problems_hint')}</p>
            </div>
            <Button size="sm" className="gap-1.5 bg-primary text-white" disabled={!!retrying} onClick={() => void retry()}>
              {retrying === 'all' ? <Spinner className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />} {t('dash.recipes.retry_all')}
            </Button>
          </div>
          <ul className="divide-y divide-gray-100">
            {data.problems.map((p) => (
              <li key={p.name} className="flex flex-wrap items-start justify-between gap-3 px-5 py-3 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-gray-900">
                    <a href={`/restro/invoices/${encodeURIComponent(p.pos_invoice)}`} className="text-primary hover:underline">{p.pos_invoice}</a>
                    <span className="ms-2 text-xs font-normal text-gray-500">{formatServerDate(p.posting_date, locale)}</span>
                  </p>
                  <p className={`mt-0.5 text-xs ${p.status === 'Failed' ? 'text-red-700' : 'text-gray-500'}`}>
                    {p.status === 'Pending' ? (
                      <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {t('dash.recipes.pending')}</span>
                    ) : (
                      p.error
                    )}
                  </p>
                  {p.attempts > 1 && <p className="text-[10px] text-gray-400">{t('dash.recipes.attempts', { count: p.attempts })}</p>}
                </div>
                <Button variant="outline" size="xs" disabled={!!retrying} onClick={() => void retry(p.name)}>
                  {retrying === p.name ? <Spinner className="h-3.5 w-3.5" /> : t('dash.recipes.retry')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card className="border border-gray-200 p-4">
          <h2 className="mb-3 text-sm font-bold text-gray-900">{t('dash.recipes.top_ingredients')}</h2>
          <BarList
            data={data.ingredients.slice(0, 12).map((i) => ({
              key: i.item_code,
              label: i.item_name,
              value: i.cost,
              hint: `${formatQty(Number(i.qty.toFixed(3)))} ${i.stock_uom}`,
            }))}
            empty={t('dash.recipes.no_consumption')}
          />
        </Card>
        <Card className="border border-gray-200 p-4">
          <h2 className="mb-3 text-sm font-bold text-gray-900">{t('dash.recipes.cost_by_product')}</h2>
          <BarList
            data={data.products.slice(0, 12).map((p) => ({
              key: p.sold_item,
              label: p.item_name,
              value: p.cost,
              hint: t('dash.recipes.n_bills', { count: p.invoices }),
            }))}
            empty={t('dash.recipes.no_consumption')}
          />
        </Card>
      </div>
    </div>
  );
};

export default RecipesPage;
