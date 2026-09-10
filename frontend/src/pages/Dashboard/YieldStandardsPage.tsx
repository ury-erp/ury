import React, { useState, useEffect } from 'react';
import { Plus } from 'lucide-react';
import { Page, Section, Button, Select, SelectItem, Spinner, showToast, DataTable } from '@ury/ui';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';

interface YieldStandardsRecord {
  name: string;
  item_name?: string;
  custom_yield_tracked?: number;
  custom_yield_percent?: number;
  custom_yield_check_cadence?: string;
  custom_yield_check_interval_days?: number;
}

const YIELD_CHECK_CADENCE_OPTIONS = ['None', 'Every Issue', 'Interval', 'Sampled'];

const emptyForm = {
  item: '',
  custom_yield_tracked: false,
  custom_yield_percent: 0,
  custom_yield_check_cadence: 'None',
  custom_yield_check_interval_days: 0,
};

export const YieldStandardsPage: React.FC = () => {
  const [items, setItems] = useState<YieldStandardsRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<YieldStandardsRecord | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const [itemOptions, setItemOptions] = useState<{ name: string; item_name?: string }[]>([]);

  const [form, setForm] = useState(emptyForm);

  const fetchItemOptions = async () => {
    try {
      const res = await call<any>('frappe.client.get_list', {
        doctype: 'Item',
        fields: ['name', 'item_name', 'is_stock_item'],
        filters: [['is_stock_item', '=', 1]],
        limit_page_length: 500,
        order_by: 'item_name asc',
      });
      const data = (res as any)?.message || res || [];
      setItemOptions(Array.isArray(data) ? data : []);
    } catch {
      setItemOptions([]);
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const res = await call<any>('frappe.client.get_list', {
        doctype: 'Item',
        fields: ['name', 'item_name', 'custom_yield_tracked', 'custom_yield_percent', 'custom_yield_check_cadence', 'custom_yield_check_interval_days'],
        filters: [['is_stock_item', '=', 1]],
        limit_page_length: 500,
        order_by: 'item_name asc',
      });
      const data = (res as any)?.message || res || [];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItemOptions();
    fetchItems();
  }, []);

  const openAddDrawer = () => {
    setEditingItem(null);
    setForm(emptyForm);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (item: YieldStandardsRecord) => {
    setEditingItem(item);
    setForm({
      item: item.name || '',
      custom_yield_tracked: !!item.custom_yield_tracked,
      custom_yield_percent: item.custom_yield_percent || 0,
      custom_yield_check_cadence: item.custom_yield_check_cadence || 'None',
      custom_yield_check_interval_days: item.custom_yield_check_interval_days || 0,
    });
    setIsDrawerOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.item) {
      showToast.error('Please select an item');
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        custom_yield_tracked: form.custom_yield_tracked ? 1 : 0,
        custom_yield_percent: form.custom_yield_percent || 0,
        custom_yield_check_cadence: form.custom_yield_check_cadence || 'None',
        custom_yield_check_interval_days: form.custom_yield_check_cadence === 'Interval' ? (form.custom_yield_check_interval_days || 0) : 0,
      };

      await call('frappe.client.set_value', {
        doctype: 'Item',
        name: form.item,
        fieldname: payload,
      });

      fetchItems();
      setIsDrawerOpen(false);
      showToast.success('Yield standards updated successfully');
    } catch (err: any) {
      console.error('Failed to save Yield Standards', err);
      let errorMessage = 'Failed to save Yield Standards';
      if (err._server_messages) {
        try {
          const messages = JSON.parse(err._server_messages);
          if (messages.length > 0) {
            const lastMessage = JSON.parse(messages[messages.length - 1]);
            if (lastMessage.message) {
              errorMessage = lastMessage.message.replace(/<[^>]*>?/gm, '');
            }
          }
        } catch (e) {}
      } else if (err.message) {
        errorMessage = err.message;
      }
      showToast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  const formatYieldPercent = (value?: number) => {
    if (!value) return '-';
    return `${value}%`;
  };

  const formatCheckCadence = (value?: string) => {
    return value || '-';
  };

  const formatIntervalDays = (value?: number) => {
    if (!value) return '-';
    return `${value}d`;
  };

  return (
    <Page>
      <div className="flex flex-col md:flex-row items-center justify-end gap-4 pb-3 border-b border-border">
        <Button
          onClick={openAddDrawer}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Set Yield Standards</span>
        </Button>
      </div>

      <Section>
        {loading ? (
          <div className="py-16 flex items-center justify-center bg-card rounded-[9px] border border-hair">
            <Spinner className="w-8 h-8 text-primary" />
          </div>
        ) : items.length === 0 ? (
          <div className="px-4 py-[18px] text-xs text-text-tertiary flex items-center gap-2.5 bg-card border border-hair rounded-[9px]">
            <span>Define yield standards for stock items to track production efficiency.</span>
            <Button
              onClick={openAddDrawer}
              variant="chrome"
              size="compactSm"
              className="ml-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Set Standards</span>
            </Button>
          </div>
        ) : (
          <DataTable<YieldStandardsRecord>
            columns={[
              { key: 'name', header: 'Item Code', render: (row) => <span className="font-semibold">{row.name}</span> },
              { key: 'item_name', header: 'Item Name', render: (row) => row.item_name || '-' },
              {
                key: 'custom_yield_tracked',
                header: 'Yield Tracked',
                render: (row) => (row.custom_yield_tracked ? '✓' : ''),
              },
              {
                key: 'custom_yield_percent',
                header: 'Yield %',
                align: 'right',
                render: (row) => formatYieldPercent(row.custom_yield_percent),
              },
              {
                key: 'custom_yield_check_cadence',
                header: 'Check Cadence',
                render: (row) => formatCheckCadence(row.custom_yield_check_cadence),
              },
              {
                key: 'custom_yield_check_interval_days',
                header: 'Interval (Days)',
                align: 'right',
                render: (row) => formatIntervalDays(row.custom_yield_check_interval_days),
              },
            ]}
            rows={items}
            onRowClick={openEditDrawer}
          />
        )}
      </Section>

      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingItem ? 'Edit Yield Standards' : 'Set Yield Standards'}
      >
        <form onSubmit={handleSave} className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Item</label>
            <SearchableSelect
              id="item"
              value={form.item}
              onChange={(_, val) => setForm({ ...form, item: val })}
              options={itemOptions.map((i) => ({ value: i.name, label: i.item_name || i.name }))}
              placeholder="Select Item"
              strict
              disabled={!!editingItem}
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="custom_yield_tracked"
              checked={form.custom_yield_tracked}
              onChange={(e) => setForm({ ...form, custom_yield_tracked: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="custom_yield_tracked" className="font-semibold text-muted-foreground">
              Track Yield
            </label>
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Yield %</label>
            <input
              type="number"
              value={form.custom_yield_percent}
              onChange={(e) => setForm({ ...form, custom_yield_percent: parseFloat(e.target.value) || 0 })}
              placeholder="Enter yield percentage"
              min="0"
              max="100"
              step="0.01"
              className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <p className="text-xs text-text-tertiary mt-1">Expected yield percentage (0-100).</p>
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Check Cadence</label>
            <Select
              value={form.custom_yield_check_cadence}
              onChange={(e) => setForm({ ...form, custom_yield_check_cadence: e.target.value })}
            >
              {YIELD_CHECK_CADENCE_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </Select>
            <p className="text-xs text-text-tertiary mt-1">How often to check yield standards.</p>
          </div>

          {form.custom_yield_check_cadence === 'Interval' && (
            <div>
              <label className="block font-semibold text-muted-foreground mb-1">Check Interval (Days)</label>
              <input
                type="number"
                value={form.custom_yield_check_interval_days}
                onChange={(e) => setForm({ ...form, custom_yield_check_interval_days: parseInt(e.target.value) || 0 })}
                placeholder="Enter interval in days"
                min="1"
                step="1"
                className="w-full px-3 py-2 border border-border rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary"
              />
              <p className="text-xs text-text-tertiary mt-1">Number of days between yield checks.</p>
            </div>
          )}

          <div className="pt-6 flex justify-end gap-2 border-t mt-4 border-border">
            <Button type="button" variant="outline" onClick={() => setIsDrawerOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button
              type="submit"
              className="bg-primary hover:bg-primary/90 text-white disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={saving}
            >
              <div className="flex items-center gap-2">
                {saving && <Spinner className="w-4 h-4" />}
                <span>{saving ? 'Saving...' : 'Save Standards'}</span>
              </div>
            </Button>
          </div>
        </form>
      </SideDrawer>
    </Page>
  );
};

export default YieldStandardsPage;
