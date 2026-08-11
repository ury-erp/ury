import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { SlidersHorizontal, Printer, Shield, Settings2, ChevronDown, Users } from 'lucide-react';
import { Card, Button, Badge, Input, Select, Spinner } from '@ury/ui';
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
  applicable_for_users?: ApplicableUser[];
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

type ActiveTab = 'general' | 'printing' | 'cashiers' | 'production';

export const PosProfilePage: React.FC = () => {
  const { activeBranchId, activeBranch } = useBranchContext();
  const [profiles, setProfiles] = useState<PosProfileRecord[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<PosProfileRecord | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<ActiveTab>('general');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Production units
  const [productionUnits, setProductionUnits] = useState<ProductionUnitRecord[]>([]);
  const [loadingUnits, setLoadingUnits] = useState(false);

  // Form state for selected profile editing
  const [profileForm, setProfileForm] = useState<Record<string, any>>({});

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
  }, [activeBranchId]);

  const handleProfileSelect = (profile: PosProfileRecord) => {
    fetchProfileDetails(profile.name);
    setIsDrawerOpen(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProfile) return;
    setSaving(true);
    try {
      await call('frappe.client.set_value', {
        doctype: 'POS Profile',
        name: selectedProfile.name,
        fieldname: {
          selling_price_list: profileForm.selling_price_list,
          print_format: profileForm.print_format,
          custom_enable_discount: profileForm.custom_enable_discount,
          custom_enable_kot_reprint: profileForm.custom_enable_kot_reprint,
          custom_multiple_cashier_configuration: profileForm.custom_multiple_cashier_configuration,
        },
      });
      fetchProfiles();
      setIsDrawerOpen(false);
    } catch (err) {
      console.error('Failed to save POS Profile', err);
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
      {/* Toolbar — Partition Style */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 pb-3 border-b border-gray-200">
        <div className="flex items-center gap-2 font-semibold text-gray-700">
          <SlidersHorizontal className="w-5 h-5 text-primary" />
          POS Profile Settings
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-lg w-fit">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              activeTab === tab.id ? 'bg-primary text-white shadow-xs' : 'text-gray-600 hover:bg-primary/10'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-16 flex items-center justify-center bg-white rounded-lg border border-gray-200">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : activeTab === 'production' ? (
        /* Production Unit Section */
        <div className="space-y-4">
          <div className="flex items-center justify-between pb-2 border-b border-gray-200">
            <h3 className="text-sm font-semibold text-gray-700">Production Units</h3>
          </div>
          {loadingUnits ? (
            <div className="py-8 flex items-center justify-center">
              <Spinner className="w-6 h-6 text-primary" />
            </div>
          ) : productionUnits.length === 0 ? (
            <Card className="p-8 text-center rounded-lg border border-gray-200 bg-white">
              <p className="text-gray-500 text-sm">No production units found for this branch.</p>
              <p className="text-xs text-gray-400 mt-1">Configure production units from Frappe Desk under URY Production Unit.</p>
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
                  {productionUnits.map((unit) => (
                    <tr key={unit.name} className="hover:bg-primary/10 transition-colors">
                      <td className="px-6 py-4 font-semibold text-gray-900">{unit.production_unit_name || unit.name}</td>
                      <td className="px-6 py-4 text-gray-500">{unit.branch || '-'}</td>
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
            <Card className="p-12 text-center rounded-lg border border-gray-200 bg-white">
              <p className="text-gray-400">No POS Profiles found for this branch.</p>
            </Card>
          ) : (
            profiles.map((p) => (
              <Card
                key={p.name}
                className="p-6 rounded-lg border border-gray-200 bg-white shadow-xs space-y-4 cursor-pointer hover:border-primary/30 transition-all"
                onClick={() => handleProfileSelect(p)}
              >
                <div className="flex items-center justify-between border-b border-gray-100 pb-4">
                  <div>
                    <h3 className="text-lg font-bold text-gray-900">{p.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">
                      Company: {p.company || 'URY Restaurant'} &bull; Branch: {p.branch || 'Main Branch'}
                      {p.selling_price_list && <> &bull; Price List: <span className="text-primary font-semibold">{p.selling_price_list}</span></>}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="success" size="sm">Active Register</Badge>
                    <Button variant="outline" size="sm" className="text-primary border-primary/20">
                      Edit
                    </Button>
                  </div>
                </div>

                {activeTab === 'general' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <span className="font-semibold text-gray-700 block">Item Discounts</span>
                      <span className="text-primary font-bold text-sm mt-1 block">
                        {p.custom_enable_discount !== 0 ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <span className="font-semibold text-gray-700 block">KOT Reprint Option</span>
                      <span className="text-primary font-bold text-sm mt-1 block">
                        {p.custom_enable_kot_reprint !== 0 ? 'Enabled' : 'Disabled'}
                      </span>
                    </div>
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <span className="font-semibold text-gray-700 block">Multi-Cashier Support</span>
                      <span className="text-primary font-bold text-sm mt-1 block">
                        {p.custom_multiple_cashier_configuration ? 'Configured' : 'Standard'}
                      </span>
                    </div>
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <span className="font-semibold text-gray-700 block">Price List</span>
                      <span className="text-primary font-bold text-sm mt-1 block">
                        {p.selling_price_list || 'Standard Selling'}
                      </span>
                    </div>
                    <div className="p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <span className="font-semibold text-gray-700 block">Print Format</span>
                      <span className="text-primary font-bold text-sm mt-1 block">
                        {p.print_format || 'Default'}
                      </span>
                    </div>
                  </div>
                )}

                {activeTab === 'printing' && (
                  <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900">QZ Tray Hardware Printing</span>
                      <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary">
                        Direct Thermal Ready
                      </Badge>
                    </div>
                    <p className="text-gray-500">Print Format: <span className="font-semibold text-gray-700">{p.print_format || 'Default'}</span></p>
                    <p className="text-gray-500">Bill printer and KOT kitchen printer configuration loaded from POS Profile doc events.</p>
                  </div>
                )}

                {activeTab === 'cashiers' && (
                  <div className="p-4 rounded-lg bg-gray-50 border border-gray-200 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-gray-900">Authorized Cashiers (Applicable For Users)</span>
                      <span className="text-primary font-semibold">Click to expand</span>
                    </div>
                    <p className="text-gray-500">Only users assigned in the POS Profile user table are allowed billing access.</p>
                  </div>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {/* Edit POS Profile Drawer */}
      <SideDrawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={selectedProfile ? `Edit: ${selectedProfile.name}` : 'Edit POS Profile'}
      >
        <form onSubmit={handleSaveProfile} className="space-y-6 text-sm">

          {/* General Settings */}
          <div>
            <h4 className="font-bold text-gray-700 text-xs uppercase tracking-wider mb-3 pb-2 border-b border-gray-100">General Settings</h4>
            <div className="space-y-4">
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">Price List</label>
                <Input
                  value={profileForm.selling_price_list || ''}
                  onChange={(e) => setProfileForm(p => ({ ...p, selling_price_list: e.target.value }))}
                  placeholder="Standard Selling"
                />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">Print Format</label>
                <Input
                  value={profileForm.print_format || ''}
                  onChange={(e) => setProfileForm(p => ({ ...p, print_format: e.target.value }))}
                  placeholder="Default"
                />
              </div>
            </div>
          </div>

          {/* Feature toggles */}
          <div>
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
                    checked={!!profileForm[key]}
                    onChange={(e) => setProfileForm(p => ({ ...p, [key]: e.target.checked ? 1 : 0 }))}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <span className="font-medium text-gray-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Cashier Table — Applicable For Users */}
          <div>
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

          <div className="pt-6 flex justify-end gap-3 border-t border-gray-100">
            <Button type="button" variant="outline" onClick={() => setIsDrawerOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
              {saving ? <Spinner className="w-4 h-4 mr-1.5" /> : null}
              Save Changes
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default PosProfilePage;
