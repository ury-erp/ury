import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Banknote, CalendarClock, Package, Search, Trash2, Truck, UserPlus, X } from 'lucide-react';
import { formatCurrency, parseFrappeError } from '@ury/core';
import { Button, Card, Dialog, DialogContent, DialogHeader, DialogTitle, ErrorState, Input, Spinner, Textarea, showToast } from '@ury/ui';
import { useBranchContext } from '../../context/BranchContext';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import {
  purchaseService,
  type PurchaseItemOption,
  type PurchasePayload,
  type PurchaseSetup,
  type SupplierOption,
} from '../../services/purchases';
import { t } from '../../i18n';

/**
 * Record what was bought: supplier, the goods with their quantities and
 * prices, where they go, and whether the supplier was paid on the spot.
 *
 * "Post" receives the goods into the warehouse and records the bill in the
 * accounts in one step; "Save as draft" keeps it editable for later.
 */

interface Line {
  key: number;
  item_code: string;
  item_name: string;
  stock_uom: string;
  uom: string;
  uoms: { uom: string; conversion_factor: number }[];
  qty: string;
  rate: string;
  actual_qty: number | null;
  last_rate_from_supplier: boolean;
}

const num = (value: string) => {
  const n = Number(String(value).replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

const factorOf = (line: Pick<Line, 'uom' | 'uoms'>) =>
  line.uoms.find((u) => u.uom === line.uom)?.conversion_factor || 1;

const fieldLabel = 'mb-1.5 block text-xs font-semibold text-gray-700';
const selectClass =
  'h-11 w-full rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-gray-50';

let lineKey = 0;

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// --------------------------------------------------------------------- supplier

const SupplierPicker: React.FC<{
  value: SupplierOption | null;
  onChange: (s: SupplierOption | null) => void;
  canCreate: boolean;
  error?: string;
}> = ({ value, onChange, canCreate, error }) => {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SupplierOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [saving, setSaving] = useState(false);
  const debounced = useDebounced(term);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    purchaseService
      .searchSuppliers(debounced)
      .then((res) => {
        if (!cancelled) {
          setOptions(res);
          setActive(-1);
        }
      })
      .catch(() => !cancelled && setOptions([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, open]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (s: SupplierOption) => {
    onChange(s);
    setTerm('');
    setOpen(false);
  };

  const startCreate = () => {
    setNewName(term.trim());
    setNewMobile('');
    setCreating(true);
    setOpen(false);
  };

  const create = async () => {
    if (!newName.trim()) return;
    setSaving(true);
    try {
      const s = await purchaseService.createSupplier(newName.trim(), newMobile.trim() || undefined);
      showToast.success(t('dash.purchases.supplier_added'));
      setCreating(false);
      pick(s);
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.purchases.supplier_add_failed')));
    } finally {
      setSaving(false);
    }
  };

  if (value) {
    return (
      <div className="flex h-11 items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3">
        <div className="flex min-w-0 items-center gap-2">
          <Truck className="w-4 h-4 shrink-0 text-primary" />
          <span className="truncate text-sm font-semibold text-gray-900">{value.supplier_name || value.name}</span>
          {value.mobile_no && <span className="text-xs text-gray-500" dir="ltr">{value.mobile_no}</span>}
        </div>
        <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-primary hover:underline">
          {t('dash.purchases.change')}
        </button>
      </div>
    );
  }

  const showCreate = canCreate && !loading;
  const count = options.length + (showCreate ? 1 : 0);

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <Input
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, count - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter' && open && active >= 0) {
            e.preventDefault();
            if (active < options.length) pick(options[active]);
            else startCreate();
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder={t('dash.purchases.supplier_placeholder')}
        className={`ps-9 ${error ? 'border-red-400' : ''}`}
        aria-invalid={!!error}
        role="combobox"
        aria-expanded={open}
      />
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
      {open && (
        <div className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {loading && options.length === 0 ? (
            <div className="flex justify-center py-4"><Spinner className="w-5 h-5 text-primary" /></div>
          ) : (
            <>
              {options.map((s, i) => (
                <button
                  key={s.name}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-start text-sm ${i === active ? 'bg-primary/10' : 'hover:bg-gray-50'}`}
                >
                  <span className="font-medium text-gray-900">{s.supplier_name || s.name}</span>
                  <span className="text-xs text-gray-400">{s.supplier_group}</span>
                </button>
              ))}
              {options.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">{t('dash.purchases.no_suppliers')}</p>}
              {showCreate && (
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={startCreate}
                  className={`flex w-full items-center gap-2 border-t border-gray-100 px-3 py-2 text-start text-sm font-semibold text-primary ${
                    active === options.length ? 'bg-primary/10' : 'hover:bg-gray-50'
                  }`}
                >
                  <UserPlus className="w-4 h-4" />
                  {term.trim() ? t('dash.purchases.add_supplier_named', { name: term.trim() }) : t('dash.purchases.add_supplier')}
                </button>
              )}
            </>
          )}
        </div>
      )}

      <Dialog open={creating} onOpenChange={(next) => !next && !saving && setCreating(false)}>
        <DialogContent className="max-w-md bg-white p-6" onClose={saving ? undefined : () => setCreating(false)}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-gray-900">{t('dash.purchases.add_supplier')}</DialogTitle>
          </DialogHeader>
          <form
            className="mt-4 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <div>
              <label className={fieldLabel} htmlFor="new-supplier-name">{t('dash.purchases.supplier_name')}</label>
              <Input id="new-supplier-name" value={newName} onChange={(e) => setNewName(e.target.value)} autoFocus required />
            </div>
            <div>
              <label className={fieldLabel} htmlFor="new-supplier-mobile">{t('fields.mobile')}</label>
              <Input id="new-supplier-mobile" value={newMobile} onChange={(e) => setNewMobile(e.target.value)} inputMode="tel" dir="ltr" />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setCreating(false)} disabled={saving}>
                {t('dash.purchases.cancel_action')}
              </Button>
              <Button type="submit" size="sm" className="bg-primary text-white" disabled={saving || !newName.trim()}>
                {saving && <Spinner className="w-4 h-4" />}
                {t('dash.purchases.add')}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// --------------------------------------------------------------------- items

const ItemSearch: React.FC<{
  warehouse?: string;
  supplier?: string;
  onPick: (item: PurchaseItemOption) => void;
}> = ({ warehouse, supplier, onPick }) => {
  const [term, setTerm] = useState('');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<PurchaseItemOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounced(term);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    purchaseService
      .searchItems(debounced, warehouse, supplier)
      .then((res) => {
        if (!cancelled) {
          setOptions(res);
          setActive(res.length ? 0 : -1);
        }
      })
      .catch(() => !cancelled && setOptions([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [debounced, open, warehouse, supplier]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, []);

  const pick = (item: PurchaseItemOption) => {
    onPick(item);
    setTerm('');
    // Stays open on the field so the next item can be typed straight away.
    inputRef.current?.focus();
  };

  return (
    <div ref={boxRef} className="relative">
      <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
      <Input
        ref={inputRef}
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            if (open && options[active]) pick(options[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        placeholder={t('dash.purchases.item_placeholder')}
        className="ps-9"
        role="combobox"
        aria-expanded={open}
      />
      {open && (
        <div className="absolute z-30 mt-1 max-h-80 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
          {loading && options.length === 0 ? (
            <div className="flex justify-center py-4"><Spinner className="w-5 h-5 text-primary" /></div>
          ) : options.length === 0 ? (
            <p className="px-3 py-3 text-sm text-gray-500">{t('dash.purchases.no_items')}</p>
          ) : (
            options.map((item, i) => (
              <button
                key={item.item_code}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(item)}
                className={`flex w-full items-center justify-between gap-3 px-3 py-2 text-start ${i === active ? 'bg-primary/10' : 'hover:bg-gray-50'}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-gray-900">{item.item_name}</span>
                  <span className="block text-[11px] text-gray-500">
                    {item.item_group}
                    {item.actual_qty !== null && item.is_stock_item
                      ? ` · ${t('dash.purchases.in_stock', { qty: Number(item.actual_qty.toFixed(3)), uom: item.stock_uom })}`
                      : ''}
                  </span>
                </span>
                {item.last_rate > 0 && (
                  <span className="shrink-0 text-end">
                    <span className="block text-xs font-semibold tabular-nums text-gray-900">{formatCurrency(item.last_rate)}</span>
                    <span className="block text-[10px] text-gray-400">
                      {item.last_rate_from_supplier ? t('dash.purchases.last_from_supplier') : t('dash.purchases.last_price')}
                    </span>
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
};

// --------------------------------------------------------------------- page

export const PurchaseFormPage: React.FC = () => {
  const { name } = useParams();
  const editing = !!name;
  const navigate = useNavigate();
  const { activeBranchId } = useBranchContext();

  const [setup, setSetup] = useState<PurchaseSetup | null>(null);
  const [loadError, setLoadError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [modified, setModified] = useState<string | undefined>();

  const [supplier, setSupplier] = useState<SupplierOption | null>(null);
  const [postingDate, setPostingDate] = useState('');
  const [warehouse, setWarehouse] = useState('');
  const [billNo, setBillNo] = useState('');
  const [billDate, setBillDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [discount, setDiscount] = useState('');
  const [remarks, setRemarks] = useState('');
  const [payNow, setPayNow] = useState(true);
  const [mode, setMode] = useState('');
  const [lines, setLines] = useState<Line[]>([]);

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<'' | 'draft' | 'submit'>('');
  const [confirming, setConfirming] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Load setup, and the draft when editing.
  useEffect(() => {
    let cancelled = false;
    setLoadError('');
    (async () => {
      try {
        const s = await purchaseService.setup(activeBranchId);
        if (cancelled) return;
        setSetup(s);
        if (editing && name) {
          const doc = await purchaseService.detail(name);
          if (cancelled) return;
          if (doc.docstatus !== 0 || !doc.permissions.write) {
            navigate(`/purchases/${encodeURIComponent(doc.name)}`, { replace: true });
            return;
          }
          setModified(doc.modified);
          setSupplier({ name: doc.supplier, supplier_name: doc.supplier_name || doc.supplier });
          setPostingDate(doc.posting_date);
          setWarehouse(doc.warehouse || s.default_warehouse || '');
          setBillNo(doc.bill_no || '');
          setBillDate(doc.bill_date || '');
          setDueDate(doc.due_date && doc.due_date !== doc.posting_date ? doc.due_date : '');
          setDiscount(doc.totals.discount_amount ? String(doc.totals.discount_amount) : '');
          setRemarks(doc.remarks || '');
          setPayNow(!!doc.is_paid);
          setMode(doc.mode_of_payment || s.modes_of_payment[0]?.name || '');
          setLines(
            doc.items.map((row) => {
              const uoms = [{ uom: row.stock_uom, conversion_factor: 1 }];
              if (row.uom !== row.stock_uom) uoms.push({ uom: row.uom, conversion_factor: row.conversion_factor });
              return {
                key: ++lineKey,
                item_code: row.item_code,
                item_name: row.item_name,
                stock_uom: row.stock_uom,
                uom: row.uom,
                uoms,
                qty: String(row.qty),
                rate: String(row.rate),
                actual_qty: null,
                last_rate_from_supplier: false,
              };
            }),
          );
        } else {
          setPostingDate(s.today);
          setWarehouse(s.default_warehouse || '');
          const cash = s.modes_of_payment.find((m) => m.type === 'Cash') || s.modes_of_payment[0];
          setMode(cash?.name || '');
          setPayNow(!!cash);
        }
      } catch (err) {
        if (!cancelled) setLoadError(parseFrappeError(err, t('dash.purchases.load_failed')));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBranchId, editing, name, navigate, attempt]);

  // Unsaved work survives an accidental tab close only as a warning — but a warning is enough.
  useEffect(() => {
    if (!dirty) return;
    const onUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, [dirty]);

  const touch = <T,>(setter: (v: T) => void) => (v: T) => {
    setter(v);
    setDirty(true);
  };

  const addItem = (item: PurchaseItemOption) => {
    setDirty(true);
    setErrors((e) => ({ ...e, items: '' }));
    setLines((prev) => {
      const existing = prev.find((l) => l.item_code === item.item_code && l.uom === item.default_uom);
      if (existing) {
        return prev.map((l) => (l === existing ? { ...l, qty: String(num(l.qty) + 1) } : l));
      }
      const factor = item.uoms.find((u) => u.uom === item.default_uom)?.conversion_factor || 1;
      return [
        ...prev,
        {
          key: ++lineKey,
          item_code: item.item_code,
          item_name: item.item_name,
          stock_uom: item.stock_uom,
          uom: item.default_uom,
          uoms: item.uoms,
          qty: '1',
          rate: item.last_rate ? String(+(item.last_rate * factor).toFixed(3)) : '',
          actual_qty: item.actual_qty,
          last_rate_from_supplier: item.last_rate_from_supplier,
        },
      ];
    });
  };

  const updateLine = (key: number, changes: Partial<Line>) => {
    setDirty(true);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, ...changes } : l)));
  };

  const changeUom = (line: Line, uom: string) => {
    const oldFactor = factorOf(line);
    const newFactor = line.uoms.find((u) => u.uom === uom)?.conversion_factor || 1;
    const rate = line.rate === '' ? '' : String(+((num(line.rate) / oldFactor) * newFactor).toFixed(3));
    updateLine(line.key, { uom, rate });
  };

  const removeLine = (key: number) => {
    setDirty(true);
    setLines((prev) => prev.filter((l) => l.key !== key));
  };

  const subtotal = useMemo(() => lines.reduce((sum, l) => sum + num(l.qty) * num(l.rate), 0), [lines]);
  const discountValue = num(discount);
  const total = Math.max(subtotal - discountValue, 0);

  const validate = useCallback((): boolean => {
    const next: Record<string, string> = {};
    if (!supplier) next.supplier = t('dash.purchases.err_supplier');
    if (!warehouse) next.warehouse = t('dash.purchases.err_warehouse');
    if (!postingDate) next.posting_date = t('dash.purchases.err_date');
    else if (setup && postingDate > setup.today) next.posting_date = t('dash.purchases.err_future_date');
    if (lines.length === 0) next.items = t('dash.purchases.err_items');
    lines.forEach((l) => {
      if (num(l.qty) <= 0) next[`qty_${l.key}`] = t('dash.purchases.err_qty');
      if (l.rate === '' || num(l.rate) < 0) next[`rate_${l.key}`] = t('dash.purchases.err_rate');
    });
    if (discountValue < 0) next.discount = t('dash.purchases.err_discount_negative');
    else if (discountValue > subtotal) next.discount = t('dash.purchases.err_discount_too_big');
    if (!payNow && dueDate && postingDate && dueDate < postingDate) next.due_date = t('dash.purchases.err_due_date');
    if (payNow && !mode) next.mode = t('dash.purchases.err_mode');
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [supplier, warehouse, postingDate, setup, lines, discountValue, subtotal, payNow, dueDate, mode]);

  const save = async (submit: boolean) => {
    if (!supplier || !setup) return;
    setSaving(submit ? 'submit' : 'draft');
    const payload: PurchasePayload = {
      name: editing ? name : undefined,
      modified,
      branch: activeBranchId,
      supplier: supplier.name,
      posting_date: postingDate,
      warehouse,
      bill_no: billNo.trim() || undefined,
      bill_date: billDate || undefined,
      due_date: !payNow && dueDate ? dueDate : undefined,
      discount_amount: discountValue || 0,
      remarks: remarks.trim() || undefined,
      pay_now: payNow ? 1 : 0,
      mode_of_payment: payNow ? mode : undefined,
      items: lines.map((l) => ({ item_code: l.item_code, qty: num(l.qty), rate: num(l.rate), uom: l.uom })),
    };
    try {
      const res = await purchaseService.save(payload, submit);
      setDirty(false);
      showToast.success(submit ? t('dash.purchases.posted') : t('dash.purchases.draft_saved'));
      navigate(`/purchases/${encodeURIComponent(res.name)}`, { replace: true });
    } catch (err) {
      showToast.error(parseFrappeError(err, t('dash.purchases.save_failed')));
    } finally {
      setSaving('');
      setConfirming(false);
    }
  };

  const back = () => {
    if (dirty && !window.confirm(t('dash.purchases.discard_changes'))) return;
    setDirty(false);
    if (window.history.length > 1) navigate(-1);
    else navigate(editing && name ? `/purchases/${encodeURIComponent(name)}` : '/purchases');
  };

  if (loadError) {
    return (
      <ErrorState
        className="py-24"
        title={t('dash.purchases.load_failed')}
        description={loadError}
        retryLabel={t('common.retry')}
        onRetry={() => setAttempt((n) => n + 1)}
      />
    );
  }

  if (!setup || (editing && !supplier && !modified)) {
    return (
      <div className="py-24 flex justify-center">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  if (!editing && !setup.permissions.create) {
    return <ErrorState className="py-24" title={t('dash.purchases.no_permission')} />;
  }

  const warehouseLabel = setup.warehouses.find((w) => w.name === warehouse)?.label || warehouse;

  return (
    <div className="max-w-7xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button variant="ghost" size="sm" onClick={back} className="mt-0.5 h-9 w-9 p-0" aria-label={t('common.back')}>
          <ArrowRight className="w-5 h-5 ltr:rotate-180" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {editing ? t('dash.purchases.edit_title', { name: name || '' }) : t('dash.purchases.new_title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t('dash.purchases.form_hint')}</p>
        </div>
      </div>

      <form
        className="grid grid-cols-1 gap-5 lg:grid-cols-3"
        onSubmit={(e) => {
          e.preventDefault();
        }}
      >
        <div className="space-y-5 lg:col-span-2">
          {/* Details */}
          <Card className="border border-gray-200 p-5">
            <h2 className="mb-4 text-sm font-bold text-gray-900">{t('dash.purchases.details')}</h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <span className={fieldLabel}>
                  {t('dash.purchases.supplier')} <span className="text-red-500">*</span>
                </span>
                <SupplierPicker
                  value={supplier}
                  onChange={(s) => {
                    touch(setSupplier)(s);
                    setErrors((e) => ({ ...e, supplier: '' }));
                  }}
                  canCreate={setup.permissions.create_supplier}
                  error={errors.supplier}
                />
              </div>
              <div>
                <label className={fieldLabel} htmlFor="p-date">
                  {t('dash.purchases.purchase_date')} <span className="text-red-500">*</span>
                </label>
                <Input
                  id="p-date"
                  type="date"
                  value={postingDate}
                  max={setup.today}
                  onChange={(e) => touch(setPostingDate)(e.target.value)}
                  className={errors.posting_date ? 'border-red-400' : ''}
                />
                {errors.posting_date && <p className="mt-1 text-xs text-red-600">{errors.posting_date}</p>}
              </div>
              <div>
                <label className={fieldLabel} htmlFor="p-wh">
                  {t('dash.purchases.receive_into')} <span className="text-red-500">*</span>
                </label>
                <select
                  id="p-wh"
                  value={warehouse}
                  onChange={(e) => {
                    touch(setWarehouse)(e.target.value);
                    setErrors((er) => ({ ...er, warehouse: '' }));
                  }}
                  className={`${selectClass} ${errors.warehouse ? 'border-red-400' : ''}`}
                >
                  <option value="">{t('dash.purchases.choose_warehouse')}</option>
                  {setup.warehouses.map((w) => (
                    <option key={w.name} value={w.name}>{w.label}</option>
                  ))}
                </select>
                {errors.warehouse && <p className="mt-1 text-xs text-red-600">{errors.warehouse}</p>}
              </div>
              <div>
                <label className={fieldLabel} htmlFor="p-bill">{t('dash.purchases.bill_no')}</label>
                <Input id="p-bill" value={billNo} onChange={(e) => touch(setBillNo)(e.target.value)} placeholder={t('dash.purchases.bill_no_hint')} />
              </div>
              <div>
                <label className={fieldLabel} htmlFor="p-bill-date">{t('dash.purchases.bill_date')}</label>
                <Input id="p-bill-date" type="date" value={billDate} max={setup.today} onChange={(e) => touch(setBillDate)(e.target.value)} />
              </div>
            </div>
          </Card>

          {/* Items */}
          <Card className="border border-gray-200">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-5 py-3">
              <h2 className="flex items-center gap-2 text-sm font-bold text-gray-900">
                <Package className="w-4 h-4 text-primary" /> {t('dash.purchases.items')}
              </h2>
              {lines.length > 0 && <span className="text-xs text-gray-500">{t('dash.invoice.items_count', { count: lines.length })}</span>}
            </div>
            <div className="p-5 pb-3">
              <ItemSearch warehouse={warehouse || undefined} supplier={supplier?.name} onPick={addItem} />
              {errors.items && <p className="mt-2 text-xs text-red-600">{errors.items}</p>}
            </div>

            {lines.length === 0 ? (
              <div className="px-5 pb-8 pt-4 text-center text-sm text-gray-400">{t('dash.purchases.items_empty')}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-gray-50 text-xs font-semibold text-gray-500">
                    <tr>
                      <th className="px-5 py-2.5 text-start">{t('fields.item')}</th>
                      <th className="px-2 py-2.5 text-start w-28">{t('dash.purchases.unit')}</th>
                      <th className="px-2 py-2.5 text-start w-28">{t('fields.qty')}</th>
                      <th className="px-2 py-2.5 text-start w-36">{t('dash.purchases.unit_price')}</th>
                      <th className="px-3 py-2.5 text-end w-32">{t('fields.amount')}</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {lines.map((line) => (
                      <tr key={line.key} className="align-top">
                        <td className="px-5 py-3">
                          <p className="font-semibold text-gray-900">{line.item_name}</p>
                          <p className="mt-0.5 text-[11px] text-gray-500">
                            {line.actual_qty !== null && t('dash.purchases.in_stock', { qty: Number(line.actual_qty.toFixed(3)), uom: line.stock_uom })}
                            {line.uom !== line.stock_uom &&
                              ` · ${t('dash.purchases.conversion', { factor: factorOf(line), uom: line.uom, stock_uom: line.stock_uom })}`}
                          </p>
                        </td>
                        <td className="px-2 py-3">
                          {line.uoms.length > 1 ? (
                            <select
                              value={line.uom}
                              onChange={(e) => changeUom(line, e.target.value)}
                              className="h-10 w-full rounded-md border border-gray-200 bg-white px-2 text-sm"
                              aria-label={t('dash.purchases.unit')}
                            >
                              {line.uoms.map((u) => (
                                <option key={u.uom} value={u.uom}>{u.uom}</option>
                              ))}
                            </select>
                          ) : (
                            <span className="inline-block pt-2.5 text-sm text-gray-600">{line.uom}</span>
                          )}
                        </td>
                        <td className="px-2 py-3">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={line.qty}
                            onChange={(e) => updateLine(line.key, { qty: e.target.value })}
                            onFocus={(e) => e.target.select()}
                            className={`h-10 tabular-nums ${errors[`qty_${line.key}`] ? 'border-red-400' : ''}`}
                            aria-label={t('fields.qty')}
                          />
                        </td>
                        <td className="px-2 py-3">
                          <Input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step="any"
                            value={line.rate}
                            onChange={(e) => updateLine(line.key, { rate: e.target.value })}
                            onFocus={(e) => e.target.select()}
                            className={`h-10 tabular-nums ${errors[`rate_${line.key}`] ? 'border-red-400' : ''}`}
                            aria-label={t('dash.purchases.unit_price')}
                          />
                          {line.last_rate_from_supplier && (
                            <p className="mt-0.5 text-[10px] text-gray-400">{t('dash.purchases.last_from_supplier')}</p>
                          )}
                        </td>
                        <td className="px-3 py-3 pt-5 text-end font-semibold tabular-nums whitespace-nowrap">
                          {formatCurrency(num(line.qty) * num(line.rate))}
                        </td>
                        <td className="py-3 pe-3">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-10 w-10 p-0 text-gray-400 hover:text-red-600"
                            onClick={() => removeLine(line.key)}
                            aria-label={t('dash.purchases.remove_item')}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="border border-gray-200 p-5">
            <label className={fieldLabel} htmlFor="p-notes">{t('dash.purchases.notes')}</label>
            <Textarea id="p-notes" rows={2} value={remarks} onChange={(e) => touch(setRemarks)(e.target.value)} placeholder={t('dash.purchases.notes_hint')} />
          </Card>
        </div>

        {/* Summary */}
        <div className="space-y-5 lg:sticky lg:top-4 lg:self-start">
          <Card className="border border-gray-200 p-5">
            <h2 className="mb-3 text-sm font-bold text-gray-900">{t('dash.purchases.summary')}</h2>
            <div className="flex items-center justify-between py-1.5 text-sm text-gray-600">
              <span>{t('dash.invoice.subtotal')}</span>
              <span className="tabular-nums">{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex items-center justify-between gap-3 py-1.5 text-sm text-gray-600">
              <label htmlFor="p-discount">{t('dash.invoice.discount')}</label>
              <Input
                id="p-discount"
                type="number"
                inputMode="decimal"
                min="0"
                step="any"
                value={discount}
                onChange={(e) => touch(setDiscount)(e.target.value)}
                className={`h-9 w-36 text-end tabular-nums ${errors.discount ? 'border-red-400' : ''}`}
                placeholder="0"
              />
            </div>
            {errors.discount && <p className="text-end text-xs text-red-600">{errors.discount}</p>}
            <div className="my-2 border-t border-gray-200" />
            <div className="flex items-center justify-between py-1 text-lg font-bold text-gray-900">
              <span>{t('dash.invoice.total')}</span>
              <span className="tabular-nums">{formatCurrency(total)}</span>
            </div>
            <p className="mt-1 text-[11px] text-gray-400">{t('dash.purchases.total_hint')}</p>
          </Card>

          <Card className="border border-gray-200 p-5">
            <h2 className="mb-3 text-sm font-bold text-gray-900">{t('dash.purchases.payment')}</h2>
            <div className="grid grid-cols-2 gap-2" role="radiogroup">
              <button
                type="button"
                role="radio"
                aria-checked={payNow}
                disabled={setup.modes_of_payment.length === 0}
                onClick={() => touch(setPayNow)(true)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-xs font-semibold transition-colors disabled:opacity-50 ${
                  payNow ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600 hover:border-primary/40'
                }`}
              >
                <Banknote className="w-5 h-5" /> {t('dash.purchases.paid_now')}
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={!payNow}
                onClick={() => touch(setPayNow)(false)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-3 py-3 text-xs font-semibold transition-colors ${
                  !payNow ? 'border-primary bg-primary/5 text-primary' : 'border-gray-200 text-gray-600 hover:border-primary/40'
                }`}
              >
                <CalendarClock className="w-5 h-5" /> {t('dash.purchases.on_credit')}
              </button>
            </div>

            {payNow ? (
              <div className="mt-4">
                <label className={fieldLabel} htmlFor="p-mode">{t('dash.purchases.paid_from')}</label>
                <select id="p-mode" value={mode} onChange={(e) => touch(setMode)(e.target.value)} className={`${selectClass} ${errors.mode ? 'border-red-400' : ''}`}>
                  <option value="">{t('dash.purchases.choose_mode')}</option>
                  {setup.modes_of_payment.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
                {errors.mode && <p className="mt-1 text-xs text-red-600">{errors.mode}</p>}
              </div>
            ) : (
              <div className="mt-4">
                <label className={fieldLabel} htmlFor="p-due">{t('dash.purchases.due_date')}</label>
                <Input
                  id="p-due"
                  type="date"
                  value={dueDate}
                  min={postingDate}
                  onChange={(e) => touch(setDueDate)(e.target.value)}
                  className={errors.due_date ? 'border-red-400' : ''}
                />
                <p className="mt-1 text-[11px] text-gray-400">{errors.due_date || t('dash.purchases.due_date_hint')}</p>
              </div>
            )}
            {setup.modes_of_payment.length === 0 && (
              <p className="mt-3 rounded-md bg-amber-50 p-2 text-[11px] text-amber-800">{t('dash.purchases.no_modes')}</p>
            )}
          </Card>

          <div className="flex flex-col gap-2">
            {setup.permissions.submit && (
              <Button
                type="button"
                className="w-full gap-2 bg-primary text-white"
                disabled={!!saving}
                onClick={() => validate() && setConfirming(true)}
              >
                {saving === 'submit' && <Spinner className="w-4 h-4" />}
                {t('dash.purchases.save_and_post')}
              </Button>
            )}
            <Button type="button" variant="outline" className="w-full gap-2" disabled={!!saving} onClick={() => validate() && void save(false)}>
              {saving === 'draft' && <Spinner className="w-4 h-4" />}
              {t('dash.purchases.save_draft')}
            </Button>
            {Object.values(errors).some(Boolean) && (
              <p className="flex items-center justify-center gap-1 text-xs text-red-600">
                <X className="w-3.5 h-3.5" /> {t('dash.purchases.fix_errors')}
              </p>
            )}
          </div>
        </div>
      </form>

      <ConfirmDialog
        open={confirming}
        title={t('dash.purchases.confirm_post_title')}
        confirmLabel={t('dash.purchases.confirm_post')}
        busy={saving === 'submit'}
        onConfirm={() => void save(true)}
        onClose={() => setConfirming(false)}
        description={t('dash.purchases.confirm_post_body', { warehouse: warehouseLabel })}
      >
        <dl className="space-y-1.5 rounded-lg bg-gray-50 p-3 text-sm">
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">{t('dash.purchases.supplier')}</dt>
            <dd className="font-semibold text-gray-900">{supplier?.supplier_name || supplier?.name}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">{t('dash.purchases.items')}</dt>
            <dd className="font-semibold text-gray-900">{t('dash.invoice.items_count', { count: lines.length })}</dd>
          </div>
          <div className="flex justify-between gap-3">
            <dt className="text-gray-500">{t('dash.purchases.payment')}</dt>
            <dd className="font-semibold text-gray-900">{payNow ? `${t('dash.purchases.paid_now')} · ${mode}` : t('dash.purchases.on_credit')}</dd>
          </div>
          <div className="flex justify-between gap-3 border-t border-gray-200 pt-1.5 text-base">
            <dt className="font-bold text-gray-900">{t('dash.invoice.total')}</dt>
            <dd className="font-bold tabular-nums text-gray-900">{formatCurrency(total)}</dd>
          </div>
        </dl>
      </ConfirmDialog>
    </div>
  );
};

export default PurchaseFormPage;
