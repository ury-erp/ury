import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Factory, Plus, Trash2 } from 'lucide-react';
import { Card, Button, Input, Spinner, showToast } from '@ury/ui';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { dashboardService } from '../../services/dashboard';
import { call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';

interface ProductionUnitRecord {
  name: string;
  production?: string;
  production_unit_name?: string;
  branch?: string;
  item_groups?: any;
}

interface ItemGroupRow {
  id: string;
  item_group: string;
}

const createEmptyItemGroupRow = (): ItemGroupRow => ({
  id: `ig-row-${Math.random().toString(36).substring(2, 9)}`,
  item_group: '',
});

export const ProductionUnitPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [units, setUnits] = useState<ProductionUnitRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingUnit, setEditingUnit] = useState<ProductionUnitRecord | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const [branches, setBranches] = useState<{ name: string }[]>([]);
  const [itemGroupOptions, setItemGroupOptions] = useState<{ name: string; item_group_name?: string }[]>([]);

  const [newUnit, setNewUnit] = useState({
    production_unit_name: '',
    branch: '',
  });

  const [itemGroupRows, setItemGroupRows] = useState<ItemGroupRow[]>([createEmptyItemGroupRow()]);

  const fetchBranches = async () => {
    try {
      const res = await dashboardService.getModuleRecords<{ name: string }>('Branch', 'all');
      setBranches(res || []);
    } catch {
      setBranches([]);
    }
  };

  const fetchItemGroupOptions = async () => {
    try {
      let groups = await dashboardService.getModuleRecords<{ name: string; item_group_name?: string }>('Item Group', 'all');
      if (!groups || groups.length === 0) {
        const res = await call<any>('frappe.client.get_list', {
          doctype: 'Item Group',
          fields: ['name', 'item_group_name'],
          limit_page_length: 1000,
        });
        groups = (res as any)?.message || res || [];
      }
      setItemGroupOptions(groups || []);
    } catch {
      setItemGroupOptions([]);
    }
  };

  const fetchUnits = async () => {
    setLoading(true);
    try {
      const records = await dashboardService.getModuleRecords<ProductionUnitRecord>('URY Production Unit', activeBranchId);
      setUnits(records || []);
    } catch {
      setUnits([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBranches();
    fetchItemGroupOptions();
    fetchUnits();
  }, [activeBranchId]);

  const openAddDrawer = () => {
    setEditingUnit(null);
    setNewUnit({
      production_unit_name: '',
      branch: activeBranchId !== 'all' ? activeBranchId : (branches[0]?.name || ''),
    });
    setItemGroupRows([createEmptyItemGroupRow()]);
    setIsDrawerOpen(true);
  };

  const openEditDrawer = async (unit: ProductionUnitRecord) => {
    setEditingUnit(unit);
    try {
      const doc = await call<any>('frappe.client.get', {
        doctype: 'URY Production Unit',
        name: unit.name
      });
      const data = doc.message || doc;
      
      let rows: ItemGroupRow[] = [];
      if (Array.isArray(data.item_groups) && data.item_groups.length > 0) {
        rows = data.item_groups.map((ig: any) => ({
          id: `ig-row-${Math.random().toString(36).substring(2, 9)}`,
          item_group: ig.item_group || '',
        }));
      } else if (typeof data.item_groups === 'string' && data.item_groups) {
        rows = data.item_groups.split(',').map((g: string) => ({
          id: `ig-row-${Math.random().toString(36).substring(2, 9)}`,
          item_group: g.trim(),
        })).filter((r: ItemGroupRow) => r.item_group);
      }
      
      if (rows.length === 0) {
        rows = [createEmptyItemGroupRow()];
      }
      
      setNewUnit({
        production_unit_name: data.production || data.production_unit_name || data.name,
        branch: data.branch || '',
      });
      setItemGroupRows(rows);
    } catch (err) {
      setNewUnit({
        production_unit_name: unit.production || unit.production_unit_name || unit.name,
        branch: unit.branch || '',
      });
      setItemGroupRows([createEmptyItemGroupRow()]);
    }
    
    setIsDrawerOpen(true);
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    const prodName = newUnit.production_unit_name.trim();
    if (!prodName) {
      showToast.error('Production Unit Name is required');
      return;
    }

    const selectedGroups = itemGroupRows
      .map(r => r.item_group.trim())
      .filter(g => g);

    if (selectedGroups.length === 0) {
      showToast.error('Please select at least one Item Group');
      return;
    }

    const hasDup = selectedGroups.some((group, idx) => selectedGroups.indexOf(group) !== idx);
    if (hasDup) {
      showToast.error('Duplicate Item Groups are not allowed');
      return;
    }

    setSaving(true);
    try {
      const childTableData = selectedGroups.map(group => ({
        doctype: 'URY Production Item Groups',
        item_group: group
      }));

      const payload = {
        production: prodName,
        branch: newUnit.branch,
        item_groups: childTableData
      };

      if (editingUnit) {
        await call('frappe.client.set_value', {
          doctype: 'URY Production Unit',
          name: editingUnit.name,
          fieldname: payload,
        });
      } else {
        await call('frappe.client.insert', {
          doc: {
            doctype: 'URY Production Unit',
            ...payload
          },
        });
      }
      fetchUnits();
      setIsDrawerOpen(false);
      showToast.success(`Production Unit ${editingUnit ? 'updated' : 'added'} successfully`);
    } catch (err: any) {
      console.error('Failed to save Production Unit', err);
      let errorMessage = 'Failed to save Production Unit';
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
      {/* Toolbar */}
      <div className="-mx-6 px-6 -mt-6 pt-6 pb-3 border-b border-gray-200 flex flex-col md:flex-row items-center justify-end gap-4">
        <Button
          onClick={openAddDrawer}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Production Unit</span>
        </Button>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center bg-white rounded-lg border border-gray-200">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : units.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-gray-200 shadow-sm bg-white">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Factory className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No Production Units Configured</h3>
          <p className="text-gray-500 mb-6 max-w-sm">
            Add production units to organize kitchen routing for item groups.
          </p>
          <Button
            onClick={openAddDrawer}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Production Unit</span>
          </Button>
        </Card>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
              <tr>
                <th className="px-6 py-4">Production Unit</th>
                <th className="px-6 py-4">Branch</th>
                <th className="px-6 py-4">Item Groups</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {units.map((unit) => {
                let itemGroupsStr = '';
                if (Array.isArray(unit.item_groups)) {
                  itemGroupsStr = unit.item_groups.map((ig: any) => ig.item_group).join(', ');
                } else if (typeof unit.item_groups === 'string') {
                  itemGroupsStr = unit.item_groups;
                }
                return (
                  <tr key={unit.name} className="transition-colors cursor-pointer hover:bg-gray-50" onClick={() => openEditDrawer(unit)}>
                    <td className="px-6 py-4 font-semibold text-gray-900">{unit.production || unit.production_unit_name || unit.name}</td>
                    <td className="px-6 py-4">{unit.branch || 'Main'}</td>
                    <td className="px-6 py-4">{itemGroupsStr || '-'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add/Edit SideDrawer */}
      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingUnit ? 'Edit Production Unit' : 'Add Production Unit'}
      >
        <form onSubmit={handleSaveUnit} className="space-y-5 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">
              Production Unit Name <span className="text-red-500">*</span>
            </label>
            <Input
              value={newUnit.production_unit_name}
              onChange={(e) => setNewUnit({ ...newUnit, production_unit_name: e.target.value })}
              required
              placeholder="e.g. Main Kitchen, Bar"
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">
              Branch <span className="text-red-500">*</span>
            </label>
            <SearchableSelect
              id="branch"
              value={newUnit.branch}
              onChange={(_, val) => setNewUnit({ ...newUnit, branch: val })}
              options={branches.map(b => ({ value: b.name, label: b.name }))}
              placeholder="Select Branch..."
            />
          </div>

          {/* Item Groups Section */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between">
              <label className="block font-semibold text-gray-700 text-sm">
                Item Groups <span className="text-red-500">*</span>
              </label>
            </div>

            <div className="space-y-3">
              {itemGroupRows.map((row, index) => {
                const filteredOptions = itemGroupOptions
                  .filter(ig => {
                    const igName = ig.name;
                    return (
                      row.item_group === igName ||
                      !itemGroupRows.some((r, rIdx) => rIdx !== index && r.item_group === igName)
                    );
                  })
                  .map(ig => ({
                    value: ig.name,
                    label: ig.item_group_name || ig.name,
                  }));

                return (
                  <div key={row.id} className="flex items-center gap-3 relative" style={{ zIndex: 50 - index }}>
                    <div className="flex-1">
                      <SearchableSelect
                        id={`item-group-${index}`}
                        value={row.item_group}
                        options={filteredOptions}
                        placeholder="Select Item Group..."
                        onChange={(_, value) => {
                          const isDup = itemGroupRows.some((r, rIdx) => r.item_group === value && rIdx !== index);
                          if (isDup) {
                            showToast.error('This Item Group is already selected');
                            return;
                          }
                          const updatedRows = [...itemGroupRows];
                          updatedRows[index] = { ...updatedRows[index], item_group: value };
                          setItemGroupRows(updatedRows);
                        }}
                      />
                    </div>

                    {itemGroupRows.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setItemGroupRows(itemGroupRows.filter((_, idx) => idx !== index));
                        }}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 p-2 h-auto shrink-0"
                        title="Delete Row"
                      >
                        <Trash2 className="w-5 h-5" />
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setItemGroupRows((prev) => [...prev, createEmptyItemGroupRow()]);
              }}
              className="w-full py-2 border-dashed border-primary text-primary hover:bg-primary/5 flex items-center justify-center gap-1.5 text-xs font-semibold mt-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Item Group</span>
            </Button>
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t mt-6 border-gray-100">
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsDrawerOpen(false)}
              disabled={saving}
              className="font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span>{editingUnit ? 'Save Changes' : 'Save Unit'}</span>
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default ProductionUnitPage;
