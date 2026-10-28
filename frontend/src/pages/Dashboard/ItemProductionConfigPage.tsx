import React, { useCallback, useEffect, useState } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Plus } from 'lucide-react';
import {
  Page,
  Section,
  Button,
  Select,
  SelectItem,
  Spinner,
  showToast,
  DataTable,
  messageToPlainText,
  Autocomplete,
  Checkbox,
  type AutocompleteOption,
} from '@ury/ui';
import { dashboardService } from '../../services/dashboard';
import { searchLinkOptions, withSelectedOption, type LinkFilter } from '../../services/linkSearch';
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
  product_bundle?: string;
  sourcing_mode?: string;
  active?: number;
  controlled_by_sales_plan?: number;
  allow_over_plan_sale?: number;
  availability_mode?: string;
  direct_retail_warehouse?: string;
  external_receiving_warehouse?: string;
}

const DEFAULT_PRODUCTION_POLICY_OPTIONS = [
  'PRE_PRODUCED',
  'MADE_TO_ORDER',
  'DIRECT_RETAIL',
  'BUNDLE',
];
const SOURCING_MODE_OPTIONS = ['IN_HOUSE', 'EXTERNAL_RECEIPT'];
const AVAILABILITY_MODE_OPTIONS = ['Always Available', 'Plan Available', 'Stock Available'];

const emptyForm = {
  active: true,
  item: '',
  branch: '',
  department: '',
  production_unit: '',
  production_policy: '',
  bom: '',
  product_bundle: '',
  sourcing_mode: 'IN_HOUSE',
  controlled_by_sales_plan: false,
  allow_over_plan_sale: false,
  availability_mode: '',
  direct_retail_warehouse: '',
  external_receiving_warehouse: '',
};

type LinkFieldKey =
  | 'item'
  | 'branch'
  | 'department'
  | 'production_unit'
  | 'bom'
  | 'product_bundle'
  | 'direct_retail_warehouse'
  | 'external_receiving_warehouse';

const EMPTY_OPTIONS: Record<LinkFieldKey, AutocompleteOption[]> = {
  item: [],
  branch: [],
  department: [],
  production_unit: [],
  bom: [],
  product_bundle: [],
  direct_retail_warehouse: [],
  external_receiving_warehouse: [],
};

export const ItemProductionConfigPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [configs, setConfigs] = useState<ItemProductionConfigRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingConfig, setEditingConfig] = useState<ItemProductionConfigRecord | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const [form, setForm] = useState(emptyForm);
  const [linkOptions, setLinkOptions] = useState(EMPTY_OPTIONS);
  const [linkSearching, setLinkSearching] = useState<Partial<Record<LinkFieldKey, boolean>>>({});
  const [productionPolicyOptions, setProductionPolicyOptions] = useState<string[]>(
    DEFAULT_PRODUCTION_POLICY_OPTIONS
  );

  useEffect(() => {
    let isMounted = true;
    const fetchPolicyOptions = async () => {
      try {
        const res = await call<any>('frappe.client.get_value', {
          doctype: 'DocField',
          fieldname: 'options',
          filters: {
            parent: 'URY Item Production Configuration',
            fieldname: 'production_policy',
          },
        });
        const rawOptions = (res as any)?.message?.options || (res as any)?.options;
        if (typeof rawOptions === 'string' && isMounted) {
          const parsed = rawOptions
            .split('\n')
            .map((s: string) => s.trim())
            .filter(Boolean);
          if (parsed.length > 0) {
            setProductionPolicyOptions(parsed);
          }
        }
      } catch {
        // Fall back to DEFAULT_PRODUCTION_POLICY_OPTIONS
      }
    };

    fetchPolicyOptions();
    return () => {
      isMounted = false;
    };
  }, []);

  const displayPolicyOptions = Array.from(
    new Set([...productionPolicyOptions, ...(form.production_policy ? [form.production_policy] : [])])
  );

  const setFieldOptions = (field: LinkFieldKey, options: AutocompleteOption[], committed: string) => {
    setLinkOptions((prev) => ({
      ...prev,
      [field]: withSelectedOption(options, committed),
    }));
  };

  const runLinkSearch = useCallback(
    async (field: LinkFieldKey, query: string, formSnapshot: typeof emptyForm) => {
      setLinkSearching((prev) => ({ ...prev, [field]: true }));
      try {
        let options: AutocompleteOption[] = [];
        if (field === 'item') {
          options = await searchLinkOptions({
            doctype: 'Item',
            query,
            fields: ['name', 'item_name'],
            labelField: 'item_name',
            filters: [['disabled', '=', 0]],
          });
        } else if (field === 'branch') {
          options = await searchLinkOptions({ doctype: 'Branch', query });
        } else if (field === 'department') {
          options = await searchLinkOptions({
            doctype: 'URY Production Department',
            query,
            fields: ['name', 'branch'],
            descriptionField: 'branch',
            filters: formSnapshot.branch ? [['branch', '=', formSnapshot.branch]] : [],
          });
        } else if (field === 'production_unit') {
          options = await searchLinkOptions({
            doctype: 'URY Production Unit',
            query,
            fields: ['name', 'branch'],
            descriptionField: 'branch',
            filters: formSnapshot.branch ? [['branch', '=', formSnapshot.branch]] : [],
          });
        } else if (field === 'bom') {
          const bomFilters: LinkFilter[] = [
            ['docstatus', '=', 1],
            ['is_active', '=', 1],
          ];
          if (formSnapshot.item) {
            bomFilters.unshift(['item', '=', formSnapshot.item]);
          }
          options = await searchLinkOptions({
            doctype: 'BOM',
            query,
            fields: ['name', 'item'],
            descriptionField: 'item',
            filters: bomFilters,
          });
        } else if (field === 'product_bundle') {
          const bundleFilters: LinkFilter[] = [['disabled', '=', 0]];
          if (formSnapshot.item) {
            bundleFilters.unshift(['new_item_code', '=', formSnapshot.item]);
          }
          options = await searchLinkOptions({
            doctype: 'Product Bundle',
            query,
            fields: ['name', 'new_item_code'],
            descriptionField: 'new_item_code',
            filters: bundleFilters,
          });
        } else if (field === 'direct_retail_warehouse' || field === 'external_receiving_warehouse') {
          options = await searchLinkOptions({
            doctype: 'Warehouse',
            query,
            filters: [['disabled', '=', 0]],
          });
        }
        setFieldOptions(field, options, formSnapshot[field]);
      } catch {
        setFieldOptions(field, [], formSnapshot[field]);
      } finally {
        setLinkSearching((prev) => ({ ...prev, [field]: false }));
      }
    },
    []
  );

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
    fetchConfigs();
  }, [activeBranchId]);

  const openAddDrawer = () => {
    setEditingConfig(null);
    const branch = activeBranchId !== 'all' ? activeBranchId : '';
    setForm({ ...emptyForm, branch });
    setLinkOptions({
      ...EMPTY_OPTIONS,
      ...(branch ? { branch: [{ value: branch, label: branch }] } : {}),
    });
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (config: ItemProductionConfigRecord) => {
    setEditingConfig(config);
    const nextForm = {
      active: config.active !== 0,
      item: config.item || '',
      branch: config.branch || '',
      department: config.department || '',
      production_unit: config.production_unit || '',
      production_policy: config.production_policy || '',
      bom: config.bom || '',
      product_bundle: config.product_bundle || '',
      sourcing_mode: config.sourcing_mode || 'IN_HOUSE',
      controlled_by_sales_plan: !!config.controlled_by_sales_plan,
      allow_over_plan_sale: !!config.allow_over_plan_sale,
      availability_mode: config.availability_mode || '',
      direct_retail_warehouse: config.direct_retail_warehouse || '',
      external_receiving_warehouse: config.external_receiving_warehouse || '',
    };
    setForm(nextForm);
    setLinkOptions({
      item: nextForm.item ? [{ value: nextForm.item, label: nextForm.item }] : [],
      branch: nextForm.branch ? [{ value: nextForm.branch, label: nextForm.branch }] : [],
      department: nextForm.department ? [{ value: nextForm.department, label: nextForm.department }] : [],
      production_unit: nextForm.production_unit
        ? [{ value: nextForm.production_unit, label: nextForm.production_unit }]
        : [],
      bom: nextForm.bom ? [{ value: nextForm.bom, label: nextForm.bom }] : [],
      product_bundle: nextForm.product_bundle
        ? [{ value: nextForm.product_bundle, label: nextForm.product_bundle }]
        : [],
      direct_retail_warehouse: nextForm.direct_retail_warehouse
        ? [{ value: nextForm.direct_retail_warehouse, label: nextForm.direct_retail_warehouse }]
        : [],
      external_receiving_warehouse: nextForm.external_receiving_warehouse
        ? [{ value: nextForm.external_receiving_warehouse, label: nextForm.external_receiving_warehouse }]
        : [],
    });
    setIsDrawerOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.item || !form.branch) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        active: form.active ? 1 : 0,
        item: form.item,
        branch: form.branch,
        department: form.department || null,
        production_unit: form.production_unit || null,
        production_policy: form.production_policy || null,
        bom: form.bom || null,
        product_bundle: form.production_policy === 'BUNDLE' ? form.product_bundle || null : null,
        sourcing_mode: form.production_policy === 'PRE_PRODUCED' ? form.sourcing_mode || 'IN_HOUSE' : null,
        external_receiving_warehouse:
          form.production_policy === 'PRE_PRODUCED' && form.sourcing_mode === 'EXTERNAL_RECEIPT'
            ? form.external_receiving_warehouse || null
            : null,
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
              errorMessage = messageToPlainText(lastMessage.message);
            }
          }
        } catch {
          // keep default
        }
      } else if (err.message) {
        errorMessage = err.message;
      }
      showToast.error(errorMessage);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page>
      <div className="flex flex-col md:flex-row items-center justify-end gap-4 pb-3 border-b border-border">
        <Button
          onClick={openAddDrawer}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Item Production Configuration</span>
        </Button>
      </div>

      <Section>
        {loading ? (
          <div className="py-16 flex items-center justify-center bg-card rounded-[9px] border border-hair">
            <Spinner className="w-8 h-8 text-primary" />
          </div>
        ) : configs.length === 0 ? (
          <div className="px-4 py-[18px] text-xs text-text-tertiary flex items-center gap-2.5 bg-card border border-hair rounded-[9px]">
            <span>Map items to production units and departments to enable kitchen/bar routing.</span>
            <Button
              onClick={openAddDrawer}
              variant="chrome"
              size="compactSm"
              className="ml-auto"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Config</span>
            </Button>
          </div>
        ) : (
          <DataTable<ItemProductionConfigRecord>
            columns={[
              { key: 'item', header: 'Item', render: (row) => <span className="font-semibold">{row.item}</span> },
              { key: 'branch', header: 'Branch', render: (row) => row.branch },
              { key: 'department', header: 'Department', render: (row) => row.department || '-' },
              { key: 'production_unit', header: 'Production Unit', render: (row) => row.production_unit || '-' },
              { key: 'production_policy', header: 'Policy', render: (row) => row.production_policy || '-' },
              { key: 'active', header: 'Active', align: 'right', render: (row) => (row.active ? 'Yes' : 'No') },
            ]}
            rows={configs}
            onRowClick={openEditDrawer}
          />
        )}
      </Section>

      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingConfig ? 'Edit Item Production Configuration' : 'Add Item Production Configuration'}
      >
        <form onSubmit={handleSave} className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-muted-foreground mb-1" htmlFor="item">
              Item
            </label>
            <Autocomplete
              id="item"
              value={form.item}
              onChange={(val) => {
                setForm((prev) => ({
                  ...prev,
                  item: val,
                  bom: '',
                  ...(prev.production_policy === 'BUNDLE' && !prev.product_bundle ? { product_bundle: val } : {}),
                }));
                setLinkOptions((prev) => ({ ...prev, bom: [], product_bundle: [] }));
              }}
              onSearch={(query) => runLinkSearch('item', query, form)}
              options={linkOptions.item}
              searching={!!linkSearching.item}
              placeholder="Search Item"
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1" htmlFor="branch">
              Branch
            </label>
            <Autocomplete
              id="branch"
              value={form.branch}
              onChange={(val) => {
                setForm((prev) => ({
                  ...prev,
                  branch: val,
                  department: '',
                  production_unit: '',
                }));
                setLinkOptions((prev) => ({ ...prev, department: [], production_unit: [] }));
              }}
              onSearch={(query) => runLinkSearch('branch', query, form)}
              options={linkOptions.branch}
              searching={!!linkSearching.branch}
              placeholder="Search Branch"
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1" htmlFor="department">
              Department
            </label>
            <Autocomplete
              id="department"
              value={form.department}
              onChange={(val) => setForm((prev) => ({ ...prev, department: val }))}
              onSearch={(query) => runLinkSearch('department', query, form)}
              options={linkOptions.department}
              searching={!!linkSearching.department}
              placeholder="Search Department (optional)"
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1" htmlFor="production_unit">
              Production Unit
            </label>
            <Autocomplete
              id="production_unit"
              value={form.production_unit}
              onChange={(val) => setForm((prev) => ({ ...prev, production_unit: val }))}
              onSearch={(query) => runLinkSearch('production_unit', query, form)}
              options={linkOptions.production_unit}
              searching={!!linkSearching.production_unit}
              placeholder="Search Production Unit (optional)"
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1" htmlFor="production_policy">
              Production Policy
            </label>
            <Select
              id="production_policy"
              value={form.production_policy}
              onChange={(e) => {
                const nextPolicy = e.target.value;
                setForm((prev) => ({
                  ...prev,
                  production_policy: nextPolicy,
                  ...(nextPolicy === 'BUNDLE' && !prev.product_bundle && prev.item
                    ? { product_bundle: prev.item }
                    : {}),
                }));
              }}
              placeholder="Select Policy (optional)"
            >
              {displayPolicyOptions.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </Select>
          </div>

          {form.production_policy === 'BUNDLE' && (
            <div>
              <label className="block font-semibold text-muted-foreground mb-1" htmlFor="product_bundle">
                Product Bundle
              </label>
              <Autocomplete
                id="product_bundle"
                value={form.product_bundle}
                onChange={(val) => setForm((prev) => ({ ...prev, product_bundle: val }))}
                onSearch={(query) => runLinkSearch('product_bundle', query, form)}
                options={linkOptions.product_bundle}
                searching={!!linkSearching.product_bundle}
                placeholder={form.item ? 'Search Product Bundle' : 'Select an Item first'}
                disabled={!form.item}
              />
              <p className="text-xs text-text-tertiary mt-1">Product Bundle must belong to the selected Item.</p>
            </div>
          )}

          {form.production_policy === 'PRE_PRODUCED' && (
            <div>
              <label className="block font-semibold text-muted-foreground mb-1">Sourcing Mode</label>
              <Select
                id="sourcing_mode"
                value={form.sourcing_mode}
                onChange={(e) => setForm({ ...form, sourcing_mode: e.target.value })}
              >
                {SOURCING_MODE_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>
                    {opt}
                  </SelectItem>
                ))}
              </Select>
            </div>
          )}

          {form.production_policy === 'PRE_PRODUCED' && form.sourcing_mode === 'EXTERNAL_RECEIPT' && (
            <div>
              <label className="block font-semibold text-muted-foreground mb-1" htmlFor="external_receiving_warehouse">
                External Receiving Warehouse
              </label>
              <Autocomplete
                id="external_receiving_warehouse"
                value={form.external_receiving_warehouse}
                onChange={(val) => setForm((prev) => ({ ...prev, external_receiving_warehouse: val }))}
                onSearch={(query) => runLinkSearch('external_receiving_warehouse', query, form)}
                options={linkOptions.external_receiving_warehouse}
                searching={!!linkSearching.external_receiving_warehouse}
                placeholder="Search Warehouse (optional)"
              />
            </div>
          )}

          <div>
            <label className="block font-semibold text-muted-foreground mb-1" htmlFor="bom">
              BOM
            </label>
            <Autocomplete
              id="bom"
              value={form.bom}
              onChange={(val) => setForm((prev) => ({ ...prev, bom: val }))}
              onSearch={(query) => runLinkSearch('bom', query, form)}
              options={linkOptions.bom}
              searching={!!linkSearching.bom}
              placeholder={form.item ? 'Search BOM' : 'Select an Item first'}
              disabled={!form.item}
            />
            <p className="text-xs text-text-tertiary mt-1">BOM must belong to the selected Item.</p>
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Availability Mode</label>
            <Select
              value={form.availability_mode}
              onChange={(e) => setForm({ ...form, availability_mode: e.target.value })}
              placeholder="Select Availability Mode (optional)"
            >
              {AVAILABILITY_MODE_OPTIONS.map((opt) => (
                <SelectItem key={opt} value={opt}>
                  {opt}
                </SelectItem>
              ))}
            </Select>
            {form.availability_mode === 'Stock Available' && (
              <p className="text-xs text-text-tertiary mt-1">
                Stock Available checks warehouse stock or recipe capacity directly and bypasses all
                Sales Plan restrictions for this item.
              </p>
            )}
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1" htmlFor="direct_retail_warehouse">
              Direct Retail Warehouse
            </label>
            <Autocomplete
              id="direct_retail_warehouse"
              value={form.direct_retail_warehouse}
              onChange={(val) => setForm((prev) => ({ ...prev, direct_retail_warehouse: val }))}
              onSearch={(query) => runLinkSearch('direct_retail_warehouse', query, form)}
              options={linkOptions.direct_retail_warehouse}
              searching={!!linkSearching.direct_retail_warehouse}
              placeholder="Search Warehouse (optional)"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="active"
              size="sm"
              checked={form.active}
              onChange={(e) => setForm({ ...form, active: e.target.checked })}
            />
            <label htmlFor="active" className="font-semibold text-muted-foreground">
              Active
            </label>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="controlled_by_sales_plan"
              size="sm"
              checked={form.controlled_by_sales_plan}
              onChange={(e) =>
                setForm({
                  ...form,
                  controlled_by_sales_plan: e.target.checked,
                  allow_over_plan_sale: e.target.checked ? form.allow_over_plan_sale : false,
                })
              }
            />
            <label htmlFor="controlled_by_sales_plan" className="font-semibold text-muted-foreground">
              Controlled by Sales Plan
            </label>
          </div>

          {form.controlled_by_sales_plan && (
            <div className="flex items-center gap-2 pl-6">
              <Checkbox
                id="allow_over_plan_sale"
                size="sm"
                checked={form.allow_over_plan_sale}
                onChange={(e) => setForm({ ...form, allow_over_plan_sale: e.target.checked })}
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
                {saving && <Spinner className="w-4 h-4" hideMessage />}
                <span>{saving ? 'Saving...' : editingConfig ? 'Save Changes' : 'Save Configuration'}</span>
              </div>
            </Button>
          </div>
        </form>
      </SideDrawer>
    </Page>
  );
};

export default ItemProductionConfigPage;
