import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Settings2, Plus } from 'lucide-react';
import { Card, Button, Select, SelectItem, Spinner, showToast } from '@ury/ui';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { dashboardService } from '../../services/dashboard';
import { call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';

interface ItemProductionConfigRecord {
  name: string;
  item?: string;
  branch?: string;
  department?: string;
  production_unit?: string;
  production_policy?: string;
  bom?: string;
  active?: number;
  controlled_by_sales_plan?: number;
  allow_over_plan_sale?: number;
  availability_mode?: string;
  direct_retail_warehouse?: string;
}

const PRODUCTION_POLICY_OPTIONS = ['PRE_PRODUCED', 'MADE_TO_ORDER', 'DIRECT_RETAIL'];
const AVAILABILITY_MODE_OPTIONS = ['Always Available', 'Stock Available', 'Plan Available'];

const emptyForm = {
  active: true,
  item: '',
  branch: '',
  department: '',
  production_unit: '',
  production_policy: '',
  bom: '',
  controlled_by_sales_plan: false,
  allow_over_plan_sale: false,
  availability_mode: '',
  direct_retail_warehouse: '',
};

export const ItemProductionConfigPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [configs, setConfigs] = useState<ItemProductionConfigRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingConfig, setEditingConfig] = useState<ItemProductionConfigRecord | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const [branches, setBranches] = useState<{ name: string }[]>([]);
  const [items, setItems] = useState<{ name: string; item_name?: string }[]>([]);
  const [departments, setDepartments] = useState<{ name: string; branch?: string }[]>([]);
  const [units, setUnits] = useState<{ name: string; branch?: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ name: string }[]>([]);

  const [form, setForm] = useState(emptyForm);

  const fetchBranches = async () => {
    try {
      const res = await dashboardService.getModuleRecords<{ name: string }>('Branch', 'all');
      setBranches(res || []);
    } catch {
      setBranches([]);
    }
  };

  const fetchItems = async () => {
    try {
      const res = await call<any>('frappe.client.get_list', {
        doctype: 'Item',
        fields: ['name', 'item_name'],
        limit_page_length: 500,
        order_by: 'item_name asc',
      });
      const data = (res as any)?.message || res || [];
      setItems(Array.isArray(data) ? data : []);
    } catch {
      setItems([]);
    }
  };

  const fetchDepartments = async () => {
    try {
      const res = await dashboardService.getModuleRecords<{ name: string; branch?: string }>('URY Production Department', 'all');
      setDepartments(res || []);
    } catch {
      setDepartments([]);
    }
  };

  const fetchUnits = async () => {
    try {
      const res = await dashboardService.getModuleRecords<{ name: string; branch?: string }>('URY Production Unit', 'all');
      setUnits(res || []);
    } catch {
      setUnits([]);
    }
  };

  const fetchWarehouses = async () => {
    try {
      const res = await call<any>('frappe.client.get_list', {
        doctype: 'Warehouse',
        fields: ['name'],
        limit_page_length: 200,
        order_by: 'name asc',
      });
      const data = (res as any)?.message || res || [];
      setWarehouses(Array.isArray(data) ? data : []);
    } catch {
      setWarehouses([]);
    }
  };

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const records = await dashboardService.getModuleRecords<ItemProductionConfigRecord>(
        'URY Item Production Configuration',
        activeBranchId
      );
      setConfigs(records || []);
    } catch {
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
    fetchItems();
    fetchDepartments();
    fetchUnits();
    fetchWarehouses();
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [activeBranchId]);

  const departmentsForBranch = departments.filter((d) => !form.branch || d.branch === form.branch);
  const unitsForBranch = units.filter((u) => !form.branch || u.branch === form.branch);

  const openAddDrawer = () => {
    setEditingConfig(null);
    setForm({
      ...emptyForm,
      branch: activeBranchId !== 'all' ? activeBranchId : (branches[0]?.name || ''),
    });
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (config: ItemProductionConfigRecord) => {
    setEditingConfig(config);
    setForm({
      active: config.active !== 0,
      item: config.item || '',
      branch: config.branch || '',
      department: config.department || '',
      production_unit: config.production_unit || '',
      production_policy: config.production_policy || '',
      bom: config.bom || '',
      controlled_by_sales_plan: !!config.controlled_by_sales_plan,
      allow_over_plan_sale: !!config.allow_over_plan_sale,
      availability_mode: config.availability_mode || '',
      direct_retail_warehouse: config.direct_retail_warehouse || '',
    });
    setIsDrawerOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.item || !form.branch) return;
    setSaving(true);
    try {
      const payload: Record<string, any> = {
        active: form.active ? 1 : 0,
        item: form.item,
        branch: form.branch,
        department: form.department || null,
        production_unit: form.production_unit || null,
        production_policy: form.production_policy || null,
        bom: form.bom || null,
        controlled_by_sales_plan: form.controlled_by_sales_plan ? 1 : 0,
        allow_over_plan_sale: form.allow_over_plan_sale ? 1 : 0,
        availability_mode: form.availability_mode || null,
        direct_retail_warehouse: form.direct_retail_warehouse || null,
      };

      if (editingConfig) {
        await call('frappe.client.set_value', {
          doctype: 'URY Item Production Configuration',
          name: editingConfig.name,
          fieldname: payload,
        });
      } else {
        await call('frappe.client.insert', {
          doc: {
            doctype: 'URY Item Production Configuration',
            ...payload,
          },
        });
      }
      fetchConfigs();
      setIsDrawerOpen(false);
      showToast.success(`Item Production Configuration ${editingConfig ? 'updated' : 'added'} successfully`);
    } catch (err: any) {
      console.error('Failed to save Item Production Configuration', err);
      let errorMessage = 'Failed to save Item Production Configuration';
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

  return (
    <div className="space-y-6">
      <div className="-mx-6 px-6 -mt-6 pt-6 pb-3 border-b border-border flex flex-col md:flex-row items-center justify-end gap-4">
        <Button
          onClick={openAddDrawer}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Item Production Configuration</span>
        </Button>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center bg-card rounded-lg border border-border">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : configs.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-border shadow-sm bg-card">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Settings2 className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No Item Production Configurations</h3>
          <p className="text-text-tertiary mb-6 max-w-sm">
            Map items to production units and departments to enable kitchen/bar routing.
          </p>
          <Button
            onClick={openAddDrawer}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Item Production Configuration</span>
          </Button>
        </Card>
      ) : (
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden overflow-x-auto">
          <table className="w-full text-left text-sm text-muted-foreground">
            <thead className="bg-muted border-b border-border text-xs text-text-tertiary font-semibold">
              <tr>
                <th className="px-6 py-4">Item</th>
                <th className="px-6 py-4">Branch</th>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4">Production Unit</th>
                <th className="px-6 py-4">Policy</th>
                <th className="px-6 py-4">Active</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {configs.map((config) => (
                <tr
                  key={config.name}
                  className="transition-colors cursor-pointer hover:bg-muted"
                  onClick={() => openEditDrawer(config)}
                >
                  <td className="px-6 py-4 font-semibold text-foreground">{config.item}</td>
                  <td className="px-6 py-4">{config.branch}</td>
                  <td className="px-6 py-4">{config.department || '-'}</td>
                  <td className="px-6 py-4">{config.production_unit || '-'}</td>
                  <td className="px-6 py-4">{config.production_policy || '-'}</td>
                  <td className="px-6 py-4">{config.active ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingConfig ? 'Edit Item Production Configuration' : 'Add Item Production Configuration'}
      >
        <form onSubmit={handleSave} className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Item</label>
            <SearchableSelect
              id="item"
              value={form.item}
              onChange={(_, val) => setForm({ ...form, item: val })}
              options={items.map((i) => ({ value: i.name, label: i.item_name || i.name }))}
              placeholder="Select Item"
              strict
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Branch</label>
            <SearchableSelect
              id="branch"
              value={form.branch}
              onChange={(_, val) => setForm({ ...form, branch: val, department: '', production_unit: '' })}
              options={branches.map((b) => ({ value: b.name, label: b.name }))}
              placeholder="Select Branch"
              strict
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Department</label>
            <SearchableSelect
              id="department"
              value={form.department}
              onChange={(_, val) => setForm({ ...form, department: val })}
              options={departmentsForBranch.map((d) => ({ value: d.name, label: d.name }))}
              placeholder="Select Department (optional)"
              strict
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Production Unit</label>
            <SearchableSelect
              id="production_unit"
              value={form.production_unit}
              onChange={(_, val) => setForm({ ...form, production_unit: val })}
              options={unitsForBranch.map((u) => ({ value: u.name, label: u.name }))}
              placeholder="Select Production Unit (optional)"
              strict
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Production Policy</label>
            <Select
              value={form.production_policy}
              onChange={(e) => setForm({ ...form, production_policy: e.target.value })}
              placeholder="Select Policy (optional)"
            >
              {PRODUCTION_POLICY_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </Select>
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">BOM</label>
            <SearchableSelect
              id="bom"
              value={form.bom}
              onChange={(_, val) => setForm({ ...form, bom: val })}
              options={form.bom ? [{ value: form.bom, label: form.bom }] : []}
              placeholder="Enter BOM name (optional)"
            />
            <p className="text-xs text-text-tertiary mt-1">
              BOM must belong to the selected Item.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Availability Mode</label>
            <Select
              value={form.availability_mode}
              onChange={(e) => setForm({ ...form, availability_mode: e.target.value })}
              placeholder="Select Availability Mode (optional)"
            >
              {AVAILABILITY_MODE_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>{opt}</SelectItem>
              ))}
            </Select>
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Direct Retail Warehouse</label>
            <SearchableSelect
              id="direct_retail_warehouse"
              value={form.direct_retail_warehouse}
              onChange={(_, val) => setForm({ ...form, direct_retail_warehouse: val })}
              options={warehouses.map((w) => ({ value: w.name, label: w.name }))}
              placeholder="Select Warehouse (optional)"
              strict
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="active"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="active" className="font-semibold text-muted-foreground">Active</label>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="controlled_by_sales_plan"
              checked={form.controlled_by_sales_plan}
              onChange={(e) =>
                setForm({
                  ...form,
                  controlled_by_sales_plan: e.target.checked,
                  allow_over_plan_sale: e.target.checked ? form.allow_over_plan_sale : false,
                })
              }
              className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
            />
            <label htmlFor="controlled_by_sales_plan" className="font-semibold text-muted-foreground">
              Controlled by Sales Plan
            </label>
          </div>

          {form.controlled_by_sales_plan && (
            <div className="flex items-center gap-2 pl-6">
              <input
                type="checkbox"
                id="allow_over_plan_sale"
                checked={form.allow_over_plan_sale}
                onChange={(e) => setForm({ ...form, allow_over_plan_sale: e.target.checked })}
                className="h-4 w-4 rounded border-border text-primary focus:ring-primary"
              />
              <label htmlFor="allow_over_plan_sale" className="font-semibold text-muted-foreground">
                Allow Over-Plan Sale
              </label>
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
                <span>{saving ? 'Saving...' : (editingConfig ? 'Save Changes' : 'Save Configuration')}</span>
              </div>
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default ItemProductionConfigPage;
