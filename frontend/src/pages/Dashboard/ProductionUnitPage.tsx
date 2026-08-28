import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Factory, Plus, Edit2 } from 'lucide-react';
import { Card, Button, Input, Select, Spinner, showToast } from '@ury/ui';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { dashboardService } from '../../services/dashboard';
import { call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';

interface ProductionUnitRecord {
  name: string;
  production_unit_name?: string;
  branch?: string;
  item_groups?: string;
  assigned_employees?: string;
}

export const ProductionUnitPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [units, setUnits] = useState<ProductionUnitRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingUnit, setEditingUnit] = useState<ProductionUnitRecord | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const [branches, setBranches] = useState<{ name: string }[]>([]);

  const [newUnit, setNewUnit] = useState({
    production_unit_name: '',
    branch: '',
    item_groups: '',
    assigned_employees: ''
  });

  const fetchBranches = async () => {
    try {
      const res = await dashboardService.getModuleRecords<{ name: string }>('Branch', 'all');
      setBranches(res || []);
    } catch {
      setBranches([]);
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
    fetchUnits();
  }, [activeBranchId]);

  const openAddDrawer = () => {
    setEditingUnit(null);
    setNewUnit({
      production_unit_name: '',
      branch: activeBranchId !== 'all' ? activeBranchId : (branches[0]?.name || ''),
      item_groups: '',
      assigned_employees: ''
    });
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

      let itemGroupsStr = data.item_groups || '';
      if (Array.isArray(data.item_groups)) {
        itemGroupsStr = data.item_groups.map((ig: any) => ig.item_group).join(', ');
      }

      let employeesStr = data.assigned_employees || '';
      if (Array.isArray(data.assigned_employees)) {
        employeesStr = data.assigned_employees.map((emp: any) => emp.employee).join(', ');
      }

      setNewUnit({
        production_unit_name: data.production_unit_name || data.name,
        branch: data.branch || '',
        item_groups: itemGroupsStr,
        assigned_employees: employeesStr
      });
    } catch (err) {
      setNewUnit({
        production_unit_name: unit.production_unit_name || unit.name,
        branch: unit.branch || '',
        item_groups: unit.item_groups || '',
        assigned_employees: unit.assigned_employees || ''
      });
    }

    setIsDrawerOpen(true);
  };

  const handleSaveUnit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUnit.production_unit_name) return;
    setSaving(true);
    try {
      const itemGroupsList = newUnit.item_groups.split(',').map(g => g.trim()).filter(g => g);
      const itemGroupsData = itemGroupsList.map(g => ({ item_group: g }));

      const employeesList = newUnit.assigned_employees.split(',').map(e => e.trim()).filter(e => e);
      const employeesData = employeesList.map(e => ({ employee: e }));

      const payload = {
        production_unit_name: newUnit.production_unit_name,
        branch: newUnit.branch,
        item_groups: itemGroupsData.length > 0 ? itemGroupsData : [],
        assigned_employees: employeesData.length > 0 ? employeesData : []
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
      {/* Toolbar — Partition Style, no title */}
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
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {units.map((unit) => (
                <tr key={unit.name} className="transition-colors cursor-pointer hover:bg-gray-50" onClick={() => openEditDrawer(unit)}>
                  <td className="px-6 py-4 font-semibold text-gray-900">{unit.production_unit_name || unit.name}</td>
                  <td className="px-6 py-4">{unit.branch || 'Main'}</td>
                </tr>
              ))}
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
        <form onSubmit={handleSaveUnit} className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1">Production Unit Name</label>
            <Input
              value={newUnit.production_unit_name}
              onChange={(e) => setNewUnit({ ...newUnit, production_unit_name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">Branch</label>
            <SearchableSelect
              id="branch"
              value={newUnit.branch}
              onChange={(id, val) => setNewUnit({ ...newUnit, branch: val })}
              options={branches.map(b => ({ value: b.name, label: b.name }))}
              placeholder="Select Branch"
            />
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">Item Groups (comma separated)</label>
            <Input
              value={newUnit.item_groups}
              onChange={(e) => setNewUnit({ ...newUnit, item_groups: e.target.value })}
              placeholder="Beverages, Snacks"
            />
            <p className="text-xs text-gray-500 mt-1">
              Comma separated list of item groups mapped to this unit.
            </p>
          </div>

          <div>
            <label className="block font-semibold text-gray-700 mb-1">Assigned Employees (comma separated)</label>
            <Input
              value={newUnit.assigned_employees}
              onChange={(e) => setNewUnit({ ...newUnit, assigned_employees: e.target.value })}
              placeholder="EMP001, EMP002"
            />
            <p className="text-xs text-gray-500 mt-1">
              Comma separated list of employee IDs assigned to this unit.
            </p>
          </div>

          <div className="pt-6 flex justify-end gap-2 border-t mt-4 border-gray-100">
            <Button type="button" variant="outline" onClick={() => setIsDrawerOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-white disabled:opacity-50 disabled:cursor-not-allowed" disabled={saving}>
              <div className="flex items-center gap-2">
                {saving && <Spinner className="w-4 h-4" />}
                <span>{saving ? 'Saving...' : (editingUnit ? 'Save Changes' : 'Save Unit')}</span>
              </div>
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default ProductionUnitPage;
