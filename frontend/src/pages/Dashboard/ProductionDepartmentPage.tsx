import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Building, Plus, Edit2 } from 'lucide-react';
import { Card, Button, Input, Select, Spinner, showToast } from '@ury/ui';
import { SearchableSelect } from '../../components/common/SearchableSelect';
import { dashboardService } from '../../services/dashboard';
import { call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';

interface ProductionDepartmentRecord {
  name: string;
  department_name?: string;
  company?: string;
  branch?: string;
  department_manager?: string;
  department_warehouse?: string;
  cost_center?: string;
  issue_control_policy?: string;
  wastage_policy?: string;
  enabled?: boolean;
}

export const ProductionDepartmentPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [departments, setDepartments] = useState<ProductionDepartmentRecord[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [editingDepartment, setEditingDepartment] = useState<ProductionDepartmentRecord | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const [companies, setCompanies] = useState<{ name: string }[]>([]);
  const [branches, setBranches] = useState<{ name: string }[]>([]);
  const [managers, setManagers] = useState<{ name: string; full_name?: string }[]>([]);
  const [warehouses, setWarehouses] = useState<{ name: string }[]>([]);
  const [costCenters, setCostCenters] = useState<{ name: string }[]>([]);

  const [newDepartment, setNewDepartment] = useState({
    department_name: '',
    company: '',
    branch: '',
    department_manager: '',
    department_warehouse: '',
    cost_center: '',
    issue_control_policy: 'Plan Controlled',
    wastage_policy: '',
    enabled: true
  });

  const fetchLookupData = async () => {
    try {
      const [companiesRes, branchesRes, managersRes, warehousesRes, costCentersRes] = await Promise.all([
        dashboardService.getModuleRecords<{ name: string }>('Company', 'all'),
        dashboardService.getModuleRecords<{ name: string }>('Branch', 'all'),
        dashboardService.getModuleRecords<{ name: string; full_name?: string }>('User', 'all'),
        dashboardService.getModuleRecords<{ name: string }>('Warehouse', 'all'),
        dashboardService.getModuleRecords<{ name: string }>('Cost Center', 'all')
      ]);
      setCompanies(companiesRes || []);
      setBranches(branchesRes || []);
      setManagers(managersRes || []);
      setWarehouses(warehousesRes || []);
      setCostCenters(costCentersRes || []);
    } catch (err) {
      console.error('Failed to fetch lookup data', err);
    }
  };

  const fetchDepartments = async () => {
    setLoading(true);
    try {
      const records = await dashboardService.getModuleRecords<ProductionDepartmentRecord>('URY Production Department', activeBranchId);
      setDepartments(records || []);
    } catch {
      setDepartments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLookupData();
    fetchDepartments();
  }, [activeBranchId]);

  const openAddDrawer = () => {
    setEditingDepartment(null);
    setNewDepartment({
      department_name: '',
      company: '',
      branch: activeBranchId !== 'all' ? activeBranchId : (branches[0]?.name || ''),
      department_manager: '',
      department_warehouse: '',
      cost_center: '',
      issue_control_policy: 'Plan Controlled',
      wastage_policy: '',
      enabled: true
    });
    setIsDrawerOpen(true);
  };

  const openEditDrawer = async (department: ProductionDepartmentRecord) => {
    setEditingDepartment(department);
    try {
      const doc = await call<any>('frappe.client.get', {
        doctype: 'URY Production Department',
        name: department.name
      });
      const data = doc.message || doc;
      
      setNewDepartment({
        department_name: data.department_name || data.name,
        company: data.company || '',
        branch: data.branch || '',
        department_manager: data.department_manager || '',
        department_warehouse: data.department_warehouse || '',
        cost_center: data.cost_center || '',
        issue_control_policy: data.issue_control_policy || 'Plan Controlled',
        wastage_policy: data.wastage_policy || '',
        enabled: data.enabled !== false
      });
    } catch (err) {
      setNewDepartment({
        department_name: department.department_name || department.name,
        company: department.company || '',
        branch: department.branch || '',
        department_manager: department.department_manager || '',
        department_warehouse: department.department_warehouse || '',
        cost_center: department.cost_center || '',
        issue_control_policy: department.issue_control_policy || 'Plan Controlled',
        wastage_policy: department.wastage_policy || '',
        enabled: department.enabled !== false
      });
    }
    
    setIsDrawerOpen(true);
  };

  const handleSaveDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDepartment.department_name || !newDepartment.company || !newDepartment.branch || !newDepartment.department_warehouse || !newDepartment.cost_center) {
      showToast.error('Please fill in all required fields');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        department_name: newDepartment.department_name,
        company: newDepartment.company,
        branch: newDepartment.branch,
        department_manager: newDepartment.department_manager,
        department_warehouse: newDepartment.department_warehouse,
        cost_center: newDepartment.cost_center,
        issue_control_policy: newDepartment.issue_control_policy,
        wastage_policy: newDepartment.wastage_policy,
        enabled: newDepartment.enabled
      };

      if (editingDepartment) {
        await call('frappe.client.set_value', {
          doctype: 'URY Production Department',
          name: editingDepartment.name,
          fieldname: payload,
        });
      } else {
        await call('frappe.client.insert', {
          doc: {
            doctype: 'URY Production Department',
            ...payload
          },
        });
      }
      fetchDepartments();
      setIsDrawerOpen(false);
      showToast.success(`Production Department ${editingDepartment ? 'updated' : 'added'} successfully`);
    } catch (err: any) {
      console.error('Failed to save Production Department', err);
      let errorMessage = 'Failed to save Production Department';
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
      <div className="-mx-6 px-6 -mt-6 pt-6 pb-3 border-b border-border flex flex-col md:flex-row items-center justify-end gap-4">
        <Button
          onClick={openAddDrawer}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Production Department</span>
        </Button>
      </div>

      {loading ? (
        <div className="py-16 flex items-center justify-center bg-white rounded-lg border border-border">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : departments.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-border shadow-sm bg-white">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Building className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No Production Departments Configured</h3>
          <p className="text-text-tertiary mb-6 max-w-sm">
            Add production departments to organize kitchen operations and control policies.
          </p>
          <Button
            onClick={openAddDrawer}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Production Department</span>
          </Button>
        </Card>
      ) : (
        <div className="bg-white rounded-lg border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm text-muted-foreground">
            <thead className="bg-muted border-b border-border text-xs text-text-tertiary font-semibold">
              <tr>
                <th className="px-6 py-4">Department</th>
                <th className="px-6 py-4">Company</th>
                <th className="px-6 py-4">Branch</th>
                <th className="px-6 py-4">Warehouse</th>
                <th className="px-6 py-4">Policy</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {departments.map((dept) => (
                <tr key={dept.name} className="transition-colors cursor-pointer hover:bg-muted" onClick={() => openEditDrawer(dept)}>
                  <td className="px-6 py-4 font-semibold text-foreground">{dept.department_name || dept.name}</td>
                  <td className="px-6 py-4">{dept.company || '-'}</td>
                  <td className="px-6 py-4">{dept.branch || '-'}</td>
                  <td className="px-6 py-4">{dept.department_warehouse || '-'}</td>
                  <td className="px-6 py-4 text-xs bg-primary-tint text-primary rounded px-2 py-1 inline-block">{dept.issue_control_policy || 'Plan Controlled'}</td>
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
        title={editingDepartment ? 'Edit Production Department' : 'Add Production Department'}
      >
        <form onSubmit={handleSaveDepartment} className="space-y-4 text-sm">
          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Department Name *</label>
            <Input
              value={newDepartment.department_name}
              onChange={(e) => setNewDepartment({ ...newDepartment, department_name: e.target.value })}
              required
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Company *</label>
            <SearchableSelect
              id="company"
              value={newDepartment.company}
              onChange={(id, val) => setNewDepartment({ ...newDepartment, company: val })}
              options={companies.map(c => ({ value: c.name, label: c.name }))}
              placeholder="Select Company"
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Branch *</label>
            <SearchableSelect
              id="branch"
              value={newDepartment.branch}
              onChange={(id, val) => setNewDepartment({ ...newDepartment, branch: val })}
              options={branches.map(b => ({ value: b.name, label: b.name }))}
              placeholder="Select Branch"
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Department Manager</label>
            <SearchableSelect
              id="department_manager"
              value={newDepartment.department_manager}
              onChange={(id, val) => setNewDepartment({ ...newDepartment, department_manager: val })}
              options={managers.map(m => ({ value: m.name, label: m.full_name || m.name }))}
              placeholder="Select Manager (optional)"
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Department Warehouse *</label>
            <SearchableSelect
              id="department_warehouse"
              value={newDepartment.department_warehouse}
              onChange={(id, val) => setNewDepartment({ ...newDepartment, department_warehouse: val })}
              options={warehouses.map(w => ({ value: w.name, label: w.name }))}
              placeholder="Select Warehouse"
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Cost Center *</label>
            <SearchableSelect
              id="cost_center"
              value={newDepartment.cost_center}
              onChange={(id, val) => setNewDepartment({ ...newDepartment, cost_center: val })}
              options={costCenters.map(cc => ({ value: cc.name, label: cc.name }))}
              placeholder="Select Cost Center"
            />
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Issue Control Policy *</label>
            <Select
              value={newDepartment.issue_control_policy}
              onChange={(e) => setNewDepartment({ ...newDepartment, issue_control_policy: e.target.value })}
            >
              <option value="Plan Controlled">Plan Controlled</option>
              <option value="Plan Controlled with Override">Plan Controlled with Override</option>
              <option value="Open Issue">Open Issue</option>
            </Select>
          </div>

          <div>
            <label className="block font-semibold text-muted-foreground mb-1">Wastage Policy</label>
            <Input
              value={newDepartment.wastage_policy}
              onChange={(e) => setNewDepartment({ ...newDepartment, wastage_policy: e.target.value })}
              placeholder="Optional wastage policy notes"
            />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="enabled"
              checked={newDepartment.enabled}
              onChange={(e) => setNewDepartment({ ...newDepartment, enabled: e.target.checked })}
              className="rounded border-border"
            />
            <label htmlFor="enabled" className="font-semibold text-muted-foreground">Enabled</label>
          </div>

          <div className="pt-6 flex justify-end gap-2 border-t mt-4 border-border">
            <Button type="button" variant="outline" onClick={() => setIsDrawerOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" className="bg-primary hover:bg-primary/90 text-white disabled:opacity-50 disabled:cursor-not-allowed" disabled={saving}>
              <div className="flex items-center gap-2">
                {saving && <Spinner className="w-4 h-4" />}
                <span>{saving ? 'Saving...' : (editingDepartment ? 'Save Changes' : 'Save Department')}</span>
              </div>
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default ProductionDepartmentPage;
