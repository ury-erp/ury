import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useBranchContext } from '../../context/BranchContext';
import { SlidersHorizontal, Printer, Shield, Settings2, ChevronDown, Users, Plus, X, ClipboardList } from 'lucide-react';
import { Card, Button, Badge, Input, Select, Spinner, showToast } from '@ury/ui';
import { dashboardService } from '../../services/dashboard';
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
  custom_daily_pos_close?: number;
  custom_edit_order_type?: number;
  paid_limit?: number;
  table_attention_time?: number;
  custom_reset_order_number_daily?: number;
  disabled?: number;
  applicable_for_users?: ApplicableUser[];
  custom_checklist_items?: ChecklistItem[];
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

interface ChecklistItem {
  name?: string;
  item_label?: string;
  applies_to?: 'Opening' | 'Closing' | 'Both';
  is_mandatory?: number;
}

interface ProductionUnitRecord {
  name: string;
  production_unit_name?: string;
  branch?: string;
}

type ActiveTab = 'general' | 'printing' | 'cashiers' | 'production';

export const PosProfilePage: React.FC = () => {
  const { activeBranchId, activeBranch, branches = [] } = useBranchContext();
  const [profiles, setProfiles] = useState<PosProfileRecord[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PosProfileRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('general');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editModalTab, setEditModalTab] = useState<'general' | 'users' | 'checklist'>('general');

  // Production units
  const [productionUnits, setProductionUnits] = useState<ProductionUnitRecord[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

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
    } catch (e) {
      console.error('Failed to load options', e);
    }
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
          'custom_enable_kot_reprint', 'custom_daily_pos_close', 'custom_edit_order_type',
          'paid_limit', 'table_attention_time', 'custom_reset_order_number_daily', 'disabled'],
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
        custom_daily_pos_close: profile.custom_daily_pos_close || 0,
        custom_edit_order_type: profile.custom_edit_order_type || 0,
        paid_limit: profile.paid_limit || '',
        table_attention_time: profile.table_attention_time || '',
        custom_reset_order_number_daily: profile.custom_reset_order_number_daily || 0,
        applicable_for_users: profile.applicable_for_users || [],
        payments: profile.payments || [],
        custom_checklist_items: profile.custom_checklist_items || [],
      });
    } catch {
      setSelectedProfile(null);
    }
  };

  const fetchProductionUnits = async () => {
    setLoadingUnits(true);
    try {
      const records = await dashboardService.getModuleRecords<ProductionUnitRecord>('URY Production Unit', activeBranchId);
      setProductionUnits(records || []);
    } catch {
      setProductionUnits([]);
    } finally {
      setLoadingUnits(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
    fetchProductionUnits();
    fetchOptions();
  }, [activeBranchId]);

  const handleProfileSelect = (profile: PosProfileRecord) => {
    fetchProfileDetails(profile.name);
    setEditModalTab('general');
    setIsDrawerOpen(true);
  };

  // Close the wide Edit modal on Escape, mirroring SideDrawer's own behavior.
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsDrawerOpen(false);
    };
    if (isDrawerOpen) window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [isDrawerOpen]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
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
          custom_daily_pos_close: profileForm.custom_daily_pos_close,
          custom_edit_order_type: profileForm.custom_edit_order_type,
          paid_limit: profileForm.paid_limit,
          table_attention_time: profileForm.table_attention_time,
          custom_reset_order_number_daily: profileForm.custom_reset_order_number_daily,
        },
      });

      // Save applicable_for_users and payments separately as child tables
      if (profileForm.applicable_for_users && profileForm.applicable_for_users.length > 0) {
        await call('frappe.client.set_value', {
          doctype: 'POS Profile',
          name: selectedProfile.name,
          fieldname: {
            applicable_for_users: profileForm.applicable_for_users.filter((u: any) => u.user),
          },
        });
      }
      if (profileForm.payments && profileForm.payments.length > 0) {
        await call('frappe.client.set_value', {
          doctype: 'POS Profile',
          name: selectedProfile.name,
          fieldname: {
            payments: profileForm.payments.filter((p: any) => p.mode_of_payment),
          },
        });
      }

      await call('frappe.client.set_value', {
        doctype: 'POS Profile',
        name: selectedProfile.name,
        fieldname: {
          custom_checklist_items: (profileForm.custom_checklist_items || []).filter((c: any) => c.item_label),
        },
      });

      showToast.success('POS Profile saved');
      fetchProfiles();
      setIsDrawerOpen(false);
    } catch (err: any) {
      showToast.error(err.message || 'Failed to save POS Profile');
    } finally {
      setSaving(false);
    }
  };

  const tabs: { id: ActiveTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General Operations', icon: <Settings2 className="w-4 h-4" /> },
    { id: 'printing', label: 'Printer Mappings & QZ', icon: <Printer className="w-4 h-4" /> },
    { id: 'cashiers', label: 'Cashiers & Permissions', icon: <Shield className="w-4 h-4" /> },
    { id: 'production', label: 'Production Unit', icon: <ChevronDown className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      {/* Toolbar — Partition Style, no title */}
      <div className="flex flex-col md:flex-row items-center justify-end gap-4 pb-3 border-b border-border -mx-6 px-6 -mt-6 pt-6">
        <Button
          onClick={openAddDrawer}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Profile</span>
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.id ? 'bg-primary-tint text-primary font-semibold' : 'text-muted-foreground hover:bg-muted hover:text-muted-foreground'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 flex items-center justify-center bg-card rounded-lg border border-border">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : activeTab === 'production' ? (
        /* Production Unit Section */
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <h3 className="text-sm font-semibold text-muted-foreground">Production Units</h3>
          </div>
          {loadingUnits ? (
            <div className="py-8 flex items-center justify-center">
              <Spinner className="w-6 h-6 text-primary" />
            </div>
          ) : productionUnits.length === 0 ? (
            <Card className="p-8 text-center rounded-lg border border-border bg-card">
              <p className="text-text-tertiary text-sm">No production units found for this branch.</p>
              <p className="text-xs text-text-tertiary mt-1">Configure production units from Frappe Desk under URY Production Unit.</p>
            </Card>
          ) : (
            <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
              <table className="w-full text-left text-sm text-muted-foreground">
                <thead className="bg-muted border-b border-border text-xs text-text-tertiary font-semibold">
                  <tr>
                    <th className="px-6 py-4">Production Unit</th>
                    <th className="px-6 py-4">Branch</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-hair">
                  {productionUnits.map((unit) => (
                    <tr key={unit.name} className="hover:bg-muted transition-colors">
                      <td className="px-6 py-4 font-semibold text-foreground">{unit.production_unit_name || unit.name}</td>
                      <td className="px-6 py-4 text-text-tertiary">{unit.branch || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* Profiles list */
        <div className="space-y-4">
          {profiles.length === 0 ? (
            <Card className="p-12 text-center rounded-lg border border-border bg-card">
              <p className="text-text-tertiary">No POS Profiles found for this branch.</p>
            </Card>
          ) : (
            profiles.map((p) => (
              <Card
                key={p.name}
                className="p-6 rounded-lg border border-border bg-card shadow-xs space-y-4 cursor-pointer hover:border-primary-tint-border transition-all"
                onClick={() => handleProfileSelect(p)}
              >
                <div className="flex items-center justify-between border-b border-border pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-foreground">{p.name}</h3>
                    <p className="text-xs text-text-tertiary mt-0.5">
                      Company: {p.company || 'URY Restaurant'} &bull; Branch: {p.branch || 'Main Branch'}
                      {p.selling_price_list && <> &bull; Price List: <span className="text-primary font-semibold">{p.selling_price_list}</span></>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={!p.disabled ? "success" : "outline"} size="sm">
                      {!p.disabled ? 'Active' : 'Inactive'}
                    </Badge>
                    <Button variant="outline" size="sm" className="text-primary border-primary-tint-border" onClick={(e) => { e.stopPropagation(); handleProfileSelect(p); }}>
                      Edit
                    </Button>
                  </div>
                </div>

                {activeTab === 'general' && (
                  <div className="space-y-5 text-xs">
                    <div>
                      <h4 className="text-[11px] font-bold tracking-wide text-text-tertiary mb-2">Operations</h4>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        <div className="p-4 rounded-lg bg-primary-tint border border-primary-tint-border flex flex-col justify-between min-h-[72px]">
                          <span className="font-semibold text-muted-foreground block">Item Discounts</span>
                          <span className="text-primary font-bold text-sm mt-1 block">
                            {!!p.custom_enable_discount ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="p-4 rounded-lg bg-primary-tint border border-primary-tint-border flex flex-col justify-between min-h-[72px]">
                          <span className="font-semibold text-muted-foreground block">KOT Reprint Option</span>
                          <span className="text-primary font-bold text-sm mt-1 block">
                            {!!p.custom_enable_kot_reprint ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="p-4 rounded-lg bg-primary-tint border border-primary-tint-border flex flex-col justify-between min-h-[72px]">
                          <span className="font-semibold text-muted-foreground block">Multi-Cashier Support</span>
                          <span className="text-primary font-bold text-sm mt-1 block">
                            {p.custom_multiple_cashier_configuration ? 'Configured' : 'Standard'}
                          </span>
                        </div>
                        <div className="p-4 rounded-lg bg-primary-tint border border-primary-tint-border flex flex-col justify-between min-h-[72px]">
                          <span className="font-semibold text-muted-foreground block">Order Type Edit</span>
                          <span className="text-primary font-bold text-sm mt-1 block">
                            {!!p.custom_edit_order_type ? 'Allowed' : 'Locked'}
                          </span>
                        </div>
                        <div className="p-4 rounded-lg bg-primary-tint border border-primary-tint-border flex flex-col justify-between min-h-[72px]">
                          <span className="font-semibold text-muted-foreground block">Reset Order Number Daily</span>
                          <span className="text-primary font-bold text-sm mt-1 block">
                            {!!p.custom_reset_order_number_daily ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <div className="p-4 rounded-lg bg-primary-tint border border-primary-tint-border flex flex-col justify-between min-h-[72px]">
                          <span className="font-semibold text-muted-foreground block">Daily POS Closing</span>
                          <span className="text-primary font-bold text-sm mt-1 block">
                            {!!p.custom_daily_pos_close ? 'Required' : 'Not Required'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-[11px] font-bold tracking-wide text-text-tertiary mb-2">Menu &amp; Pricing</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 rounded-lg bg-muted border border-border flex flex-col justify-between min-h-[72px]">
                          <span className="font-semibold text-muted-foreground block">Price List</span>
                          <span className="text-foreground font-bold text-sm mt-1 block">
                            {p.selling_price_list || 'Standard Selling'}
                          </span>
                        </div>
                        <div className="p-4 rounded-lg bg-muted border border-border flex flex-col justify-between min-h-[72px]">
                          <span className="font-semibold text-muted-foreground block">Print Format</span>
                          <span className="text-foreground font-bold text-sm mt-1 block">
                            {p.print_format || 'Default'}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-[11px] font-bold tracking-wide text-text-tertiary mb-2">Limits &amp; Timing</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-4 rounded-lg bg-muted border border-border flex flex-col justify-between min-h-[72px]">
                          <span className="font-semibold text-muted-foreground block">Paid Limit</span>
                          <span className="text-foreground font-bold text-sm mt-1 block">
                            {p.paid_limit ? p.paid_limit.toLocaleString() : 'No Limit'}
                          </span>
                        </div>
                        <div className="p-4 rounded-lg bg-muted border border-border flex flex-col justify-between min-h-[72px]">
                          <span className="font-semibold text-muted-foreground block">Table Attention Time</span>
                          <span className="text-foreground font-bold text-sm mt-1 block">
                            {p.table_attention_time ? `${p.table_attention_time} min` : 'Not Set'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'printing' && (
                  <div className="p-4 rounded-lg bg-muted border border-border text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">QZ Tray Hardware Printing</span>
                      <Badge variant="outline" className="border-primary-tint-border bg-primary-tint text-primary">
                        Direct Thermal Ready
                      </Badge>
                    </div>
                    <p className="text-text-tertiary">Print Format: <span className="font-semibold text-muted-foreground">{p.print_format || 'Default'}</span></p>
                    <p className="text-text-tertiary">Bill printer and KOT kitchen printer configuration loaded from POS Profile doc events.</p>
                  </div>
                )}

                {activeTab === 'cashiers' && (
                  <div className="p-4 rounded-lg bg-muted border border-border text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-foreground">Authorized Cashiers (Applicable For Users)</span>
                      <span className="text-primary font-semibold">Click to expand</span>
                    </div>
                    <p className="text-text-tertiary">Only users assigned in the POS Profile user table are allowed billing access.</p>
                  </div>
                )}
              </Card>
            ))
          )}
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
            <label className="block font-semibold text-muted-foreground mb-1.5">Profile Name <span className="text-destructive">*</span></label>
            <Input required value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-muted-foreground mb-1.5">Company <span className="text-destructive">*</span></label>
              <Select required value={addForm.company} onChange={e => setAddForm({...addForm, company: e.target.value})}>
                <option value="">Select Company</option>
                {options.companies.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="block font-semibold text-muted-foreground mb-1.5">Branch</label>
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
              <label className="block font-semibold text-muted-foreground mb-1.5">Warehouse</label>
              <Select value={addForm.warehouse} onChange={e => setAddForm({...addForm, warehouse: e.target.value})}>
                <option value="">Select Warehouse</option>
                {options.warehouses.map((w: any) => <option key={w.name} value={w.name}>{w.name}</option>)}
              </Select>
            </div>
            <div>
              <label className="block font-semibold text-muted-foreground mb-1.5">KOT Naming Series</label>
              <Input value={addForm.custom_kot_naming_series} onChange={e => setAddForm({...addForm, custom_kot_naming_series: e.target.value})} placeholder="e.g. KOT-.YYYY.-" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-muted-foreground mb-1.5">Price List</label>
              <Input value={addForm.selling_price_list} onChange={e => setAddForm({...addForm, selling_price_list: e.target.value})} placeholder="Standard Selling" />
            </div>
            <div>
              <label className="block font-semibold text-muted-foreground mb-1.5">Print Format</label>
              <Input value={addForm.print_format} onChange={e => setAddForm({...addForm, print_format: e.target.value})} placeholder="Default" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-muted-foreground">Applicable For Users</label>
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
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input type="checkbox" checked={row.default === 1} onChange={e => {
                      const newRows = [...addForm.applicable_for_users];
                      newRows[idx].default = e.target.checked ? 1 : 0;
                      setAddForm({...addForm, applicable_for_users: newRows});
                    }} /> Default
                  </label>
                  <Button type="button" variant="ghost" size="xs" className="text-text-tertiary hover:text-destructive p-0 h-8 w-8" onClick={() => {
                    const newRows = addForm.applicable_for_users.filter((_, i) => i !== idx);
                    setAddForm({...addForm, applicable_for_users: newRows});
                  }}><X className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-muted-foreground">Mode of Payment</label>
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
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input type="checkbox" checked={row.default === 1} onChange={e => {
                      const newRows = [...addForm.payments];
                      newRows[idx].default = e.target.checked ? 1 : 0;
                      setAddForm({...addForm, payments: newRows});
                    }} /> Default
                  </label>
                  <Button type="button" variant="ghost" size="xs" className="text-text-tertiary hover:text-destructive p-0 h-8 w-8" onClick={() => {
                    const newRows = addForm.payments.filter((_, i) => i !== idx);
                    setAddForm({...addForm, payments: newRows});
                  }}><X className="w-4 h-4" /></Button>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddDrawerOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
              {saving ? <Spinner className="w-4 h-4 mr-1.5" /> : null} Save
            </Button>
          </div>
        </form>
      </SideDrawer>

      {/* Edit POS Profile Modal — wide, tabbed layout to make better use of horizontal space */}
      {isDrawerOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40 transition-opacity backdrop-blur-sm"
            onClick={() => setIsDrawerOpen(false)}
          />
          <div className="relative h-fit max-h-[90vh] w-full max-w-4xl bg-card rounded-lg shadow-2xl z-[101] flex flex-col overflow-hidden">
            <div className="flex items-center justify-between p-6 border-b border-border bg-muted">
              <h2 className="text-xl font-semibold text-foreground">
                {selectedProfile ? `Edit: ${selectedProfile.name}` : 'Edit POS Profile'}
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setIsDrawerOpen(false)}
                className="p-2 h-auto rounded-full border-none hover:bg-muted bg-transparent text-text-tertiary hover:text-foreground"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>

            {/* Internal tabs — mirrors the read-only view's tab pattern */}
            <div className="px-6 pt-4 border-b border-border bg-muted">
              <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
                {[
                  { id: 'general' as const, label: 'General', icon: <Settings2 className="w-4 h-4" /> },
                  { id: 'users' as const, label: 'Users & Payments', icon: <Users className="w-4 h-4" /> },
                  { id: 'checklist' as const, label: 'Checklist', icon: <ClipboardList className="w-4 h-4" /> },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setEditModalTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                      editModalTab === tab.id ? 'bg-card text-primary shadow-xs' : 'text-muted-foreground hover:bg-muted hover:text-muted-foreground'
                    }`}
                  >
                    {tab.icon}
                    <span>{tab.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <form onSubmit={handleSaveProfile} className="flex-1 flex flex-col overflow-hidden text-sm">
              <div className="flex-1 p-6 overflow-y-auto space-y-6">

                {editModalTab === 'general' && (
                  <>
                    {/* General Settings */}
                    <div>
                      <h4 className="font-bold text-muted-foreground text-xs tracking-wider mb-3 pb-2 border-b border-border">General Settings</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                          <label className="block font-semibold text-muted-foreground mb-1.5">Company</label>
                          <Select value={profileForm.company || ''} onChange={e => setProfileForm(p => ({ ...p, company: e.target.value }))}>
                            <option value="">Select Company</option>
                            {options.companies.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
                          </Select>
                        </div>
                        <div>
                          <label className="block font-semibold text-muted-foreground mb-1.5">Warehouse</label>
                          <Select value={profileForm.warehouse || ''} onChange={e => setProfileForm(p => ({ ...p, warehouse: e.target.value }))}>
                            <option value="">Select Warehouse</option>
                            {options.warehouses.map((w: any) => <option key={w.name} value={w.name}>{w.name}</option>)}
                          </Select>
                        </div>
                        <div>
                          <label className="block font-semibold text-muted-foreground mb-1.5">Price List</label>
                          <Input
                            value={profileForm.selling_price_list || ''}
                            onChange={(e) => setProfileForm(p => ({ ...p, selling_price_list: e.target.value }))}
                            placeholder="Standard Selling"
                          />
                        </div>
                        <div>
                          <label className="block font-semibold text-muted-foreground mb-1.5">Print Format</label>
                          <Input
                            value={profileForm.print_format || ''}
                            onChange={(e) => setProfileForm(p => ({ ...p, print_format: e.target.value }))}
                            placeholder="Default"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                      {/* Feature toggles */}
                      <div>
                        <h4 className="font-bold text-muted-foreground text-xs tracking-wider mb-3 pb-2 border-b border-border">Features</h4>
                        <div className="space-y-3">
                          {[
                            { key: 'custom_enable_discount', label: 'Enable Item Discounts', type: 'checkbox' },
                            { key: 'custom_enable_kot_reprint', label: 'Enable KOT Reprint', type: 'checkbox' },
                            { key: 'custom_multiple_cashier_configuration', label: 'Enable Multiple Cashier Configuration', type: 'checkbox' },
                            { key: 'custom_daily_pos_close', label: 'Require Daily POS Closing', type: 'checkbox' },
                            { key: 'custom_edit_order_type', label: 'Enable Order Type Edit', type: 'checkbox' },
                            { key: 'custom_reset_order_number_daily', label: 'Reset Order Number Daily', type: 'checkbox' },
                          ].map(({ key, label }) => (
                            <label key={key} className="flex items-center gap-2 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!profileForm[key]}
                                onChange={(e) => setProfileForm(p => ({ ...p, [key]: e.target.checked ? 1 : 0 }))}
                                className="w-4 h-4 text-primary border-border rounded focus:ring-primary"
                              />
                              <span className="font-medium text-muted-foreground">{label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Numeric Settings */}
                      <div>
                        <h4 className="font-bold text-muted-foreground text-xs tracking-wider mb-3 pb-2 border-b border-border">Numeric Settings</h4>
                        <div className="space-y-4">
                          <div>
                            <label className="block font-semibold text-muted-foreground mb-1.5">Show Limited Paid Invoices (Number)</label>
                            <Input
                              type="number"
                              value={profileForm.paid_limit || ''}
                              onChange={(e) => setProfileForm(p => ({ ...p, paid_limit: e.target.value }))}
                              placeholder="e.g. 10"
                            />
                          </div>
                          <div>
                            <label className="block font-semibold text-muted-foreground mb-1.5">Table Attention Time (minutes)</label>
                            <Input
                              type="number"
                              value={profileForm.table_attention_time || ''}
                              onChange={(e) => setProfileForm(p => ({ ...p, table_attention_time: e.target.value }))}
                              placeholder="e.g. 15"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {editModalTab === 'users' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Applicable For Users - Editable */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="font-semibold text-muted-foreground">Applicable For Users</label>
                        <Button type="button" size="sm" variant="ghost" className="text-primary h-6 px-2 text-xs" onClick={() => setProfileForm({...profileForm, applicable_for_users: [...(profileForm.applicable_for_users || []), {user:'', default:0}]})}>+ Add User</Button>
                      </div>
                      <div className="space-y-1.5">
                        {(profileForm.applicable_for_users || []).map((row: any, idx: number) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <Select className="flex-1" value={row.user || ''} onChange={e => {
                              const newRows = [...(profileForm.applicable_for_users || [])];
                              newRows[idx].user = e.target.value;
                              setProfileForm({...profileForm, applicable_for_users: newRows});
                            }}>
                              <option value="">Select User</option>
                              {options.users.map((u: any) => <option key={u.name} value={u.name}>{u.full_name || u.name}</option>)}
                            </Select>
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <input type="checkbox" checked={row.default === 1} onChange={e => {
                                const newRows = [...(profileForm.applicable_for_users || [])];
                                newRows[idx].default = e.target.checked ? 1 : 0;
                                setProfileForm({...profileForm, applicable_for_users: newRows});
                              }} /> Default
                            </label>
                            <button type="button" className="text-text-tertiary hover:text-destructive" onClick={() => {
                              const newRows = (profileForm.applicable_for_users || []).filter((_: any, i: number) => i !== idx);
                              setProfileForm({...profileForm, applicable_for_users: newRows});
                            }}><X className="w-4 h-4" /></button>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Mode of Payment - Editable */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="font-semibold text-muted-foreground">Mode of Payment</label>
                        <Button type="button" size="sm" variant="ghost" className="text-primary h-6 px-2 text-xs" onClick={() => setProfileForm({...profileForm, payments: [...(profileForm.payments || []), {mode_of_payment:'', default:0}]})}>+ Add Payment</Button>
                      </div>
                      <div className="space-y-1.5">
                        {(profileForm.payments || []).map((row: any, idx: number) => (
                          <div key={idx} className="flex gap-2 items-center">
                            <Select className="flex-1" value={row.mode_of_payment || ''} onChange={e => {
                              const newRows = [...(profileForm.payments || [])];
                              newRows[idx].mode_of_payment = e.target.value;
                              setProfileForm({...profileForm, payments: newRows});
                            }}>
                              <option value="">Select Payment Mode</option>
                              {options.payments.map((p: any) => <option key={p.name} value={p.name}>{p.name}</option>)}
                            </Select>
                            <label className="flex items-center gap-1 text-xs text-muted-foreground">
                              <input type="checkbox" checked={row.default === 1} onChange={e => {
                                const newRows = [...(profileForm.payments || [])];
                                newRows[idx].default = e.target.checked ? 1 : 0;
                                setProfileForm({...profileForm, payments: newRows});
                              }} /> Default
                            </label>
                            <button type="button" className="text-text-tertiary hover:text-destructive" onClick={() => {
                              const newRows = (profileForm.payments || []).filter((_: any, i: number) => i !== idx);
                              setProfileForm({...profileForm, payments: newRows});
                            }}><X className="w-4 h-4" /></button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {editModalTab === 'checklist' && (
                  /* Checklist Items - Editable */
                  <div>
                    <h4 className="font-bold text-muted-foreground text-xs tracking-wider mb-3 pb-2 border-b border-border">Opening/Closing Checklist Items</h4>
                    <div className="flex items-center justify-end mb-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-primary h-6 px-2 text-xs"
                        onClick={() => setProfileForm({
                          ...profileForm,
                          custom_checklist_items: [...(profileForm.custom_checklist_items || []), { item_label: '', applies_to: 'Both', is_mandatory: 1 }],
                        })}
                      >
                        + Add Item
                      </Button>
                    </div>
                    <div className="space-y-2">
                      {(profileForm.custom_checklist_items || []).length === 0 && (
                        <p className="text-xs text-text-tertiary">No checklist items configured. Add items required for POS opening/closing.</p>
                      )}
                      {(profileForm.custom_checklist_items || []).map((row: any, idx: number) => (
                        <div key={idx} className="flex gap-3 items-center h-10">
                          <Input
                            className="flex-1"
                            value={row.item_label || ''}
                            placeholder="Item label"
                            onChange={e => {
                              const newRows = [...(profileForm.custom_checklist_items || [])];
                              newRows[idx] = { ...newRows[idx], item_label: e.target.value };
                              setProfileForm({ ...profileForm, custom_checklist_items: newRows });
                            }}
                          />
                          <div className="w-32 flex-shrink-0">
                            <Select
                              value={row.applies_to || 'Both'}
                              onChange={e => {
                                const newRows = [...(profileForm.custom_checklist_items || [])];
                                newRows[idx] = { ...newRows[idx], applies_to: e.target.value };
                                setProfileForm({ ...profileForm, custom_checklist_items: newRows });
                              }}
                            >
                              <option value="Opening">Opening</option>
                              <option value="Closing">Closing</option>
                              <option value="Both">Both</option>
                            </Select>
                          </div>
                          <label className="flex items-center gap-1 text-xs text-muted-foreground whitespace-nowrap flex-shrink-0">
                            <input
                              type="checkbox"
                              checked={row.is_mandatory === 1 || row.is_mandatory === undefined}
                              onChange={e => {
                                const newRows = [...(profileForm.custom_checklist_items || [])];
                                newRows[idx] = { ...newRows[idx], is_mandatory: e.target.checked ? 1 : 0 };
                                setProfileForm({ ...profileForm, custom_checklist_items: newRows });
                              }}
                            /> Mandatory
                          </label>
                          <button
                            type="button"
                            className="text-text-tertiary hover:text-destructive flex-shrink-0"
                            onClick={() => {
                              const newRows = (profileForm.custom_checklist_items || []).filter((_: any, i: number) => i !== idx);
                              setProfileForm({ ...profileForm, custom_checklist_items: newRows });
                            }}
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="p-6 pt-4 flex justify-end gap-3 border-t border-border bg-card">
                <Button type="button" variant="outline" onClick={() => setIsDrawerOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
                  {saving ? <Spinner className="w-4 h-4 mr-1.5" /> : null}
                  Save Changes
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default PosProfilePage;
