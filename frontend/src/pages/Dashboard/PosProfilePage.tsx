import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Printer, Shield, Settings2, Plus, X, Eye, Edit2, ChevronRight, Save } from 'lucide-react';
import { Card, Button, Input, Select, Spinner, showToast } from '@ury/ui';
import { call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';

interface PosProfileRecord {
  name: string;
  branch?: string;
  company?: string;
  selling_price_list?: string;
  print_format?: string;
  custom_enable_discount?: number;
  custom_multiple_cashier_configuration?: number;
  custom_enable_kot_reprint?: number;
  applicable_for_users?: ApplicableUser[];
}

interface PaymentMode {
  mode_of_payment?: string;
  default?: number;
}

interface ApplicableUser {
  name?: string;
  user?: string;
  default?: number;
}

interface ProductionUnitRecord {
  name: string;
  production_unit_name?: string;
  branch?: string;
}

type ActiveTab = 'general' | 'printing' | 'cashiers';

export const PosProfilePage: React.FC = () => {
  const { activeBranchId, activeBranch, branches = [] } = useBranchContext();
  const [profiles, setProfiles] = useState<PosProfileRecord[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PosProfileRecord | null>(null);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('general');

  // Form state for selected profile editing
  const [profileForm, setProfileForm] = useState<Record<string, any>>({});
  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '', company: '', warehouse: '', branch: activeBranchId === 'all' ? '' : activeBranchId, custom_kot_naming_series: '',
    selling_price_list: '', print_format: '',
    applicable_for_users: [{ user: '', default: 0 }], payments: [{ mode_of_payment: '', default: 0 }]
  });
  const [options, setOptions] = useState<any>({ companies: [], warehouses: [], users: [], payments: [] });

  useEffect(() => {
    setAddForm(prev => ({
      ...prev,
      branch: activeBranchId === 'all' ? '' : activeBranchId
    }));
  }, [activeBranchId]);

  const openAddDrawer = () => {
    setAddForm({
      name: '',
      company: options.companies[0]?.name || '',
      warehouse: options.warehouses[0]?.name || '',
      branch: activeBranchId === 'all' ? '' : activeBranchId,
      custom_kot_naming_series: '',
      selling_price_list: '',
      print_format: '',
      applicable_for_users: [{ user: '', default: 0 }],
      payments: [{ mode_of_payment: '', default: 0 }]
    });
    setIsAddDrawerOpen(true);
  };

  const fetchOptions = async () => {
    try {
      const [companies, warehouses, users, payments] = await Promise.all([
        call<any>('frappe.client.get_list', { doctype: 'Company', fields: ['name'] }),
        call<any>('frappe.client.get_list', { doctype: 'Warehouse', fields: ['name'] }),
        call<any>('frappe.client.get_list', { doctype: 'User', filters: [['name', 'not in', ['Administrator', 'Guest']]], fields: ['name', 'full_name'] }),
        call<any>('frappe.client.get_list', { doctype: 'Mode of Payment', fields: ['name'] }),
      ]);
      setOptions({
        companies: companies.message || companies || [],
        warehouses: warehouses.message || warehouses || [],
        users: users.message || users || [],
        payments: payments.message || payments || []
      });
    } catch (e) {}
  };

  const handleAddProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      let defaultCurrency = '';
      let defaultCostCenter = '';
      if (addForm.company) {
        try {
          const compDoc = await call<any>('frappe.client.get', {
            doctype: 'Company',
            name: addForm.company
          });
          const comp = compDoc.message || compDoc;
          defaultCurrency = comp.default_currency || '';
          defaultCostCenter = comp.default_cost_center || '';
        } catch (e) {
          console.error("Failed to fetch company details", e);
        }

        if (!defaultCostCenter) {
          try {
            const ccList = await call<any>('frappe.client.get_list', {
              doctype: 'Cost Center',
              filters: [['company', '=', addForm.company], ['is_group', '=', 0]],
              fields: ['name'],
              limit: 1
            });
            const records = ccList.message || ccList || [];
            if (records.length > 0) {
              defaultCostCenter = records[0].name;
            }
          } catch (e) {
            console.error("Failed to fetch cost center list", e);
          }
        }
      }

      await call('frappe.client.insert', {
        doc: {
          doctype: 'POS Profile',
          name: addForm.name,
          pos_profile_name: addForm.name,
          company: addForm.company,
          warehouse: addForm.warehouse,
          branch: addForm.branch || undefined,
          selling_price_list: addForm.selling_price_list || 'Standard Selling',
          currency: defaultCurrency || undefined,
          cost_center: defaultCostCenter || undefined,
          print_format: addForm.print_format || undefined,
          custom_kot_naming_series: addForm.custom_kot_naming_series || undefined,
          applicable_for_users: addForm.applicable_for_users.filter(u => u.user).map(u => ({ user: u.user, default: u.default })),
          payments: addForm.payments.filter(p => p.mode_of_payment).map(p => ({ mode_of_payment: p.mode_of_payment, default: p.default }))
        }
      });
      showToast.success('POS Profile created successfully');
      setIsAddDrawerOpen(false);
      fetchProfiles();
    } catch (err: any) {
      showToast.error(err.message || 'Failed to create POS Profile');
    } finally {
      setSaving(false);
    }
  };


  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const list = await call<any>('frappe.client.get_list', {
        doctype: 'POS Profile',
        filters: activeBranchId !== 'all' ? [['branch', '=', activeBranchId]] : [],
        fields: ['name', 'branch', 'company', 'selling_price_list', 'print_format',
          'custom_enable_discount', 'custom_multiple_cashier_configuration',
          'custom_enable_kot_reprint'],
        limit: 50,
      });
      const records = list.message || list || [];
      setProfiles(records);
    } catch {
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchProfileDetails = async (profileName: string) => {
    try {
      const res = await call<any>('frappe.client.get', {
        doctype: 'POS Profile',
        name: profileName,
      });
      const profile = res.message || res;
      setSelectedProfile(profile);
      setProfileForm({
        company: profile.company || '',
        warehouse: profile.warehouse || '',
        selling_price_list: profile.selling_price_list || '',
        print_format: profile.print_format || '',
        custom_enable_discount: profile.custom_enable_discount || 0,
        custom_enable_kot_reprint: profile.custom_enable_kot_reprint || 0,
        custom_multiple_cashier_configuration: profile.custom_multiple_cashier_configuration || 0,
      });
    } catch {
      setSelectedProfile(null);
    }
  };

  useEffect(() => {
    fetchProfiles();
    fetchOptions();
  }, [activeBranchId]);

  const handleProfileSelect = (profile: PosProfileRecord) => {
    fetchProfileDetails(profile.name);
  };

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedProfile) return;
    setSaving(true);
    try {
      await call('frappe.client.set_value', {
        doctype: 'POS Profile',
        name: selectedProfile.name,
        fieldname: {
          company: profileForm.company,
          warehouse: profileForm.warehouse,
          selling_price_list: profileForm.selling_price_list,
          print_format: profileForm.print_format,
          custom_enable_discount: profileForm.custom_enable_discount,
          custom_enable_kot_reprint: profileForm.custom_enable_kot_reprint,
          custom_multiple_cashier_configuration: profileForm.custom_multiple_cashier_configuration,
        },
      });
      fetchProfiles();
    } catch (err) {
      console.error('Failed to save POS Profile', err);
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'Details', icon: <Settings2 className="w-4 h-4" /> },
    { id: 'printing', label: 'Print Settings', icon: <Printer className="w-4 h-4" /> },
    { id: 'cashiers', label: 'User & Permissions', icon: <Shield className="w-4 h-4" /> },
  ];

  if (!selectedProfile) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-end pb-3 border-b border-gray-200 -mx-6 px-6 -mt-6 pt-6">
          <Button
            onClick={openAddDrawer}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            <span>Add Profile</span>
          </Button>
        </div>

        {loading ? (
          <div className="py-16 flex items-center justify-center bg-white rounded-lg border border-gray-200">
            <Spinner className="w-8 h-8 text-primary" />
          </div>
        ) : profiles.length === 0 ? (
          <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-gray-200 shadow-sm bg-white">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Plus className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No POS Profiles Configured</h3>
            <p className="text-gray-500 mb-6 max-w-sm">
              Add POS Profiles to configure billing operations and hardware.
            </p>
            <Button
              onClick={openAddDrawer}
              className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
            >
              <Plus className="w-4 h-4" />
              <span>Add Profile</span>
            </Button>
          </Card>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
                <tr>
                  <th className="px-6 py-4">POS Profile</th>
                  <th className="px-6 py-4">Company</th>
                  <th className="px-6 py-4">Branch</th>
                  <th className="px-6 py-4">Price List</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {profiles.map((p) => (
                  <tr key={p.name} className="hover:bg-primary/10 transition-colors">
                    <td className="px-6 py-4 font-semibold text-gray-900">{p.name}</td>
                    <td className="px-6 py-4 text-gray-500">{p.company || '-'}</td>
                    <td className="px-6 py-4 text-gray-500">{p.branch || '-'}</td>
                    <td className="px-6 py-4 font-mono text-xs text-gray-500">{p.selling_price_list || '-'}</td>
                    <td className="px-6 py-4 text-right">
                      <Button variant="ghost" size="sm" onClick={(e: any) => { e.stopPropagation(); setIsReadOnly(true); handleProfileSelect(p); }} className="text-gray-500 hover:text-primary">
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={(e: any) => { e.stopPropagation(); setIsReadOnly(false); handleProfileSelect(p); }} className="text-gray-500 hover:text-primary">
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Add POS Profile Drawer */}
        <SideDrawer
          isOpen={isAddDrawerOpen}
          onClose={() => setIsAddDrawerOpen(false)}
          title="Add POS Profile"
        >
          <form onSubmit={handleAddProfile} className="space-y-6 text-sm">
            <div>
              <label className="block font-semibold text-gray-700 mb-1.5">Profile Name <span className="text-red-500">*</span></label>
              <Input required value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">Company <span className="text-red-500">*</span></label>
                <Select required value={addForm.company} onChange={e => setAddForm({...addForm, company: e.target.value})}>
                  <option value="">Select Company</option>
                  {options.companies.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">Branch</label>
                {activeBranchId === 'all' ? (
                  <Select value={addForm.branch} onChange={e => setAddForm({...addForm, branch: e.target.value})}>
                    <option value="">Select Branch</option>
                    {branches.map((b: any) => <option key={b.name} value={b.name}>{b.name}</option>)}
                  </Select>
                ) : (
                  <Input value={addForm.branch} disabled />
                )}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">Warehouse</label>
                <Select value={addForm.warehouse} onChange={e => setAddForm({...addForm, warehouse: e.target.value})}>
                  <option value="">Select Warehouse</option>
                  {options.warehouses.map((w: any) => <option key={w.name} value={w.name}>{w.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">KOT Naming Series</label>
                <Input value={addForm.custom_kot_naming_series} onChange={e => setAddForm({...addForm, custom_kot_naming_series: e.target.value})} placeholder="e.g. KOT-.YYYY.-" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">Price List</label>
                <Input value={addForm.selling_price_list} onChange={e => setAddForm({...addForm, selling_price_list: e.target.value})} placeholder="Standard Selling" />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">Print Format</label>
                <Input value={addForm.print_format} onChange={e => setAddForm({...addForm, print_format: e.target.value})} placeholder="Default" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-semibold text-gray-700">Applicable For Users</label>
                <Button type="button" size="sm" variant="ghost" className="text-primary h-6 px-2 text-xs" onClick={() => setAddForm({...addForm, applicable_for_users: [...addForm.applicable_for_users, {user:'', default:0}]})}>+ Add User</Button>
              </div>
              <div className="space-y-2">
                {addForm.applicable_for_users.map((row, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Select className="flex-1" value={row.user} onChange={e => {
                      const newRows = [...addForm.applicable_for_users];
                      newRows[idx].user = e.target.value;
                      setAddForm({...addForm, applicable_for_users: newRows});
                    }}>
                      <option value="">Select User</option>
                      {options.users.map((u: any) => <option key={u.name} value={u.name}>{u.full_name || u.name}</option>)}
                    </Select>
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input type="checkbox" checked={row.default === 1} onChange={e => {
                        const newRows = [...addForm.applicable_for_users];
                        newRows[idx].default = e.target.checked ? 1 : 0;
                        setAddForm({...addForm, applicable_for_users: newRows});
                      }} /> Default
                    </label>
                    <button type="button" className="text-gray-400 hover:text-red-500" onClick={() => {
                      const newRows = addForm.applicable_for_users.filter((_, i) => i !== idx);
                      setAddForm({...addForm, applicable_for_users: newRows});
                    }}><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="font-semibold text-gray-700">Mode of Payment</label>
                <Button type="button" size="sm" variant="ghost" className="text-primary h-6 px-2 text-xs" onClick={() => setAddForm({...addForm, payments: [...addForm.payments, {mode_of_payment:'', default:0}]})}>+ Add Payment</Button>
              </div>
              <div className="space-y-2">
                {addForm.payments.map((row, idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Select className="flex-1" value={row.mode_of_payment} onChange={e => {
                      const newRows = [...addForm.payments];
                      newRows[idx].mode_of_payment = e.target.value;
                      setAddForm({...addForm, payments: newRows});
                    }}>
                      <option value="">Select Payment Mode</option>
                      {options.payments.map((p: any) => <option key={p.name} value={p.name}>{p.name}</option>)}
                    </Select>
                    <label className="flex items-center gap-1 text-xs text-gray-600">
                      <input type="checkbox" checked={row.default === 1} onChange={e => {
                        const newRows = [...addForm.payments];
                        newRows[idx].default = e.target.checked ? 1 : 0;
                        setAddForm({...addForm, payments: newRows});
                      }} /> Default
                    </label>
                    <button type="button" className="text-gray-400 hover:text-red-500" onClick={() => {
                      const newRows = addForm.payments.filter((_, i) => i !== idx);
                      setAddForm({...addForm, payments: newRows});
                    }}><X className="w-4 h-4" /></button>
                  </div>
                ))}
              </div>
            </div>

            <div className="pt-6 flex justify-end gap-3 border-t border-gray-100">
              <Button type="button" variant="outline" onClick={() => setIsAddDrawerOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
                {saving ? <Spinner className="w-4 h-4 mr-1.5" /> : null} Save
              </Button>
            </div>
          </form>
        </SideDrawer>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header and Actions */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-200 -mx-6 px-6 -mt-6 pt-6">
        <Button
          variant="ghost"
          onClick={() => { setSelectedProfile(null); fetchProfiles(); }}
          className="text-gray-600 hover:text-gray-900 flex items-center space-x-1.5 -ml-2"
        >
          <ChevronRight className="w-4 h-4 rotate-180 mr-1" />
          <span>Back</span>
        </Button>
        <div className="flex items-center gap-3">
          {isReadOnly ? (
            <Button
              onClick={() => setIsReadOnly(false)}
              className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center justify-center space-x-1.5 shadow-xs px-4"
            >
              <Edit2 className="w-4 h-4" />
              <span>Edit</span>
            </Button>
          ) : (
            <Button
              onClick={handleSaveProfile}
              disabled={saving}
              className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center justify-center space-x-1.5 shadow-xs min-w-[100px]"
            >
              <Save className="w-4 h-4 mr-1.5" />
              <span>Save</span>
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.id ? 'bg-primary/10 text-primary font-semibold' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-700'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Detail Content */}
      <Card className="p-6 rounded-lg border-gray-200 bg-white shadow-sm">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">
          {selectedProfile.name}
        </h2>

        {activeTab === 'general' && (
          <div className="space-y-6 text-sm">
            <h4 className="font-bold text-gray-700 text-xs uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">General Settings</h4>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">Company</label>
                <Select disabled={isReadOnly} value={profileForm.company || ''} onChange={e => setProfileForm(p => ({ ...p, company: e.target.value }))}>
                  <option value="">Select Company</option>
                  {options.companies.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">Warehouse</label>
                <Select disabled={isReadOnly} value={profileForm.warehouse || ''} onChange={e => setProfileForm(p => ({ ...p, warehouse: e.target.value }))}>
                  <option value="">Select Warehouse</option>
                  {options.warehouses.map((w: any) => <option key={w.name} value={w.name}>{w.name}</option>)}
                </Select>
              </div>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">Price List</label>
                <Input
                  disabled={isReadOnly}
                  value={profileForm.selling_price_list || ''}
                  onChange={(e) => setProfileForm(p => ({ ...p, selling_price_list: e.target.value }))}
                  placeholder="Standard Selling"
                />
              </div>
            </div>

            <h4 className="font-bold text-gray-700 text-xs uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Features</h4>
            <div className="space-y-3">
              {[
                { key: 'custom_enable_discount', label: 'Enable Item Discounts' },
                { key: 'custom_enable_kot_reprint', label: 'Enable KOT Reprint' },
                { key: 'custom_multiple_cashier_configuration', label: 'Enable Multiple Cashier Configuration' },
              ].map(({ key, label }) => (
                <label key={key} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={isReadOnly}
                    checked={!!profileForm[key]}
                    onChange={(e) => setProfileForm(p => ({ ...p, [key]: e.target.checked ? 1 : 0 }))}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <span className="font-medium text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'printing' && (
          <div className="space-y-6 text-sm">
            <h4 className="font-bold text-gray-700 text-xs uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Print Settings</h4>
            <div>
              <label className="block font-semibold text-gray-700 mb-1.5">Print Format</label>
              <Input
                disabled={isReadOnly}
                value={profileForm.print_format || ''}
                onChange={(e) => setProfileForm(p => ({ ...p, print_format: e.target.value }))}
                placeholder="Default"
              />
            </div>
          </div>
        )}

        {activeTab === 'cashiers' && (
          <div className="space-y-6 text-sm">
            <h4 className="font-bold text-gray-700 text-xs uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">Cashier Table (Applicable For Users)</h4>
            {selectedProfile?.applicable_for_users && selectedProfile.applicable_for_users.length > 0 ? (
              <div className="rounded-lg border border-gray-200 overflow-hidden">
                <table className="w-full text-xs text-gray-600">
                  <thead className="bg-gray-50 border-b border-gray-100 font-semibold">
                    <tr>
                      <th className="px-4 py-2 text-left">User</th>
                      <th className="px-4 py-2 text-center">Default</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {selectedProfile.applicable_for_users.map((u, idx) => (
                      <tr key={idx}>
                        <td className="px-4 py-2 font-medium">{u.user}</td>
                        <td className="px-4 py-2 text-center">{u.default ? 'Yes' : 'No'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-gray-400">No users assigned. Configure in Frappe Desk for full access control.</p>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default PosProfilePage;
