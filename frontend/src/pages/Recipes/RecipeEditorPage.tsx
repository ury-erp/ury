import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, ArrowRight, History, Info, Layers, Package, Search, Trash2, Warehouse as WarehouseIcon } from 'lucide-react';
import { formatCurrency, getIntlLocale, parseFrappeError } from '@ury/core';
import { Button, Card, ErrorState, Input, Spinner, showToast } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import {
  recipeService,
  type CostSource,
  type IngredientOption,
  type IngredientPrice,
  type RecipeDetail,
  type RecipeSetup,
  type UomOption,
} from '../../services/recipes';
import { formatQty } from '../Inventory/stockStatus';
import { formatServerDate } from '../../lib/statusLabels';
import { FoodCostBadge } from './foodCost';
import { t } from '../../i18n';

/**
 * One product's recipe: the ingredients one portion uses, priced at what they
 * were bought for. Saving makes it the recipe in force — every sale from then
 * on takes these ingredients out of stock — and keeps the old one as history.
 */

interface Line {
  key: number;
  item_code: string;
  item_name: string;
  is_kit: boolean;
  stock_uom: string;
  uom: string;
  uoms: UomOption[];
  qty: string;
  source_warehouse: string | null;
  price: IngredientPrice | null;
}

let lineKey = 0;
const num = (v: string) => {
  const n = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};
const factorOf = (l: Pick<Line, 'uom' | 'uoms'>) => l.uoms.find((u) => u.uom === l.uom)?.conversion_factor || 1;
const isWhole = (l: Pick<Line, 'uom' | 'uoms'>) => !!l.uoms.find((u) => u.uom === l.uom)?.whole_number;
const lineCost = (l: Line) => (l.price && l.price.cost_source !== 'none' ? num(l.qty) * factorOf(l) * l.price.unit_cost : null);

const uomLabel = (uom: string) => {
  const key = `dash.recipes.uom.${uom}`;
  const label = t(key);
  return label === key ? uom : label;
};

const SOURCE_STYLE: Record<CostSource, string> = {
  warehouse: 'text-gray-500',
  average: 'text-gray-500',
  purchase: 'text-blue-700',
  none: 'text-red-700 font-semibold',
};

function useDebounced<T>(value: T, delay = 250) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = window.setTimeout(() => setV(value), delay);
    return () => window.clearTimeout(id);
  }, [value, delay]);
  return v;
}

// ------------------------------------------------------------------ ingredient search

const IngredientSearch: React.FC<{ warehouse?: string; exclude: string; onPick: (o: IngredientOption) => void }> = ({ warehouse, exclude, onPick }) => {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<IngredientOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const debounced = useDebounced(term);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    recipeService
      .searchIngredients(debounced, warehouse, exclude)
      .then((res) => {
        if (!cancelled) {
          setOptions(res);
          setActive(0);
        }
      })
      .catch(() => !cancelled && setOptions([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, open, warehouse, exclude]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => box.current && !box.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (o: IngredientOption) => {
    onPick(o);
    setTerm('');
    input.current?.focus();
  };

  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <Input
        ref={input}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && options[active]) pick(options[active]);
          } else if (e.key === 'Escape') setOpen(false);
        }}
        placeholder={t('dash.recipes.ingredient_placeholder')}
        className="ps-9"
        role="combobox"
        aria-expanded={open}
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {loading && !options.length ? (
            <div className="flex justify-center py-4"><Spinner className="w-5 h-5 text-primary" /></div>
          ) : !options.length ? (
            <p className="px-3 py-3 text-sm text-gray-500">{t('dash.recipes.no_ingredients')}</p>
          ) : (
            options.map((o, i) => (
              <button
                key={o.item_code}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(o)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-start ${i === active ? 'bg-primary/10' : 'hover:bg-gray-50'}`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                    {o.is_kit && <Layers className="h-3.5 w-3.5 text-violet-600" aria-label={t('dash.recipes.kit')} />}
                    <span className="truncate">{o.item_name}</span>
                  </span>
                  <span className="block text-[11px] text-gray-500">
                    {o.item_group}
                    {o.available_qty !== null && ` · ${t('dash.purchases.in_stock', { qty: formatQty(Number(o.available_qty.toFixed(3))), uom: o.stock_uom })}`}
                  </span>
                </span>
                <span className="shrink-0 text-end text-xs">
                  {o.cost_source === 'none' ? (
                    <span className="text-red-600">{t('dash.recipes.source_none')}</span>
                  ) : (
                    <>
                      <span className="block font-semibold tabular-nums text-gray-900">{formatCurrency(o.unit_cost)}</span>
                      <span className="block text-[10px] text-gray-400">/ {o.stock_uom}</span>
                    </>
                  )}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ------------------------------------------------------------------ page

export const RecipeEditorPage: React.FC = () => {
  const { item = '' } = useParams();
  const navigate = useNavigate();
  const { activeBranchId } = useBranchContext();
  const locale = getIntlLocale();

  const [setup, setSetup] = useState<RecipeSetup | null>(null);
  const [detail, setDetail] = useState<RecipeDetail | null>(null);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  const [lines, setLines] = useState<Line[]>([]);
  const [warehouse, setWarehouse] = useState<string>('');
  const [dirty, setDirty] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [s, d] = await Promise.all([recipeService.setup(activeBranchId), recipeService.get(item, activeBranchId)]);
      setSetup(s);
      setDetail(d);
      setWarehouse(d.source_warehouse || '');
      setLines(
        d.ingredients.map((i) => ({
          key: ++lineKey,
          item_code: i.item_code,
          item_name: i.item_name,
          is_kit: i.is_kit,
          stock_uom: i.stock_uom,
          uom: i.uom,
          uoms: i.uoms,
          qty: String(+i.qty.toFixed(6)),
          source_warehouse: i.source_warehouse,
          price: { unit_cost: i.unit_cost, cost_source: i.cost_source, available_qty: i.available_qty, last_purchase: i.last_purchase },
        })),
      );
      setDirty(false);
      setErrors({});
    } catch (err) {
      setError(parseFrappeError(err, t('dash.recipes.load_failed')));
    }
  }, [item, activeBranchId]);

  useEffect(() => {
    void load();
  }, [load, attempt]);

  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const effectiveWarehouse = warehouse || detail?.default_warehouse || undefined;

  // Re-price every ingredient when the warehouse they come from changes.
  const codesKey = lines.map((l) => l.item_code).join('|');
  useEffect(() => {
    if (!detail || !lines.length) return;
    let cancelled = false;
    recipeService
      .price(lines.map((l) => l.item_code), effectiveWarehouse)
      .then((prices) => {
        if (cancelled) return;
        setLines((prev) => prev.map((l) => (prices[l.item_code] ? { ...l, price: prices[l.item_code] } : l)));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveWarehouse, codesKey, detail]);

  const add = (o: IngredientOption) => {
    setDirty(true);
    setErrors((e) => ({ ...e, lines: '' }));
    setLines((prev) => {
      if (prev.some((l) => l.item_code === o.item_code)) {
        showToast.error(t('dash.recipes.already_added', { name: o.item_name }));
        return prev;
      }
      // Kitchen recipes are usually measured smaller than the stock unit: offer grams for kilos, ml for litres.
      const preferred = o.uoms.find((u) => u.uom === 'Gram' && o.stock_uom === 'Kg') || o.uoms.find((u) => u.uom === 'Millilitre' && o.stock_uom === 'Litre');
      return [
        ...prev,
        {
          key: ++lineKey,
          item_code: o.item_code,
          item_name: o.item_name,
          is_kit: o.is_kit,
          stock_uom: o.stock_uom,
          uom: preferred?.uom || o.stock_uom,
          uoms: o.uoms,
          qty: '1',
          source_warehouse: null,
          price: { unit_cost: o.unit_cost, cost_source: o.cost_source, available_qty: o.available_qty },
        },
      ];
    });
  };

  const update = (key: number, changes: Partial<Line>) => {
    setDirty(true);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  };

  const total = useMemo(() => lines.reduce((s, l) => s + (lineCost(l) || 0), 0), [lines]);
  const complete = lines.every((l) => l.price && l.price.cost_source !== 'none');
  const price = detail?.price || null;
  const foodCost = price && lines.length ? (total / price) * 100 : null;

  const validate = () => {
    const next: Record<string, string> = {};
    if (!lines.length) next.lines = t('dash.recipes.err_no_ingredients');
    for (const l of lines) {
      const q = num(l.qty);
      if (q <= 0) next[`q_${l.key}`] = t('dash.recipes.err_qty');
      else if (isWhole(l) && !Number.isInteger(q)) next[`q_${l.key}`] = t('dash.recipes.err_whole', { uom: l.uom });
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const save = async () => {
    if (!detail || !validate()) return;
    setSaving(true);
    try {
      const res = await recipeService.save(item, {
        recipe: detail.recipe,
        branch: activeBranchId,
        source_warehouse: warehouse || null,
        ingredients: lines.map((l) => ({ item_code: l.item_code, qty: num(l.qty), uom: l.uom, source_warehouse: l.source_warehouse })),
      });
      setDirty(false);
      showToast.success(res.changed ? t('dash.recipes.saved') : t('dash.recipes.unchanged'));
      await load();
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.recipes.save_failed')));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!detail) return;
    setRemoving(true);
    try {
      await recipeService.remove(item, detail.recipe);
      setDirty(false);
      showToast.success(t('dash.recipes.removed'));
      setConfirmRemove(false);
      await load();
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.recipes.save_failed')));
    } finally {
      setRemoving(false);
    }
  };

  const back = () => {
    if (dirty && !window.confirm(t('dash.purchases.discard_changes'))) return;
    setDirty(false);
    if (window.history.length > 1) navigate(-1);
    else navigate('/recipes');
  };

  if (error) {
    return <ErrorState className="py-24" title={t('dash.recipes.load_failed')} description={error} retryLabel={t('common.retry')} onRetry={() => setAttempt((n) => n + 1)} />;
  }
  if (!detail || !setup) {
    return <div className="flex justify-center py-24"><Spinner className="w-8 h-8 text-primary" /></div>;
  }

  const canWrite = setup.permissions.write;
  const whLabel = (name?: string | null) => (name && setup.warehouses.find((w) => w.name === name)?.label) || name || '—';
  const defaultUnit = setup.production_units.find((u) => u.warehouse === detail.default_warehouse && u.item_groups.includes(detail.item.item_group));

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={back} className="mt-0.5 h-9 w-9 p-0" aria-label={t('common.back')}>
          <ArrowRight className="w-5 h-5 ltr:rotate-180" />
        </Button>
        {detail.item.image ? (
          <img src={detail.item.image} alt="" className="h-12 w-12 rounded-lg object-cover" />
        ) : (
          <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-gray-100 text-gray-400"><Package className="h-5 w-5" /></span>
        )}
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-bold text-gray-900">{detail.item.item_name}</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            {detail.item.item_group} · {detail.recipe ? t('dash.recipes.recipe_in_force') : t('dash.recipes.no_recipe_yet')}
          </p>
        </div>
      </div>

      {detail.item.is_stock_item ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>{t('dash.recipes.warn_stock_item')}</span>
        </div>
      ) : (
        <div className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{t('dash.recipes.how_it_works')}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        {/* Ingredients */}
        <Card className="border border-gray-200 lg:col-span-2">
          <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
            <h2 className="text-sm font-bold text-gray-900">{t('dash.recipes.ingredients_per_portion')}</h2>
            {lines.length > 0 && <span className="text-xs text-gray-500">{t('dash.recipes.n_ingredients', { count: lines.length })}</span>}
          </div>
          {canWrite && (
            <div className="p-5 pb-3">
              <IngredientSearch warehouse={effectiveWarehouse} exclude={item} onPick={add} />
              {errors.lines && <p className="mt-2 text-xs text-red-600">{errors.lines}</p>}
            </div>
          )}

          {lines.length === 0 ? (
            <p className="px-5 pb-10 pt-4 text-center text-sm text-gray-400">{t('dash.recipes.no_ingredients_yet')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="bg-gray-50 text-xs font-semibold text-gray-500">
                  <tr>
                    <th className="px-5 py-2.5 text-start">{t('dash.recipes.ingredient')}</th>
                    <th className="w-28 px-2 py-2.5 text-start">{t('fields.qty')}</th>
                    <th className="w-32 px-2 py-2.5 text-start">{t('dash.purchases.unit')}</th>
                    <th className="px-3 py-2.5 text-end">{t('dash.recipes.unit_cost')}</th>
                    <th className="px-3 py-2.5 text-end">{t('dash.recipes.line_cost')}</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {lines.map((l) => {
                    const cost = lineCost(l);
                    const share = cost && total ? (cost / total) * 100 : 0;
                    const perUnit = l.price && l.price.cost_source !== 'none' ? l.price.unit_cost * factorOf(l) : null;
                    const needed = num(l.qty) * factorOf(l);
                    const short = l.price?.available_qty != null && !l.is_kit && l.price.available_qty < needed;
                    return (
                      <tr key={l.key} className="align-top">
                        <td className="px-5 py-3">
                          <p className="flex items-center gap-1.5 font-semibold text-gray-900">
                            {l.is_kit && <Layers className="h-3.5 w-3.5 text-violet-600" aria-label={t('dash.recipes.kit')} />}
                            {l.item_name}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-500">
                            {l.price?.available_qty != null &&
                              t('dash.purchases.in_stock', { qty: formatQty(Number(l.price.available_qty.toFixed(3))), uom: l.stock_uom })}
                            {l.uom !== l.stock_uom && ` · ${formatQty(Number(needed.toFixed(6)))} ${l.stock_uom}`}
                          </p>
                          {short && (
                            <p className="mt-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-amber-800">
                              <AlertTriangle className="h-3 w-3 text-amber-500" /> {t('dash.recipes.not_enough_for_one')}
                            </p>
                          )}
                          {l.source_warehouse && (
                            <p className="mt-0.5 text-[11px] text-gray-500">{t('dash.recipes.from_warehouse', { warehouse: whLabel(l.source_warehouse) })}</p>
                          )}
                          {cost != null && total > 0 && (
                            <div className="mt-1.5 h-1 w-full max-w-[220px] rounded-full bg-gray-100">
                              <div className="h-1 rounded-full bg-[#2a78d6]" style={{ width: `${Math.max(share, 1)}%` }} />
                            </div>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step={isWhole(l) ? 1 : 'any'}
                            value={l.qty}
                            disabled={!canWrite}
                            onChange={(e) => update(l.key, { qty: e.target.value })}
                            onFocus={(e) => e.target.select()}
                            className={`h-10 tabular-nums ${errors[`q_${l.key}`] ? 'border-red-400' : ''}`}
                            aria-label={t('fields.qty')}
                          />
                          {errors[`q_${l.key}`] && <p className="mt-1 text-[11px] leading-tight text-red-600">{errors[`q_${l.key}`]}</p>}
                        </td>
                        <td className="px-2 py-3">
                          {l.uoms.length > 1 ? (
                            <select
                              value={l.uom}
                              disabled={!canWrite}
                              onChange={(e) => update(l.key, { uom: e.target.value })}
                              className="h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
                              aria-label={t('dash.purchases.unit')}
                            >
                              {l.uoms.map((u) => (
                                <option key={u.uom} value={u.uom}>{uomLabel(u.uom)}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-block pt-2.5 text-sm text-gray-600">{uomLabel(l.uom)}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-end">
                          {perUnit != null ? (
                            <>
                              <p className="tabular-nums text-gray-700">{formatCurrency(perUnit)}</p>
                              <p className={`text-[10px] ${SOURCE_STYLE[l.price!.cost_source]}`}>{t(`dash.recipes.source_${l.price!.cost_source}`)}</p>
                            </>
                          ) : (
                            <p className={`text-[11px] ${SOURCE_STYLE.none}`}>{t('dash.recipes.source_none')}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-end font-semibold tabular-nums whitespace-nowrap">
                          {cost != null ? formatCurrency(cost) : '—'}
                        </td>
                        <td className="py-3 pe-3">
                          {canWrite && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-10 w-10 p-0 text-gray-400 hover:text-red-600"
                              onClick={() => {
                                setDirty(true);
                                setLines((prev) => prev.filter((x) => x.key !== l.key));
                              }}
                              aria-label={t('dash.purchases.remove_item')}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Summary */}
        <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <Card className="border border-gray-200 p-5">
            <h2 className="mb-3 text-sm font-bold text-gray-900">{t('dash.recipes.cost_summary')}</h2>
            <div className="flex items-baseline justify-between">
              <span className="text-sm text-gray-600">{t('dash.recipes.portion_cost')}</span>
              <span className="text-2xl font-bold tabular-nums text-gray-900">{formatCurrency(total)}</span>
            </div>
            {!complete && lines.length > 0 && (
              <p className="mt-1 flex items-start gap-1 text-[11px] text-amber-800">
                <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" /> {t('dash.recipes.cost_incomplete')}
              </p>
            )}
            <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
              <span className="text-gray-600">{t('dash.recipes.price')}</span>
              <span className="font-semibold tabular-nums text-gray-900">{price ? formatCurrency(price) : '—'}</span>
            </div>
            {price ? (
              <>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span className="text-gray-600">{t('dash.recipes.margin')}</span>
                  <span className="font-semibold tabular-nums text-gray-900">{formatCurrency(price - total)}</span>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-sm text-gray-600">{t('dash.recipes.food_cost')}</span>
                  <FoodCostBadge percent={foodCost} large />
                </div>
              </>
            ) : (
              <p className="mt-2 text-[11px] text-gray-400">{t('dash.recipes.no_price')}</p>
            )}
          </Card>

          <Card className="border border-gray-200 p-5">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-gray-900" htmlFor="r-wh">
              <WarehouseIcon className="h-3.5 w-3.5 text-primary" /> {t('dash.recipes.take_from')}
            </label>
            <select
              id="r-wh"
              value={warehouse}
              disabled={!canWrite}
              onChange={(e) => {
                setWarehouse(e.target.value);
                setDirty(true);
              }}
              className="h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
            >
              <option value="">{t('dash.recipes.take_from_default', { warehouse: whLabel(detail.default_warehouse) })}</option>
              {setup.warehouses.map((w) => (
                <option key={w.name} value={w.name}>{w.label}</option>
              ))}
            </select>
            <p className="mt-1.5 text-[11px] text-gray-500">
              {defaultUnit
                ? t('dash.recipes.take_from_unit_hint', { unit: defaultUnit.label })
                : t('dash.recipes.take_from_hint')}
            </p>
          </Card>

          {canWrite && (
            <div className="flex flex-col gap-2">
              <Button className="w-full gap-2 bg-primary text-white" disabled={saving || !dirty} onClick={() => void save()}>
                {saving && <Spinner className="h-4 w-4" />}
                {detail.recipe ? t('dash.recipes.save_changes') : t('dash.recipes.save_recipe')}
              </Button>
              {dirty && (
                <Button variant="outline" className="w-full" disabled={saving} onClick={() => void load()}>
                  {t('dash.recipes.discard')}
                </Button>
              )}
              {detail.recipe && !dirty && (
                <Button variant="outline" className="w-full gap-2 text-red-600 hover:text-red-700" onClick={() => setConfirmRemove(true)}>
                  <Trash2 className="h-4 w-4" /> {t('dash.recipes.remove')}
                </Button>
              )}
            </div>
          )}

          {detail.history.length > 0 && (
            <Card className="border border-gray-200 p-5">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold text-gray-900">
                <History className="h-4 w-4 text-primary" /> {t('dash.recipes.history')}
              </h2>
              <ol className="space-y-2">
                {detail.history.map((h) => (
                  <li key={h.name} className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-gray-600">
                      {formatServerDate(h.creation.split(' ')[0], locale)} · {h.by}
                    </span>
                    {h.current && <span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-green-800">{t('dash.recipes.current')}</span>}
                  </li>
                ))}
              </ol>
            </Card>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmRemove}
        tone="danger"
        title={t('dash.recipes.remove_title')}
        description={t('dash.recipes.remove_body')}
        confirmLabel={t('dash.recipes.remove')}
        busy={removing}
        onConfirm={() => void remove()}
        onClose={() => setConfirmRemove(false)}
      />
    </div>
  );
};

export default RecipeEditorPage;
