import React, { useState, useEffect } from 'react';
import {
  Settings,
  Plus,
  Edit2,
  Trash2,
  ChevronDown,
  ChevronUp,
  Save,
  X,
  Loader
} from 'lucide-react';
import { Badge, Button, Input, Card, Spinner, showToast, DataTable } from '@ury/ui';
import { call } from '@ury/core';
import { SearchableSelect, Option } from '../../components/common/SearchableSelect';
import { dashboardService } from '../../services/dashboard';
import { useBranchContext } from '../../context/BranchContext';

interface SelfOrderingProfile {
  name: string;
  profile_name: string;
  restaurant: string;
  branch: string;
  pos_profile: string;
  default_customer?: string;
  enabled: number;
  enable_qr_table_ordering: number;
  enable_qr_pickup_ordering: number;
  enable_kiosk_ordering: number;
  allow_add_to_running_table: number;
  enable_product_detail_page: number;
  show_item_images: number;
  show_item_descriptions: number;
  enable_item_notes: number;
  enable_request_bill: number;
  enable_customer_payment: number;
  enable_payment_link: number;
  enable_pay_at_counter: number;
  session_idle_timeout_minutes: number;
}

interface FormData {
  profile_name: string;
  restaurant: string;
  branch: string;
  pos_profile: string;
  default_customer?: string;
  enabled: boolean;
  enable_qr_table_ordering: boolean;
  enable_qr_pickup_ordering: boolean;
  enable_kiosk_ordering: boolean;
  allow_add_to_running_table: boolean;
  enable_product_detail_page: boolean;
  show_item_images: boolean;
  show_item_descriptions: boolean;
  enable_item_notes: boolean;
  enable_request_bill: boolean;
  enable_customer_payment: boolean;
  enable_payment_link: boolean;
  enable_pay_at_counter: boolean;
  session_idle_timeout_minutes: number;
}

export const SelfOrderingProfilePage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [profiles, setProfiles] = useState<SelfOrderingProfile[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [showForm, setShowForm] = useState<boolean>(false);
  const [editingProfile, setEditingProfile] = useState<SelfOrderingProfile | null>(null);

  const [restaurants, setRestaurants] = useState<Option[]>([]);
  const [branches, setBranches] = useState<Option[]>([]);
  const [posProfiles, setPosProfiles] = useState<Option[]>([]);
  const [customers, setCustomers] = useState<Option[]>([]);

  const [openSections, setOpenSections] = useState<{ [key: string]: boolean }>({
    profileInfo: true,
    orderingModes: true,
    productDisplay: true,
    billingPayment: true,
    session: true,
  });

  const [formData, setFormData] = useState<FormData>({
    profile_name: '',
    restaurant: '',
    branch: '',
    pos_profile: '',
    default_customer: '',
    enabled: true,
    enable_qr_table_ordering: true,
    enable_qr_pickup_ordering: true,
    enable_kiosk_ordering: false,
    allow_add_to_running_table: true,
    enable_product_detail_page: true,
    show_item_images: true,
    show_item_descriptions: true,
    enable_item_notes: true,
    enable_request_bill: true,
    enable_customer_payment: false,
    enable_payment_link: false,
    enable_pay_at_counter: true,
    session_idle_timeout_minutes: 30,
  });

  const toggleSection = (sectionKey: string) => {
    setOpenSections((prev) => ({ ...prev, [sectionKey]: !prev[sectionKey] }));
  };

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const records = await dashboardService.getModuleRecords<SelfOrderingProfile>(
        'URY Self Ordering Profile',
        activeBranchId
      );
      setProfiles(records);
    } catch {
      showToast('Failed to load profiles', 'error');
      setProfiles([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchLinkOptions = async () => {
    try {
      const restaurantRecords = await dashboardService.getModuleRecords('URY Restaurant');
      setRestaurants(
        restaurantRecords.map((r: any) => ({
          value: r.name,
          label: r.name,
        }))
      );

      const branchRecords = await dashboardService.getModuleRecords('Branch');
      setBranches(
        branchRecords.map((b: any) => ({
          value: b.name,
          label: b.name,
        }))
      );

      const posRecords = await dashboardService.getModuleRecords('POS Profile');
      setPosProfiles(
        posRecords.map((p: any) => ({
          value: p.name,
          label: p.name,
        }))
      );

      const customerRecords = await dashboardService.getModuleRecords('Customer');
      setCustomers(
        customerRecords.map((c: any) => ({
          value: c.name,
          label: c.name,
        }))
      );
    } catch (err) {
      console.error('Failed to fetch link options:', err);
    }
  };

  useEffect(() => {
    fetchProfiles();
    fetchLinkOptions();
  }, [activeBranchId]);

  const resetForm = () => {
    setFormData({
      profile_name: '',
      restaurant: '',
      branch: '',
      pos_profile: '',
      default_customer: '',
      enabled: true,
      enable_qr_table_ordering: true,
      enable_qr_pickup_ordering: true,
      enable_kiosk_ordering: false,
      allow_add_to_running_table: true,
      enable_product_detail_page: true,
      show_item_images: true,
      show_item_descriptions: true,
      enable_item_notes: true,
      enable_request_bill: true,
      enable_customer_payment: false,
      enable_payment_link: false,
      enable_pay_at_counter: true,
      session_idle_timeout_minutes: 30,
    });
    setEditingProfile(null);
  };

  const handleOpenForm = (profile?: SelfOrderingProfile) => {
    if (profile) {
      setEditingProfile(profile);
      setFormData({
        profile_name: profile.profile_name,
        restaurant: profile.restaurant,
        branch: profile.branch,
        pos_profile: profile.pos_profile,
        default_customer: profile.default_customer || '',
        enabled: profile.enabled === 1,
        enable_qr_table_ordering: profile.enable_qr_table_ordering === 1,
        enable_qr_pickup_ordering: profile.enable_qr_pickup_ordering === 1,
        enable_kiosk_ordering: profile.enable_kiosk_ordering === 1,
        allow_add_to_running_table: profile.allow_add_to_running_table === 1,
        enable_product_detail_page: profile.enable_product_detail_page === 1,
        show_item_images: profile.show_item_images === 1,
        show_item_descriptions: profile.show_item_descriptions === 1,
        enable_item_notes: profile.enable_item_notes === 1,
        enable_request_bill: profile.enable_request_bill === 1,
        enable_customer_payment: profile.enable_customer_payment === 1,
        enable_payment_link: profile.enable_payment_link === 1,
        enable_pay_at_counter: profile.enable_pay_at_counter === 1,
        session_idle_timeout_minutes: profile.session_idle_timeout_minutes,
      });
    } else {
      resetForm();
    }
    setShowForm(true);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.profile_name || !formData.restaurant || !formData.pos_profile) {
      showToast('Please fill in all required fields', 'error');
      return;
    }

    setSaving(true);
    try {
      const docData = {
        doctype: 'URY Self Ordering Profile',
        profile_name: formData.profile_name,
        restaurant: formData.restaurant,
        branch: formData.branch,
        pos_profile: formData.pos_profile,
        default_customer: formData.default_customer || null,
        enabled: formData.enabled ? 1 : 0,
        enable_qr_table_ordering: formData.enable_qr_table_ordering ? 1 : 0,
        enable_qr_pickup_ordering: formData.enable_qr_pickup_ordering ? 1 : 0,
        enable_kiosk_ordering: formData.enable_kiosk_ordering ? 1 : 0,
        allow_add_to_running_table: formData.allow_add_to_running_table ? 1 : 0,
        enable_product_detail_page: formData.enable_product_detail_page ? 1 : 0,
        show_item_images: formData.show_item_images ? 1 : 0,
        show_item_descriptions: formData.show_item_descriptions ? 1 : 0,
        enable_item_notes: formData.enable_item_notes ? 1 : 0,
        enable_request_bill: formData.enable_request_bill ? 1 : 0,
        enable_customer_payment: formData.enable_customer_payment ? 1 : 0,
        enable_payment_link: formData.enable_payment_link ? 1 : 0,
        enable_pay_at_counter: formData.enable_pay_at_counter ? 1 : 0,
        session_idle_timeout_minutes: formData.session_idle_timeout_minutes,
      };

      if (editingProfile) {
        await call('frappe.client.set_value', {
          doctype: 'URY Self Ordering Profile',
          name: editingProfile.name,
          fieldname: docData,
        });
        showToast('Profile updated successfully', 'success');
      } else {
        await call('frappe.client.insert', docData);
        showToast('Profile created successfully', 'success');
      }

      await fetchProfiles();
      setShowForm(false);
      resetForm();
    } catch (err: any) {
      showToast(err?.message || 'Failed to save profile', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteProfile = async (profile: SelfOrderingProfile) => {
    if (!confirm('Are you sure you want to delete this profile?')) {
      return;
    }

    try {
      await call('frappe.client.delete', {
        doctype: 'URY Self Ordering Profile',
        name: profile.name,
      });
      showToast('Profile deleted successfully', 'success');
      await fetchProfiles();
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete profile', 'error');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-muted">
        <Spinner />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-tint text-primary flex items-center justify-center">
              <Settings className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Self Ordering Profiles</h1>
              <p className="text-sm text-text-tertiary">Manage QR & kiosk ordering configurations</p>
            </div>
          </div>
          <Button onClick={() => handleOpenForm()}>
            <Plus className="w-4 h-4 mr-2" />
            New Profile
          </Button>
        </div>

        {/* Form */}
        {showForm && (
          <Card className="rounded-xl">
            <div className="p-6 border-b border-border flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">
                {editingProfile ? 'Edit Profile' : 'Create New Profile'}
              </h2>
              <button
                onClick={() => {
                  setShowForm(false);
                  resetForm();
                }}
                className="p-1 hover:bg-muted rounded-md transition-colors"
              >
                <X className="w-5 h-5 text-text-tertiary" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="p-6 space-y-6">
              {/* Profile Info Section */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('profileInfo')}
                  className="w-full px-4 py-3 bg-muted flex items-center justify-between hover:bg-muted transition-colors"
                >
                  <h3 className="text-sm font-bold text-foreground">Profile Info</h3>
                  {openSections.profileInfo ? (
                    <ChevronUp className="w-4 h-4 text-text-tertiary" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-text-tertiary" />
                  )}
                </button>

                {openSections.profileInfo && (
                  <div className="p-4 space-y-4 bg-card">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                          Profile Name *
                        </label>
                        <Input
                          type="text"
                          value={formData.profile_name}
                          onChange={(e) =>
                            setFormData({ ...formData, profile_name: e.target.value })
                          }
                          placeholder="e.g., Main Branch QR"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                          Restaurant *
                        </label>
                        <SearchableSelect
                          id="restaurant"
                          value={formData.restaurant}
                          options={restaurants}
                          onChange={(_, value) =>
                            setFormData({ ...formData, restaurant: value })
                          }
                          strict
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                          Branch *
                        </label>
                        <SearchableSelect
                          id="branch"
                          value={formData.branch}
                          options={branches}
                          onChange={(_, value) =>
                            setFormData({ ...formData, branch: value })
                          }
                          strict
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                          POS Profile *
                        </label>
                        <SearchableSelect
                          id="pos_profile"
                          value={formData.pos_profile}
                          options={posProfiles}
                          onChange={(_, value) =>
                            setFormData({ ...formData, pos_profile: value })
                          }
                          strict
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                          Default Customer
                        </label>
                        <SearchableSelect
                          id="default_customer"
                          value={formData.default_customer || ''}
                          options={customers}
                          onChange={(_, value) =>
                            setFormData({ ...formData, default_customer: value })
                          }
                          strict
                        />
                      </div>

                      <div className="flex items-end">
                        <label className="flex items-center space-x-2 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={formData.enabled}
                            onChange={(e) =>
                              setFormData({ ...formData, enabled: e.target.checked })
                            }
                            className="w-4 h-4 rounded border-border"
                          />
                          <span className="text-sm font-medium text-muted-foreground">Enabled</span>
                        </label>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Ordering Modes Section */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('orderingModes')}
                  className="w-full px-4 py-3 bg-muted flex items-center justify-between hover:bg-muted transition-colors"
                >
                  <h3 className="text-sm font-bold text-foreground">Ordering Modes</h3>
                  {openSections.orderingModes ? (
                    <ChevronUp className="w-4 h-4 text-text-tertiary" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-text-tertiary" />
                  )}
                </button>

                {openSections.orderingModes && (
                  <div className="p-4 space-y-3 bg-card grid grid-cols-1 md:grid-cols-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enable_qr_table_ordering}
                        onChange={(e) =>
                          setFormData({ ...formData, enable_qr_table_ordering: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-muted-foreground">QR Table Ordering</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enable_qr_pickup_ordering}
                        onChange={(e) =>
                          setFormData({ ...formData, enable_qr_pickup_ordering: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-muted-foreground">QR Pickup Ordering</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enable_kiosk_ordering}
                        onChange={(e) =>
                          setFormData({ ...formData, enable_kiosk_ordering: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-muted-foreground">Kiosk Ordering</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.allow_add_to_running_table}
                        onChange={(e) =>
                          setFormData({ ...formData, allow_add_to_running_table: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-muted-foreground">Allow Add to Running Table</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Product Display Section */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('productDisplay')}
                  className="w-full px-4 py-3 bg-muted flex items-center justify-between hover:bg-muted transition-colors"
                >
                  <h3 className="text-sm font-bold text-foreground">Product Display</h3>
                  {openSections.productDisplay ? (
                    <ChevronUp className="w-4 h-4 text-text-tertiary" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-text-tertiary" />
                  )}
                </button>

                {openSections.productDisplay && (
                  <div className="p-4 space-y-3 bg-card grid grid-cols-1 md:grid-cols-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enable_product_detail_page}
                        onChange={(e) =>
                          setFormData({ ...formData, enable_product_detail_page: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-muted-foreground">Product Detail Page</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.show_item_images}
                        onChange={(e) =>
                          setFormData({ ...formData, show_item_images: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-muted-foreground">Show Item Images</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.show_item_descriptions}
                        onChange={(e) =>
                          setFormData({ ...formData, show_item_descriptions: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-muted-foreground">Show Item Descriptions</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enable_item_notes}
                        onChange={(e) =>
                          setFormData({ ...formData, enable_item_notes: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-muted-foreground">Enable Item Notes</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Billing & Payment Section */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('billingPayment')}
                  className="w-full px-4 py-3 bg-muted flex items-center justify-between hover:bg-muted transition-colors"
                >
                  <h3 className="text-sm font-bold text-foreground">Billing & Payment</h3>
                  {openSections.billingPayment ? (
                    <ChevronUp className="w-4 h-4 text-text-tertiary" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-text-tertiary" />
                  )}
                </button>

                {openSections.billingPayment && (
                  <div className="p-4 space-y-3 bg-card grid grid-cols-1 md:grid-cols-2">
                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enable_request_bill}
                        onChange={(e) =>
                          setFormData({ ...formData, enable_request_bill: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-muted-foreground">Enable Request Bill</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enable_customer_payment}
                        onChange={(e) =>
                          setFormData({ ...formData, enable_customer_payment: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-muted-foreground">Enable Customer Payment</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enable_payment_link}
                        onChange={(e) =>
                          setFormData({ ...formData, enable_payment_link: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-muted-foreground">Enable Payment Link</span>
                    </label>

                    <label className="flex items-center space-x-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={formData.enable_pay_at_counter}
                        onChange={(e) =>
                          setFormData({ ...formData, enable_pay_at_counter: e.target.checked })
                        }
                        className="w-4 h-4 rounded border-border"
                      />
                      <span className="text-sm font-medium text-muted-foreground">Enable Pay at Counter</span>
                    </label>
                  </div>
                )}
              </div>

              {/* Session Section */}
              <div className="border border-border rounded-lg overflow-hidden">
                <button
                  type="button"
                  onClick={() => toggleSection('session')}
                  className="w-full px-4 py-3 bg-muted flex items-center justify-between hover:bg-muted transition-colors"
                >
                  <h3 className="text-sm font-bold text-foreground">Session</h3>
                  {openSections.session ? (
                    <ChevronUp className="w-4 h-4 text-text-tertiary" />
                  ) : (
                    <ChevronDown className="w-4 h-4 text-text-tertiary" />
                  )}
                </button>

                {openSections.session && (
                  <div className="p-4 bg-card">
                    <div className="max-w-xs">
                      <label className="block text-sm font-medium text-muted-foreground mb-1.5">
                        Session Idle Timeout (Minutes)
                      </label>
                      <Input
                        type="number"
                        min="1"
                        value={formData.session_idle_timeout_minutes}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            session_idle_timeout_minutes: parseInt(e.target.value) || 0,
                          })
                        }
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Form Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader className="w-4 h-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      Save Profile
                    </>
                  )}
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    resetForm();
                  }}
                  className="bg-muted text-foreground hover:bg-muted-foreground"
                >
                  Cancel
                </Button>
              </div>
            </form>
          </Card>
        )}

        {/* Profiles List */}
        {!showForm && (
          <Card className="rounded-xl overflow-hidden">
            {profiles.length === 0 ? (
              <div className="p-12 text-center">
                <Settings className="w-12 h-12 text-text-tertiary mx-auto mb-3" />
                <p className="text-text-tertiary font-medium mb-4">No profiles configured yet</p>
                <Button onClick={() => handleOpenForm()}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create First Profile
                </Button>
              </div>
            ) : (
              <DataTable<SelfOrderingProfile>
                columns={[
                  { key: 'profile_name', header: 'Profile Name', render: (row) => <span className="font-medium">{row.profile_name}</span> },
                  { key: 'branch', header: 'Branch', render: (row) => row.branch },
                  { key: 'enabled', header: 'Status', render: (row) => (
                    <Badge size="tag" variant={row.enabled === 1 ? 'tagSuccess' : 'cancelled'}>
                      {row.enabled === 1 ? 'Enabled' : 'Disabled'}
                    </Badge>
                  )},
                  { key: 'actions', header: 'Actions', align: 'right', render: (row) => (
                    <div className="space-x-2 flex justify-end">
                      <button
                        onClick={() => handleOpenForm(row)}
                        className="p-1.5 text-primary hover:bg-primary-tint rounded-md transition-colors"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteProfile(row)}
                        className="p-1.5 text-destructive hover:bg-destructive-tint rounded-md transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )},
                ]}
                rows={profiles}
              />
            )}
          </Card>
        )}
      </div>
    </div>
  );
};

export default SelfOrderingProfilePage;
