import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChefHat, Check, ImagePlus, Plus, Sparkles, TriangleAlert, X } from 'lucide-react';
import { Button, Input, Spinner, showToast } from '@ury/ui';
import { call, parseFrappeError } from '@ury/core';
import { uploadImage } from '../../lib/uploadImage';
import { t } from '../../i18n';

export const MENU_API = 'ury.ury.api.menu_quick_add';

/**
 * Categories an Iraqi restaurant reaches for first. Offered as one-tap
 * suggestions when creating a category, so the common ones are spelled the
 * same way in every branch (and the POS picks a matching icon for each).
 */
export const IRAQI_CATEGORY_PRESETS = [
  'مشويات', 'كص وشاورما', 'دجاج', 'أكلات عراقية', 'تمن ومرق', 'سمك مسكوف',
  'مقبلات', 'سلطات', 'شوربات', 'سندويشات', 'برگر', 'بيتزا', 'معجنات',
  'فطور', 'حلويات', 'مشروبات باردة', 'مشروبات ساخنة', 'عصائر',
];

/** Iraqi dinar has no fractional unit in practice; prices land on these steps. */
const PRICE_SHORTCUTS = [1000, 1500, 2000, 3000, 5000, 7500, 10000, 15000];

export interface MenuKitchen { name: string; branch: string; item_groups: string[] }
export interface MenuCategory { name: string; count: number; kitchens: string[] }
export interface MenuRow {
  row: string;
  item: string;
  item_name: string;
  rate: number;
  category?: string;
  image?: string;
  special_dish?: number;
  disabled?: number;
  branch: string;
}
export interface MenuPageData {
  branches: { branch: string; restaurant: string; has_menu: boolean }[];
  items: MenuRow[];
  categories: MenuCategory[];
  kitchens: MenuKitchen[];
  currency?: string;
}

export const currencyLabel = (currency?: string) =>
  currency === 'IQD' ? t('dash.quick_item.iqd') : currency || '';

interface QuickItemFormProps {
  branch: string;
  data: MenuPageData;
  /** Present when editing an existing dish. */
  editing?: MenuRow | null;
  onSaved: () => Promise<void> | void;
  onClose: () => void;
}

const NEW_CATEGORY = '__new__';

export const QuickItemForm: React.FC<QuickItemFormProps> = ({ branch, data, editing, onSaved, onClose }) => {
  const isEdit = !!editing;
  const nameRef = useRef<HTMLInputElement>(null);

  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [itemName, setItemName] = useState(editing?.item_name || '');
  const [rate, setRate] = useState(editing?.rate ? String(editing.rate) : '');
  const [category, setCategory] = useState(editing?.category || '');
  const [newCategory, setNewCategory] = useState('');
  const [kitchen, setKitchen] = useState('');
  const [image, setImage] = useState(editing?.image || '');
  const [special, setSpecial] = useState(!!editing?.special_dish);
  const [hidden, setHidden] = useState(!!editing?.disabled);
  const [addedCount, setAddedCount] = useState(0);

  useEffect(() => {
    nameRef.current?.focus();
  }, []);

  const branchKitchens = useMemo(() => data.kitchens.filter((k) => k.branch === branch), [data.kitchens, branch]);

  const isNewCategory = category === NEW_CATEGORY;
  const resolvedCategory = (isNewCategory ? newCategory : category).trim();
  const existingCategory = data.categories.find((c) => c.name === resolvedCategory);
  const routedKitchens = (existingCategory?.kitchens || []).filter((k) => branchKitchens.some((b) => b.name === k));
  const needsKitchenChoice = branchKitchens.length > 1 && routedKitchens.length === 0;

  // Typing or tapping a category that already exists just selects it, so the
  // POS rail never ends up with two spellings of the same category.
  useEffect(() => {
    if (isNewCategory && existingCategory) {
      setCategory(existingCategory.name);
      setNewCategory('');
    }
  }, [isNewCategory, existingCategory]);

  useEffect(() => {
    if (!needsKitchenChoice) setKitchen('');
  }, [needsKitchenChoice]);

  const handleImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast.error(t('dash.menu.image_size_must_be_under_5mb'));
      return;
    }
    setUploading(true);
    try {
      setImage(await uploadImage(file));
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.quick_item.image_failed')));
    } finally {
      setUploading(false);
    }
  };

  const validationError = (): string => {
    if (!itemName.trim()) return t('dash.quick_item.enter_name');
    if (!(parseFloat(rate) > 0)) return t('dash.quick_item.enter_price');
    if (!resolvedCategory) return t('dash.quick_item.choose_category');
    if (resolvedCategory === itemName.trim()) return t('dash.quick_item.name_equals_category');
    if (needsKitchenChoice && !kitchen) return t('dash.quick_item.choose_kitchen');
    return '';
  };

  const save = async (addAnother: boolean) => {
    const problem = validationError();
    if (problem) {
      showToast.error(problem);
      return;
    }
    setSaving(true);
    try {
      if (isEdit && editing) {
        await call(`${MENU_API}.update_menu_item`, {
          branch,
          item: editing.item,
          item_name: itemName,
          rate,
          category: resolvedCategory,
          kitchen: kitchen || undefined,
          image: image || undefined,
          special_dish: special ? 1 : 0,
          disabled: hidden ? 1 : 0,
        });
        showToast.success(t('dash.quick_item.updated'));
        await onSaved();
        onClose();
        return;
      }

      const res = await call<any>(`${MENU_API}.quick_add_item`, {
        branch,
        item_name: itemName,
        rate,
        category: resolvedCategory,
        kitchen: kitchen || undefined,
        image: image || undefined,
        special_dish: special ? 1 : 0,
      });
      const result = res.message || res;
      showToast.success(
        t(result.reused ? 'dash.quick_item.added_existing' : 'dash.quick_item.added', { name: itemName.trim() }),
      );
      await onSaved();
      if (addAnother) {
        setAddedCount((n) => n + 1);
        // The new category exists now; keep it selected for the next dish.
        if (isNewCategory) {
          setCategory(resolvedCategory);
          setNewCategory('');
        }
        setItemName('');
        setRate('');
        setImage('');
        setSpecial(false);
        nameRef.current?.focus();
      } else {
        onClose();
      }
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.menu.failed_to_save_item')));
    } finally {
      setSaving(false);
    }
  };

  const rateNumber = parseFloat(rate);
  const chip = (active: boolean) =>
    `inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
      active
        ? 'border-primary bg-primary text-white'
        : 'border-gray-200 bg-white text-gray-700 hover:border-primary/50 hover:bg-primary/5'
    }`;

  return (
    <form
      className="space-y-5 text-sm"
      onSubmit={(e) => {
        e.preventDefault();
        save(!isEdit);
      }}
    >
      {/* 1. Name */}
      <div>
        <label className="block font-semibold text-gray-700 mb-1.5">
          {t('dash.quick_item.name')}<span className="text-red-500"> *</span>
        </label>
        <Input
          ref={nameRef}
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder={t('dash.quick_item.name_placeholder')}
          maxLength={140}
          className="font-medium w-full"
        />
      </div>

      {/* 2. Price */}
      <div>
        <label className="block font-semibold text-gray-700 mb-1.5">
          {t('dash.quick_item.price')} ({currencyLabel(data.currency)})<span className="text-red-500"> *</span>
        </label>
        <Input
          type="number"
          inputMode="numeric"
          min={0}
          step="any"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="5000"
          className="font-medium w-full tabular-nums"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PRICE_SHORTCUTS.map((p) => (
            <button key={p} type="button" onClick={() => setRate(String(p))} className={chip(rateNumber === p)}>
              {p.toLocaleString('en-US')}
            </button>
          ))}
        </div>
      </div>

      {/* 3. Category */}
      <div>
        <label className="block font-semibold text-gray-700 mb-1.5">
          {t('dash.quick_item.category')}<span className="text-red-500"> *</span>
        </label>
        <div className="flex flex-wrap gap-1.5">
          {data.categories.map((c) => (
            <button key={c.name} type="button" onClick={() => setCategory(c.name)} className={chip(category === c.name)}>
              {category === c.name && <Check className="w-3.5 h-3.5" />}
              {c.name}
            </button>
          ))}
          <button type="button" onClick={() => setCategory(NEW_CATEGORY)} className={`${chip(isNewCategory)} border-dashed`}>
            <Plus className="w-3.5 h-3.5" />
            {t('dash.quick_item.new_category')}
          </button>
        </div>

        {isNewCategory && (
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3 space-y-2.5">
            <Input
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
              placeholder={t('dash.quick_item.new_category_placeholder')}
              maxLength={140}
              className="w-full bg-white"
              autoFocus
            />
            <div>
              <p className="mb-1.5 flex items-center gap-1 text-xs font-semibold text-gray-500">
                <Sparkles className="w-3.5 h-3.5" /> {t('dash.quick_item.suggestions')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {IRAQI_CATEGORY_PRESETS.filter((p) => !data.categories.some((c) => c.name === p)).map((p) => (
                  <button key={p} type="button" onClick={() => setNewCategory(p)} className={chip(newCategory === p)}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Kitchen routing — decides where the kitchen ticket prints */}
      {resolvedCategory && (
        branchKitchens.length === 0 ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
            <TriangleAlert className="w-4 h-4 shrink-0" /> {t('dash.quick_item.no_kitchen')}
          </p>
        ) : needsKitchenChoice ? (
          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">
              {t('dash.quick_item.kitchen')}<span className="text-red-500"> *</span>
            </label>
            <div className="flex flex-wrap gap-1.5">
              {branchKitchens.map((k) => (
                <button key={k.name} type="button" onClick={() => setKitchen(k.name)} className={chip(kitchen === k.name)}>
                  <ChefHat className="w-3.5 h-3.5" /> {k.name}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-gray-500">{t('dash.quick_item.kitchen_hint')}</p>
          </div>
        ) : (
          <p className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800">
            <ChefHat className="w-4 h-4 shrink-0" />
            {t('dash.quick_item.prepared_in', {
              kitchen: (routedKitchens.length ? routedKitchens : [branchKitchens[0].name]).join('، '),
            })}
          </p>
        )
      )}

      {/* Optional extras */}
      <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 pt-4">
        {image ? (
          <span className="inline-flex items-center gap-2 rounded-md border border-gray-200 bg-gray-50 p-1 pe-2">
            <img src={image} alt="" className="h-8 w-8 rounded object-cover" />
            <button type="button" onClick={() => setImage('')} className="text-gray-400 hover:text-gray-700" aria-label={t('dash.menu.remove_image')}>
              <X className="w-4 h-4" />
            </button>
          </span>
        ) : (
          <label className={`inline-flex cursor-pointer items-center gap-1.5 text-xs font-semibold text-gray-600 hover:text-primary ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
            {uploading ? <Spinner className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
            {t('dash.quick_item.add_image')}
            <input type="file" accept="image/*" className="hidden" onChange={handleImage} disabled={uploading} />
          </label>
        )}
        <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
          <input type="checkbox" checked={special} onChange={(e) => setSpecial(e.target.checked)} className="h-4 w-4" />
          {t('dash.menu.special_dish')}
        </label>
        {isEdit && (
          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
            <input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} className="h-4 w-4" />
            {t('dash.quick_item.hide_from_pos')}
          </label>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2 border-t border-gray-100 pt-4">
        {addedCount > 0 && (
          <span className="me-auto text-xs font-medium text-emerald-700">
            {t('dash.quick_item.added_count', { count: addedCount })}
          </span>
        )}
        <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
          {addedCount > 0 ? t('dash.quick_item.done') : t('dash.menu.cancel')}
        </Button>
        {isEdit ? (
          <Button type="submit" disabled={saving || uploading} className="bg-primary text-white">
            {saving ? <Spinner className="w-4 h-4" /> : t('dash.quick_item.save_changes')}
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" onClick={() => save(false)} disabled={saving || uploading}>
              {t('dash.quick_item.save_close')}
            </Button>
            <Button type="submit" disabled={saving || uploading} className="bg-primary text-white">
              {saving ? <Spinner className="w-4 h-4" /> : t('dash.quick_item.save_next')}
            </Button>
          </>
        )}
      </div>
    </form>
  );
};

export default QuickItemForm;
