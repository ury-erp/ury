import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Printer, Shield, Settings2, Plus, X, ArrowLeft, Edit2, Eye, Layers, Save } from 'lucide-react';
import { Card, Button, Badge, Input, Spinner, showToast } from '@ury/ui';
import { Switch } from '../../components/ui/switch';
import { call } from '@ury/core';
import SideDrawer from '../../components/layout/SideDrawer';
import { SearchableSelect } from '../../components/common/SearchableSelect';

interface PosProfileRecord {
  name: string;
  branch?: string;
  company?: string;
  warehouse?: string;
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
  payments?: PaymentMode[];
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

type DetailTab = 'details' | 'print_settings' | 'users_payments';

export const PosProfilePage: React.FC = () => {
  const { activeBranchId, branches = [] } = useBranchContext();
  const [profiles, setProfiles] = useState<PosProfileRecord[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PosProfileRecord | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [activeDetailTab, setActiveDetailTab] = useState<DetailTab>('details');

  // Form state for selected profile editing
  const [profileForm, setProfileForm] = useState<Record<string, any>>({});
  const [originalProfileForm, setOriginalProfileForm] = useState<Record<string, any>>({});
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
        fields: ['name', 'branch', 'company', 'warehouse', 'selling_price_list', 'print_format',
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
      const initialForm = {
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
      };
      setProfileForm(initialForm);
      setOriginalProfileForm(initialForm);
    } catch {
      setSelectedProfile(null);
    }
  };

  useEffect(() => {
    fetchProfiles();
    fetchOptions();
  }, [activeBranchId]);

  // View Mode: Open read-only detail view
  const handleProfileView = (profile: PosProfileRecord) => {
    setIsEditMode(false);
    setActiveDetailTab('details');
    fetchProfileDetails(profile.name);
  };

  // Direct Edit Mode: Open editable detail view
  const handleProfileEdit = (profile: PosProfileRecord) => {
    setIsEditMode(true);
    setActiveDetailTab('details');
    fetchProfileDetails(profile.name);
  };

  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedProfile) return;

    const getNormalizedProfileData = (form: Record<string, any>) => {
      return {
        company: form.company || '',
        warehouse: form.warehouse || '',
        selling_price_list: form.selling_price_list || '',
        print_format: form.print_format || '',
        custom_enable_discount: form.custom_enable_discount ? 1 : 0,
        custom_enable_kot_reprint: form.custom_enable_kot_reprint ? 1 : 0,
        custom_multiple_cashier_configuration: form.custom_multiple_cashier_configuration ? 1 : 0,
        custom_daily_pos_close: form.custom_daily_pos_close ? 1 : 0,
        custom_edit_order_type: form.custom_edit_order_type ? 1 : 0,
        paid_limit: form.paid_limit || '',
        table_attention_time: form.table_attention_time || '',
        custom_reset_order_number_daily: form.custom_reset_order_number_daily ? 1 : 0,
        applicable_for_users: (form.applicable_for_users || [])
          .filter((u: any) => u.user)
          .map((u: any) => ({ user: u.user, default: u.default ? 1 : 0 })),
        payments: (form.payments || [])
          .filter((p: any) => p.mode_of_payment)
          .map((p: any) => ({ mode_of_payment: p.mode_of_payment, default: p.default ? 1 : 0 })),
      };
    };

    const originalNorm = getNormalizedProfileData(originalProfileForm);
    const currentNorm = getNormalizedProfileData(profileForm);

    if (JSON.stringify(originalNorm) === JSON.stringify(currentNorm)) {
      showToast.warning('No changes in document');
      return;
    }

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

      showToast.success('POS Profile saved successfully');
      fetchProfiles();
      setIsEditMode(false); // Return to read-only View Mode after successful save
    } catch (err: any) {
      showToast.error(err.message || 'Failed to save POS Profile');
      // Remains in Edit Mode if save fails
    } finally {
      setSaving(false);
    }
  };

  // Render POS Profile Detail Page View
  if (selectedProfile) {
    return (
      <div className="space-y-6">
        {/* Navigation & Action Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedProfile(null)}
              className="text-foreground hover:text-primary flex items-center gap-1.5 shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>
            <div className="h-5 w-px bg-muted" />
            <div>
              <h2 className="text-lg font-bold text-foreground">POS Profile: {selectedProfile.name}</h2>
              <p className="text-xs text-muted-foreground">
                Company: {selectedProfile.company || 'URY Restaurant'} &bull; Branch: {selectedProfile.branch || 'Main Branch'}
              </p>
            </div>
          </div>
          {isEditMode ? (
            <Button
              type="button"
              onClick={() => handleSaveProfile()}
              disabled={saving}
              className="w-24 h-9 bg-primary hover:bg-primary/90 text-white font-semibold flex items-center justify-center shadow-xs shrink-0 rounded-md"
            >
              <Save className="w-4 h-4 mr-1.5 shrink-0" />
              <span>Save</span>
            </Button>
          ) : (
            <Button
              type="button"
              onClick={() => setIsEditMode(true)}
              className="w-24 h-9 bg-primary hover:bg-primary/90 text-white font-semibold flex items-center justify-center shadow-xs shrink-0 rounded-md"
            >
              <Edit2 className="w-4 h-4 mr-1.5 shrink-0" />
              <span>Edit</span>
            </Button>
          )}
        </div>

        {/* Detail Tabs */}
        <div className="flex items-center gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => setActiveDetailTab('details')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeDetailTab === 'details' ? 'bg-card text-primary shadow-xs font-bold' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            <span>Details</span>
          </button>
          <button
            onClick={() => setActiveDetailTab('print_settings')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeDetailTab === 'print_settings' ? 'bg-card text-primary shadow-xs font-bold' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Printer className="w-4 h-4" />
            <span>Print Settings</span>
          </button>
          <button
            onClick={() => setActiveDetailTab('users_payments')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeDetailTab === 'users_payments' ? 'bg-card text-primary shadow-xs font-bold' : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            <Shield className="w-4 h-4" />
            <span>Users & Payments</span>
          </button>
        </div>

        {/* Tab Contents */}
        <Card className="p-6 bg-card border border-border rounded-lg shadow-xs">
          <form onSubmit={handleSaveProfile} className="space-y-6 text-sm">
            {/* DETAILS TAB */}
            {activeDetailTab === 'details' && (
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-foreground text-xs uppercase tracking-wider mb-3 pb-2 border-b border-border">
                    General Settings
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    <div>
                      <label className="block font-semibold text-foreground mb-1.5">Company</label>
                      <SearchableSelect
                        id="profile_company"
                        disabled={!isEditMode}
                        value={profileForm.company || ''}
                        onChange={(_, val) => setProfileForm(p => ({ ...p, company: val }))}
                        options={[
                          { value: '', label: 'Select Company' },
                          ...options.companies.map((c: any) => ({ value: c.name, label: c.name }))
                        ]}
                        placeholder="Select Company"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-foreground mb-1.5">Warehouse</label>
                      <SearchableSelect
                        id="profile_warehouse"
                        disabled={!isEditMode}
                        value={profileForm.warehouse || ''}
                        onChange={(_, val) => setProfileForm(p => ({ ...p, warehouse: val }))}
                        options={[
                          { value: '', label: 'Select Warehouse' },
                          ...options.warehouses.map((w: any) => ({ value: w.name, label: w.name }))
                        ]}
                        placeholder="Select Warehouse"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-foreground mb-1.5">Price List</label>
                      <Input
                        disabled={!isEditMode}
                        value={profileForm.selling_price_list || ''}
                        onChange={(e) => setProfileForm(p => ({ ...p, selling_price_list: e.target.value }))}
                        placeholder="Standard Selling"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-foreground mb-1.5">Print Format</label>
                      <Input
                        disabled={!isEditMode}
                        value={profileForm.print_format || ''}
                        onChange={(e) => setProfileForm(p => ({ ...p, print_format: e.target.value }))}
                        placeholder="Default"
                      />
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-foreground text-xs uppercase tracking-wider mb-3 pb-2 border-b border-border">
                    Feature Toggles
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {[
                      { key: 'custom_enable_discount', label: 'Enable Item Discounts' },
                      { key: 'custom_enable_kot_reprint', label: 'Enable KOT Reprint' },
                      { key: 'custom_multiple_cashier_configuration', label: 'Enable Multiple Cashier Configuration' },
                      { key: 'custom_daily_pos_close', label: 'Require Daily POS Closing' },
                      { key: 'custom_edit_order_type', label: 'Enable Order Type Edit' },
                      { key: 'custom_reset_order_number_daily', label: 'Reset Order Number Daily' },
                    ].map(({ key, label }) => (
                      <div key={key} className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/50">
                        <Switch
                          id={key}
                          disabled={!isEditMode}
                          checked={!!profileForm[key]}
                          onCheckedChange={(checked) => setProfileForm(p => ({ ...p, [key]: checked ? 1 : 0 }))}
                        />
                        <label htmlFor={key} className="font-medium text-foreground cursor-pointer text-xs">{label}</label>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="font-bold text-foreground text-xs uppercase tracking-wider mb-3 pb-2 border-b border-border">
                    Numeric Settings
                  </h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block font-semibold text-foreground mb-1.5">Show Limited Paid Invoices (Number)</label>
                      <Input
                        type="number"
                        disabled={!isEditMode}
                        value={profileForm.paid_limit || ''}
                        onChange={(e) => setProfileForm(p => ({ ...p, paid_limit: e.target.value }))}
                        placeholder="e.g. 10"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-foreground mb-1.5">Table Attention Time (minutes)</label>
                      <Input
                        type="number"
                        disabled={!isEditMode}
                        value={profileForm.table_attention_time || ''}
                        onChange={(e) => setProfileForm(p => ({ ...p, table_attention_time: e.target.value }))}
                        placeholder="e.g. 15"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* PRINT SETTINGS TAB */}
            {activeDetailTab === 'print_settings' && (
              <div className="space-y-6">
                <div>
                  <h4 className="font-bold text-foreground text-xs uppercase tracking-wider mb-3 pb-2 border-b border-border">
                    Printer & QZ Configuration
                  </h4>
                  <div className="space-y-4">
                    <div>
                      <label className="block font-semibold text-foreground mb-1.5">Default Print Format</label>
                      <Input
                        disabled={!isEditMode}
                        value={profileForm.print_format || ''}
                        onChange={(e) => setProfileForm(p => ({ ...p, print_format: e.target.value }))}
                        placeholder="Default"
                      />
                    </div>

                    <div className="p-4 rounded-lg bg-muted border border-border text-xs space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-foreground flex items-center gap-1.5">
                          <Printer className="w-4 h-4 text-primary" />
                          QZ Tray Hardware Printing & KOT Routing
                        </span>
                        <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                          Direct Thermal Ready
                        </Badge>
                      </div>
                      <p className="text-muted-foreground">
                        Bill printer and KOT kitchen printer configuration are loaded automatically from POS Profile events and URY Printer Mappings.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* USERS & PAYMENTS TAB */}
            {activeDetailTab === 'users_payments' && (
              <div className="space-y-6">
                {/* Applicable For Users */}
                <div>
                  <h4 className="font-bold text-foreground text-xs uppercase tracking-wider mb-3 pb-2 border-b border-border">
                    Applicable For Users
                  </h4>
                  <div className="space-y-2 mb-3">
                    {(profileForm.applicable_for_users || []).map((row: any, idx: number) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <div className="flex-1">
                          <SearchableSelect
                            id={`user_${idx}`}
                            disabled={!isEditMode}
                            value={row.user || ''}
                            onChange={(_, val) => {
                              const newRows = [...(profileForm.applicable_for_users || [])];
                              newRows[idx].user = val;
                              setProfileForm({...profileForm, applicable_for_users: newRows});
                            }}
                            options={[
                              { value: '', label: 'Select User' },
                              ...options.users.map((u: any) => ({ value: u.name, label: u.full_name || u.name }))
                            ]}
                            placeholder="Select User"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Switch
                            disabled={!isEditMode}
                            checked={row.default === 1}
                            onCheckedChange={checked => {
                              const newRows = [...(profileForm.applicable_for_users || [])];
                              newRows[idx].default = checked ? 1 : 0;
                              setProfileForm({...profileForm, applicable_for_users: newRows});
                            }}
                          />
                          <span>Default</span>
                        </div>
                        {isEditMode && (
                          <button type="button" className="text-muted-foreground hover:text-red-500 p-1" onClick={() => {
                            const newRows = (profileForm.applicable_for_users || []).filter((_: any, i: number) => i !== idx);
                            setProfileForm({...profileForm, applicable_for_users: newRows});
                          }}>
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {isEditMode && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-primary border-primary/20 hover:bg-primary/5 text-xs flex items-center gap-1"
                      onClick={() => setProfileForm({...profileForm, applicable_for_users: [...(profileForm.applicable_for_users || []), {user:'', default:0}]})}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add User</span>
                    </Button>
                  )}
                </div>

                {/* Mode of Payment */}
                <div>
                  <h4 className="font-bold text-foreground text-xs uppercase tracking-wider mb-3 pb-2 border-b border-border">
                    Mode of Payment
                  </h4>
                  <div className="space-y-2 mb-3">
                    {(profileForm.payments || []).map((row: any, idx: number) => (
                      <div key={idx} className="flex gap-2 items-center">
                        <div className="flex-1">
                          <SearchableSelect
                            id={`payment_${idx}`}
                            disabled={!isEditMode}
                            value={row.mode_of_payment || ''}
                            onChange={(_, val) => {
                              const newRows = [...(profileForm.payments || [])];
                              newRows[idx].mode_of_payment = val;
                              setProfileForm({...profileForm, payments: newRows});
                            }}
                            options={[
                              { value: '', label: 'Select Payment Mode' },
                              ...options.payments.map((p: any) => ({ value: p.name, label: p.name }))
                            ]}
                            placeholder="Select Payment Mode"
                          />
                        </div>
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Switch
                            disabled={!isEditMode}
                            checked={row.default === 1}
                            onCheckedChange={checked => {
                              const newRows = [...(profileForm.payments || [])];
                              newRows[idx].default = checked ? 1 : 0;
                              setProfileForm({...profileForm, payments: newRows});
                            }}
                          />
                          <span>Default</span>
                        </div>
                        {isEditMode && (
                          <button type="button" className="text-muted-foreground hover:text-red-500 p-1" onClick={() => {
                            const newRows = (profileForm.payments || []).filter((_: any, i: number) => i !== idx);
                            setProfileForm({...profileForm, payments: newRows});
                          }}>
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                  {isEditMode && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="text-primary border-primary/20 hover:bg-primary/5 text-xs flex items-center gap-1"
                      onClick={() => setProfileForm({...profileForm, payments: [...(profileForm.payments || []), {mode_of_payment:'', default:0}]})}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Payment</span>
                    </Button>
                  )}
                </div>
              </div>
            )}
          </form>
        </Card>
      </div>
    );
  }

  // Render Main POS Profile List View
  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-end gap-4 pb-3 border-b border-border -mx-6 px-6 -mt-6 pt-6">
        <Button
          onClick={openAddDrawer}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Profile</span>
        </Button>
      </div>

      {/* Profiles List View */}
      {loading ? (
        <div className="py-16 flex items-center justify-center bg-card rounded-lg border border-border">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : profiles.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-border shadow-sm bg-card">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Layers className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No POS Profiles Configured</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Create a POS Profile to manage billing terminals and cashier permissions.
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
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm text-muted-foreground">
            <thead className="bg-muted border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-6 py-4">POS Profile</th>
                <th className="px-6 py-4">Warehouse</th>
                <th className="px-6 py-4">Price List</th>
                <th className="px-6 py-4">Activation Status</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {profiles.map((p) => (
                <tr
                  key={p.name}
                  className="hover:bg-muted/50 transition-colors"
                >
                  <td className="px-6 py-4 font-semibold text-foreground">{p.name}</td>
                  <td className="px-6 py-4 text-muted-foreground">{p.warehouse || p.company || '-'}</td>
                  <td className="px-6 py-4 text-muted-foreground">{p.selling_price_list || 'Standard Selling'}</td>
                  <td className="px-6 py-4">
                    <Badge variant={!p.disabled ? "success" : "outline"} size="sm">
                      {!p.disabled ? 'Active' : 'Inactive'}
                    </Badge>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleProfileView(p)}
                        className="text-muted-foreground hover:text-primary p-1.5 h-8 w-8"
                        title="View Profile"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleProfileEdit(p)}
                        className="text-muted-foreground hover:text-primary p-1.5 h-8 w-8"
                        title="Edit Profile"
                      >
                        <Edit2 className="w-4 h-4" />
                      </Button>
                    </div>
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
            <label className="block font-semibold text-foreground mb-1.5">Profile Name <span className="text-red-500">*</span></label>
            <Input required value={addForm.name} onChange={e => setAddForm({...addForm, name: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-foreground mb-1.5">Company <span className="text-red-500">*</span></label>
              <SearchableSelect
                id="add_profile_company"
                value={addForm.company}
                onChange={(_, val) => setAddForm({...addForm, company: val})}
                options={[
                  { value: '', label: 'Select Company' },
                  ...options.companies.map((c: any) => ({ value: c.name, label: c.name }))
                ]}
                placeholder="Select Company"
              />
            </div>
            <div>
              <label className="block font-semibold text-foreground mb-1.5">Branch</label>
              {activeBranchId === 'all' ? (
                <SearchableSelect
                  id="add_profile_branch"
                  value={addForm.branch}
                  onChange={(_, val) => setAddForm({...addForm, branch: val})}
                  options={[
                    { value: '', label: 'Select Branch' },
                    ...branches.map((b: any) => ({ value: b.name, label: b.name }))
                  ]}
                  placeholder="Select Branch"
                />
              ) : (
                <Input value={addForm.branch} disabled />
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-foreground mb-1.5">Warehouse</label>
              <SearchableSelect
                id="add_profile_warehouse"
                value={addForm.warehouse}
                onChange={(_, val) => setAddForm({...addForm, warehouse: val})}
                options={[
                  { value: '', label: 'Select Warehouse' },
                  ...options.warehouses.map((w: any) => ({ value: w.name, label: w.name }))
                ]}
                placeholder="Select Warehouse"
              />
            </div>
            <div>
              <label className="block font-semibold text-foreground mb-1.5">KOT Naming Series</label>
              <Input value={addForm.custom_kot_naming_series} onChange={e => setAddForm({...addForm, custom_kot_naming_series: e.target.value})} placeholder="e.g. KOT-.YYYY.-" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-foreground mb-1.5">Price List</label>
              <Input value={addForm.selling_price_list} onChange={e => setAddForm({...addForm, selling_price_list: e.target.value})} placeholder="Standard Selling" />
            </div>
            <div>
              <label className="block font-semibold text-foreground mb-1.5">Print Format</label>
              <Input value={addForm.print_format} onChange={e => setAddForm({...addForm, print_format: e.target.value})} placeholder="Default" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-foreground">Applicable For Users</label>
            </div>
            <div className="space-y-2 mb-3">
              {addForm.applicable_for_users.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <div className="flex-1">
                    <SearchableSelect
                      id={`add_user_${idx}`}
                      value={row.user}
                      onChange={(_, val) => {
                        const newRows = [...addForm.applicable_for_users];
                        newRows[idx].user = val;
                        setAddForm({...addForm, applicable_for_users: newRows});
                      }}
                      options={[
                        { value: '', label: 'Select User' },
                        ...options.users.map((u: any) => ({ value: u.name, label: u.full_name || u.name }))
                      ]}
                      placeholder="Select User"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      checked={row.default === 1}
                      onCheckedChange={checked => {
                        const newRows = [...addForm.applicable_for_users];
                        newRows[idx].default = checked ? 1 : 0;
                        setAddForm({...addForm, applicable_for_users: newRows});
                      }}
                    />
                    <span>Default</span>
                  </div>
                  <button type="button" className="text-muted-foreground hover:text-red-500 p-1" onClick={() => {
                    const newRows = addForm.applicable_for_users.filter((_, i) => i !== idx);
                    setAddForm({...addForm, applicable_for_users: newRows});
                  }}><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-primary border-primary/20 hover:bg-primary/5 text-xs flex items-center gap-1"
              onClick={() => setAddForm({...addForm, applicable_for_users: [...addForm.applicable_for_users, {user:'', default:0}]})}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add User</span>
            </Button>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="font-semibold text-foreground">Mode of Payment</label>
            </div>
            <div className="space-y-2 mb-3">
              {addForm.payments.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <div className="flex-1">
                    <SearchableSelect
                      id={`add_payment_${idx}`}
                      value={row.mode_of_payment}
                      onChange={(_, val) => {
                        const newRows = [...addForm.payments];
                        newRows[idx].mode_of_payment = val;
                        setAddForm({...addForm, payments: newRows});
                      }}
                      options={[
                        { value: '', label: 'Select Payment Mode' },
                        ...options.payments.map((p: any) => ({ value: p.name, label: p.name }))
                      ]}
                      placeholder="Select Payment Mode"
                    />
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Switch
                      checked={row.default === 1}
                      onCheckedChange={checked => {
                        const newRows = [...addForm.payments];
                        newRows[idx].default = checked ? 1 : 0;
                        setAddForm({...addForm, payments: newRows});
                      }}
                    />
                    <span>Default</span>
                  </div>
                  <button type="button" className="text-muted-foreground hover:text-red-500 p-1" onClick={() => {
                    const newRows = addForm.payments.filter((_, i) => i !== idx);
                    setAddForm({...addForm, payments: newRows});
                  }}><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-primary border-primary/20 hover:bg-primary/5 text-xs flex items-center gap-1"
              onClick={() => setAddForm({...addForm, payments: [...addForm.payments, {mode_of_payment:'', default:0}]})}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Payment</span>
            </Button>
          </div>

          <div className="pt-6 flex justify-end gap-3 border-t border-border">
            <Button type="button" variant="outline" onClick={() => setIsAddDrawerOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
              Save
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default PosProfilePage;
