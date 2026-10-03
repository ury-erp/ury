import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useBranchContext } from '../../context/BranchContext';
import { Edit2, Eye, EyeOff, LayoutGrid, List, Plus, Search, Star, Utensils, X } from 'lucide-react';
import { Button, EmptyState, Input, Spinner, showToast } from '@ury/ui';
import { call, flt, parseFrappeError } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';
import {
  QuickItemForm,
  MENU_API,
  currencyLabel,
  type MenuPageData,
  type MenuRow,
} from '../../components/menu/QuickItemForm';
import { t } from '../../i18n';

/**
 * The restaurant's menu: one list of items per branch.
 *
 * There used to be menus, courses and items to juggle, each with its own
 * drawer. A restaurant sells items in categories; that is all this page
 * shows. The branch's active menu is the list, created on the first item,
 * and the category is the item group the POS and the kitchen both read.
 */

type StatusFilter = 'all' | 'visible' | 'hidden' | 'special';
type DrawerState = { mode: 'none' } | { mode: 'add' } | { mode: 'edit'; item: MenuRow };

const EMPTY: MenuPageData = { branches: [], items: [], categories: [], kitchens: [] };

export const MenuPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [data, setData] = useState<MenuPageData>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('list');

  const [drawer, setDrawer] = useState<DrawerState>({ mode: 'none' });
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [togglingItem, setTogglingItem] = useState('');

  const load = useCallback(async () => {
    setLoadError('');
    try {
      const res = await call<any>(`${MENU_API}.get_menu_page`, { branch: activeBranchId });
      setData((res.message || res) as MenuPageData);
    } catch (err) {
      setLoadError(parseFrappeError(err, t('dash.quick_item.load_failed')));
    } finally {
      setLoading(false);
    }
  }, [activeBranchId]);

  useEffect(() => {
    setLoading(true);
    setCategoryFilter('');
    load();
  }, [load]);

  // Adding and editing need one branch. "All branches" with a single
  // restaurant is that restaurant; with several, the user picks one first.
  const workingBranch =
    activeBranchId !== 'all' ? activeBranchId : data.branches.length === 1 ? data.branches[0].branch : '';
  const showBranchColumn = activeBranchId === 'all' && data.branches.length > 1;

  const counts = useMemo(() => ({
    all: data.items.length,
    visible: data.items.filter((i) => !i.disabled).length,
    hidden: data.items.filter((i) => i.disabled).length,
    special: data.items.filter((i) => i.special_dish).length,
  }), [data.items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLowerCase();
    return data.items.filter((item) => {
      if (term && !(item.item_name || item.item).toLowerCase().includes(term)) return false;
      if (categoryFilter && item.category !== categoryFilter) return false;
      if (statusFilter === 'visible' && item.disabled) return false;
      if (statusFilter === 'hidden' && !item.disabled) return false;
      if (statusFilter === 'special' && !item.special_dish) return false;
      return true;
    });
  }, [data.items, search, categoryFilter, statusFilter]);

  const hasFilters = !!search.trim() || !!categoryFilter || statusFilter !== 'all';
  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('');
    setStatusFilter('all');
  };

  const openAdd = () => {
    if (!workingBranch) {
      showToast.error(t('dash.menu_page.choose_branch_first'));
      return;
    }
    setDrawer({ mode: 'add' });
  };

  const toggleVisibility = async (item: MenuRow) => {
    setTogglingItem(item.item);
    try {
      await call(`${MENU_API}.update_menu_item`, {
        branch: item.branch,
        item: item.item,
        item_name: item.item_name,
        rate: item.rate,
        category: item.category,
        image: item.image || undefined,
        special_dish: item.special_dish ? 1 : 0,
        disabled: item.disabled ? 0 : 1,
      });
      showToast.success(t(item.disabled ? 'dash.menu_page.now_visible' : 'dash.menu_page.now_hidden', { name: item.item_name }));
      await load();
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.menu.failed_to_save_item')));
    } finally {
      setTogglingItem('');
    }
  };

  const money = (value: number) => `${flt(value).toLocaleString('en-US')} ${currencyLabel(data.currency)}`;

  const statusTabs: { key: StatusFilter; label: string; count: number }[] = [
    { key: 'all', label: t('dash.menu_page.status_all'), count: counts.all },
    { key: 'visible', label: t('dash.menu_page.status_visible'), count: counts.visible },
    { key: 'hidden', label: t('dash.menu_page.status_hidden'), count: counts.hidden },
    { key: 'special', label: t('dash.menu_page.status_special'), count: counts.special },
  ];

  const chip = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? 'border-primary bg-primary text-white'
        : 'border-gray-200 bg-white text-gray-700 hover:border-primary/50 hover:bg-primary/5'
    }`;

  const ItemThumb = ({ item, className }: { item: MenuRow; className: string }) =>
    item.image ? (
      <img
        src={item.image}
        alt={item.item_name}
        className={`${className} object-cover cursor-pointer hover:opacity-90`}
        onClick={() => setPreviewImageUrl(item.image || null)}
      />
    ) : (
      <div className={`${className} bg-gray-100 flex items-center justify-center`}>
        <Utensils className="w-4 h-4 text-gray-400" />
      </div>
    );

  const RowActions = ({ item }: { item: MenuRow }) => (
    <div className="flex items-center justify-end gap-1">
      <button
        type="button"
        onClick={() => toggleVisibility(item)}
        disabled={togglingItem === item.item}
        className="p-1.5 rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-50"
        title={item.disabled ? t('dash.menu_page.show_on_pos') : t('dash.quick_item.hide_from_pos')}
        aria-label={item.disabled ? t('dash.menu_page.show_on_pos') : t('dash.quick_item.hide_from_pos')}
      >
        {togglingItem === item.item ? <Spinner className="w-4 h-4" /> : item.disabled ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
      </button>
      <button
        type="button"
        onClick={() => setDrawer({ mode: 'edit', item })}
        className="p-1.5 rounded-md text-gray-400 hover:text-primary hover:bg-primary/5"
        title={t('dash.menu.edit_item')}
        aria-label={t('dash.menu.edit_item')}
      >
        <Edit2 className="w-4 h-4" />
      </button>
    </div>
  );

  return (
    <div className="space-y-4 max-w-[1600px] mx-auto">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t('dash.menu_page.title')}</h1>
          <p className="text-sm text-gray-500">
            {t('dash.menu_page.summary', { items: counts.all, categories: data.categories.filter((c) => c.count).length })}
          </p>
        </div>
        <Button onClick={openAdd} className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          {t('dash.menu.add_item')}
        </Button>
      </div>

      {/* Filters */}
      <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="search"
              placeholder={t('dash.menu_page.search_placeholder')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="ps-9 bg-gray-50 border-gray-200 w-full"
            />
          </div>

          <div className="flex items-center rounded-lg bg-gray-100 p-1" role="tablist" aria-label={t('dash.menu_page.status_label')}>
            {statusTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={statusFilter === tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  statusFilter === tab.key ? 'bg-white text-primary shadow-sm' : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.label} <span className="tabular-nums text-gray-400">({tab.count})</span>
              </button>
            ))}
          </div>

          <div className="flex items-center rounded-lg bg-gray-100 p-1">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              aria-label={t('dash.menu_page.list_view')}
              className={`p-1.5 rounded-md ${viewMode === 'list' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
            >
              <List className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              aria-label={t('dash.menu_page.grid_view')}
              className={`p-1.5 rounded-md ${viewMode === 'grid' ? 'bg-white shadow-sm text-primary' : 'text-gray-500'}`}
            >
              <LayoutGrid className="w-4 h-4" />
            </button>
          </div>
        </div>

        {data.categories.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <span className="shrink-0 text-xs font-semibold text-gray-500 me-1">{t('dash.quick_item.category')}:</span>
            <button type="button" onClick={() => setCategoryFilter('')} className={chip(!categoryFilter)}>
              {t('dash.menu_page.all_categories')} <span className="opacity-70">({counts.all})</span>
            </button>
            {data.categories.filter((c) => c.count > 0).map((c) => (
              <button key={c.name} type="button" onClick={() => setCategoryFilter(c.name)} className={chip(categoryFilter === c.name)}>
                {c.name} <span className="opacity-70">({c.count})</span>
              </button>
            ))}
          </div>
        )}

        {hasFilters && (
          <div className="flex items-center justify-between border-t border-gray-100 pt-2 text-xs text-gray-500">
            <span>{t('dash.menu_page.showing', { shown: filteredItems.length, total: counts.all })}</span>
            <button type="button" onClick={clearFilters} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              <X className="w-3.5 h-3.5" /> {t('dash.menu_page.clear_filters')}
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-24 flex items-center justify-center rounded-xl border border-gray-100 bg-white">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : loadError ? (
        <EmptyState
          className="rounded-xl border border-gray-100 bg-white py-16"
          title={loadError}
          action={<Button variant="outline" onClick={load}>{t('common.retry')}</Button>}
        />
      ) : filteredItems.length === 0 ? (
        <EmptyState
          className="rounded-xl border border-gray-100 bg-white py-16"
          icon={<Utensils />}
          illustration={hasFilters ? undefined : 'menu'}
          title={hasFilters ? t('dash.menu_page.no_match') : t('dash.menu_page.empty_title')}
          description={hasFilters ? undefined : t('dash.menu_page.empty_hint')}
          action={
            hasFilters ? (
              <Button variant="outline" onClick={clearFilters}>{t('dash.menu_page.clear_filters')}</Button>
            ) : (
              <Button onClick={openAdd} className="bg-primary text-white">
                <Plus className="w-4 h-4 me-1" /> {t('dash.menu.add_item')}
              </Button>
            )
          }
        />
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {filteredItems.map((item) => (
            <div
              key={`${item.branch}-${item.row}`}
              className={`bg-white rounded-lg border border-gray-100 shadow-sm overflow-hidden flex flex-col ${item.disabled ? 'opacity-60' : ''}`}
            >
              <ItemThumb item={item} className="h-24 w-full" />
              <div className="flex-1 p-3 flex flex-col gap-1">
                <h3 className="font-semibold text-gray-900 text-sm line-clamp-2 flex items-center gap-1" title={item.item_name}>
                  {!!item.special_dish && <Star className="w-3.5 h-3.5 shrink-0 fill-amber-400 text-amber-400" />}
                  {item.item_name}
                </h3>
                <p className="text-xs text-gray-500 truncate">{item.category || t('dash.menu_page.no_category')}</p>
                <div className="mt-auto pt-2 flex items-center justify-between">
                  <span className="text-sm font-bold text-gray-900 tabular-nums">{money(item.rate)}</span>
                  <RowActions item={item} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-x-auto">
          <table className="w-full text-start text-sm text-gray-600 min-w-[640px]">
            <thead className="bg-gray-50/80 border-b border-gray-100 text-xs text-gray-500 font-bold">
              <tr>
                <th className="px-5 py-3 text-start">{t('dash.quick_item.name')}</th>
                <th className="px-5 py-3 text-start">{t('dash.quick_item.category')}</th>
                {showBranchColumn && <th className="px-5 py-3 text-start">{t('dash.menu.branch')}</th>}
                <th className="px-5 py-3 text-start">{t('dash.quick_item.price')}</th>
                <th className="px-5 py-3 text-start">{t('dash.menu_page.status_label')}</th>
                <th className="px-5 py-3 text-end">{t('dash.menu.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredItems.map((item) => (
                <tr key={`${item.branch}-${item.row}`} className={item.disabled ? 'bg-gray-50/60' : ''}>
                  <td className="px-5 py-3 font-semibold text-gray-900">
                    <div className="flex items-center gap-3">
                      <ItemThumb item={item} className="w-9 h-9 rounded-md shrink-0" />
                      <span className="flex items-center gap-1">
                        {item.item_name}
                        {!!item.special_dish && <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" aria-label={t('dash.menu.special_dish')} />}
                      </span>
                    </div>
                  </td>
                  <td className="px-5 py-3">
                    <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                      {item.category || t('dash.menu_page.no_category')}
                    </span>
                  </td>
                  {showBranchColumn && <td className="px-5 py-3 text-xs">{item.branch}</td>}
                  <td className="px-5 py-3 font-bold text-gray-900 tabular-nums">{money(item.rate)}</td>
                  <td className="px-5 py-3">
                    {item.disabled ? (
                      <span className="rounded-full bg-gray-200 px-2.5 py-1 text-xs font-semibold text-gray-600">{t('dash.menu_page.badge_hidden')}</span>
                    ) : (
                      <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{t('dash.menu_page.badge_visible')}</span>
                    )}
                  </td>
                  <td className="px-5 py-3"><RowActions item={item} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SideDrawer
        isOpen={drawer.mode !== 'none'}
        onClose={() => setDrawer({ mode: 'none' })}
        title={drawer.mode === 'edit' ? t('dash.menu.edit_item') : t('dash.quick_item.title')}
      >
        {drawer.mode !== 'none' && (
          <QuickItemForm
            key={drawer.mode === 'edit' ? drawer.item.item : 'add'}
            branch={drawer.mode === 'edit' ? drawer.item.branch : workingBranch}
            data={data}
            editing={drawer.mode === 'edit' ? drawer.item : null}
            onSaved={load}
            onClose={() => setDrawer({ mode: 'none' })}
          />
        )}
      </SideDrawer>

      {previewImageUrl && createPortal(
        <div
          className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4"
          onClick={() => setPreviewImageUrl(null)}
        >
          <img src={previewImageUrl} alt="" className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl" />
        </div>,
        document.body
      )}
    </div>
  );
};

export default MenuPage;
