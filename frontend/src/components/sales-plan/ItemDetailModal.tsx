import React, { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Button, DataTable, Spinner, type DataTableColumn } from '@ury/ui';
import { call } from '@ury/core';

interface BomItemRow {
  item_code: string;
  item_name?: string;
  qty?: number;
  uom?: string;
}

interface ItemDetailDoc {
  item_code: string;
  item_name?: string;
  item_group?: string;
  stock_uom?: string;
  description?: string;
}

export interface ItemDetailModalProps {
  itemCode: string | null;
  onClose: () => void;
}

const formatQty = (value: number) => (Number.isInteger(value) ? String(value) : value.toFixed(1));

/**
 * Shared item + BOM detail dialog used from Needs Attention and department
 * item rows on the Sales Plan page.
 */
export const ItemDetailModal: React.FC<ItemDetailModalProps> = ({ itemCode, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [item, setItem] = useState<ItemDetailDoc | null>(null);
  const [bomName, setBomName] = useState<string | null>(null);
  const [bomItems, setBomItems] = useState<BomItemRow[]>([]);
  const [bomChecked, setBomChecked] = useState(false);
  const [bomError, setBomError] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    if (itemCode) window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [itemCode, onClose]);

  useEffect(() => {
    if (!itemCode) {
      setItem(null);
      setError(null);
      setBomName(null);
      setBomItems([]);
      setBomChecked(false);
      setBomError(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setItem(null);
    setBomName(null);
    setBomItems([]);
    setBomChecked(false);
    setBomError(false);

    (async () => {
      try {
        const itemRes = await call<any>('frappe.client.get', {
          doctype: 'Item',
          name: itemCode,
        });
        const itemDoc = itemRes?.message || itemRes;
        if (cancelled) return;
        setItem({
          item_code: itemDoc?.item_code || itemCode,
          item_name: itemDoc?.item_name,
          item_group: itemDoc?.item_group,
          stock_uom: itemDoc?.stock_uom,
          description: itemDoc?.description,
        });
      } catch {
        if (!cancelled) setError('Unable to load item details.');
      } finally {
        if (!cancelled) setLoading(false);
      }

      try {
        const bomListRes = await call<any>('frappe.client.get_list', {
          doctype: 'BOM',
          filters: [
            ['item', '=', itemCode],
            ['docstatus', '=', 1],
            ['is_active', '=', 1],
          ],
          fields: ['name', 'is_active', 'is_default'],
          order_by: 'is_default desc, is_active desc, modified desc',
          limit_page_length: 1,
        });
        if (cancelled) return;
        const boms = Array.isArray(bomListRes?.message)
          ? bomListRes.message
          : Array.isArray(bomListRes)
            ? bomListRes
            : [];
        const bestBom = boms[0];
        if (!bestBom?.name) {
          setBomChecked(true);
          return;
        }

        try {
          const bomDocRes = await call<any>('frappe.client.get', {
            doctype: 'BOM',
            name: bestBom.name,
          });
          if (cancelled) return;
          const bomDoc = bomDocRes?.message || bomDocRes;
          setBomName(bomDoc?.name || bestBom.name);
          const rows: BomItemRow[] = Array.isArray(bomDoc?.items)
            ? bomDoc.items.map((row: any) => ({
                item_code: row.item_code || '',
                item_name: row.item_name,
                qty: row.qty !== undefined ? Number(row.qty) : undefined,
                uom: row.uom || row.stock_uom,
              }))
            : [];
          setBomItems(rows);
          setBomChecked(true);
        } catch {
          if (cancelled) return;
          setBomName(bestBom.name);
          setBomError(true);
          setBomChecked(true);
        }
      } catch {
        if (!cancelled) setBomChecked(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [itemCode]);

  if (!itemCode) return null;

  const bomColumns: DataTableColumn<BomItemRow>[] = [
    { key: 'item_code', header: 'Item Code', render: (row) => row.item_code },
    { key: 'item_name', header: 'Item Name', render: (row) => row.item_name || '-' },
    {
      key: 'qty',
      header: 'Qty',
      align: 'right',
      render: (row) => (row.qty !== undefined ? formatQty(row.qty) : '-'),
    },
    { key: 'uom', header: 'UOM', render: (row) => row.uom || '-' },
  ];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="item-detail-modal-title"
    >
      <button className="absolute inset-0 bg-black/40 backdrop-blur-sm" aria-label="Close item detail" onClick={onClose} />
      <div className="relative z-[101] w-full max-w-2xl overflow-hidden rounded-lg bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border bg-muted px-6 py-4">
          <div>
            <h2 id="item-detail-modal-title" className="text-lg font-semibold text-foreground">
              {item?.item_name || itemCode}
            </h2>
            <p className="mt-1 text-sm text-text-tertiary">Item detail and recipe (BOM)</p>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Close item details">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <Spinner className="h-6 w-6 text-primary" />
            </div>
          ) : error ? (
            <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          ) : (
            <>
              <div className="mb-5 grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs font-medium text-text-tertiary">Item Code</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{item?.item_code || itemCode}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs font-medium text-text-tertiary">Item Group</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{item?.item_group || 'Unassigned'}</p>
                </div>
                <div className="rounded-md border border-border p-3">
                  <p className="text-xs font-medium text-text-tertiary">Stock UOM</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">{item?.stock_uom || '-'}</p>
                </div>
              </div>

              <h3 className="mb-2 text-sm font-semibold text-foreground">
                Recipe (BOM){bomName ? ` — ${bomName}` : ''}
              </h3>
              {!bomChecked ? (
                <div className="flex items-center justify-center py-6">
                  <Spinner className="h-5 w-5 text-primary" />
                </div>
              ) : !bomName ? (
                <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-text-tertiary">
                  No BOM configured for this item.
                </div>
              ) : bomError ? (
                <div className="rounded-md border border-destructive-tint-border bg-destructive-tint px-3 py-2 text-sm text-destructive">
                  Unable to load the recipe for this item.
                </div>
              ) : bomItems.length === 0 ? (
                <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-text-tertiary">
                  This BOM has no ingredient lines.
                </div>
              ) : (
                <DataTable columns={bomColumns} rows={bomItems} emptyMessage="No BOM ingredients found." />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default ItemDetailModal;
