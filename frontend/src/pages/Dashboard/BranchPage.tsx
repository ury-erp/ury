import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Save, Plus, X, Eye, Edit2, ArrowLeft, Building2, UtensilsCrossed, Map } from 'lucide-react';
import { Card, Button, Input, Spinner, showToast, DataTable, type DataTableColumn } from '@ury/ui';
import { Switch } from '../../components/ui/switch';
import SideDrawer from '../../components/layout/SideDrawer';
import { call, getLoggedUser } from '@ury/core';
import { dashboardService } from '../../services/dashboard';
import { SearchableSelect } from '../../components/common/SearchableSelect';

interface BranchData {
  name: string;
  branch?: string;
  branch_name?: string;
  invoice_series_prefix?: string;
  aggregator_series_prefix?: string;
  tax_id?: string;
  address?: string;
  custom_no_taxes?: number;
  default_menu?: string;
}

interface RestaurantData {
  name: string;
  company?: string;
  invoice_series_prefix?: string;
  aggregator_series_prefix?: string;
  address?: string;
  active_menu?: string;
  default_room?: string;
  room_wise_menu?: number;
  order_type_wise_menu?: number;
  menu_for_room?: any[];
  order_type_menu?: any[];
  default_tax_template?: string;
  tax_id?: string;
}

export const BranchPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [branchList, setBranchList] = useState<BranchData[]>([]);
  const [selectedBranch, setSelectedBranch] = useState<BranchData | null>(null);
  const [isEditMode, setIsEditMode] = useState<boolean>(false);

  const [branchData, setBranchData] = useState<BranchData | null>(null);
  const [restaurantData, setRestaurantData] = useState<RestaurantData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Branch form fields
  const [branchForm, setBranchForm] = useState<Record<string, any>>({});
  // Restaurant form fields
  const [restaurantForm, setRestaurantForm] = useState<Record<string, any>>({});

  // Linked data
  const [menus, setMenus] = useState<{ name: string; menu_name?: string }[]>([]);
  const [rooms, setRooms] = useState<{ name: string; room_name?: string }[]>([]);

  const [isAddDrawerOpen, setIsAddDrawerOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    branchName: '', company: '', invoicePrefix: 'INV-', aggregatorPrefix: 'AGG-', taxId: '', address: ''
  });
  const [companies, setCompanies] = useState<any[]>([]);

  const fetchCompanies = async () => {
    try {
      const res = await call<any>('frappe.client.get_list', { doctype: 'Company', fields: ['name'] });
      setCompanies(res.message || res || []);
    } catch (e) {
      console.error('Failed to load companies', e);
    }
  };

  const fetchBranchList = async () => {
    setLoading(true);
    let list: BranchData[] = [];
    try {
      const res = await call<any>('frappe.client.get_list', {
        doctype: 'Branch',
        fields: ['name', 'branch', 'address', 'custom_no_taxes'],
        limit_page_length: 100
      });
      list = Array.isArray(res) ? res : (res?.message || []);
    } catch (e) {
      console.error('Failed to load branch list', e);
      try {
        const fallbackRes = await call<any>('ury.ury.api.minimal.business_setup.get_branches');
        const fallbackList = Array.isArray(fallbackRes) ? fallbackRes : (fallbackRes?.message || []);
        if (Array.isArray(fallbackList) && fallbackList.length > 0) {
          list = fallbackList.map((b: any) => ({
            name: b.id || b.name,
            branch: b.name || b.branch,
            address: b.address || ''
          }));
        }
      } catch (fallbackErr) {
        console.error('Fallback fetch branches failed', fallbackErr);
      }
    }

    if (list.length > 0) {
      try {
        const restRes = await call<any>('frappe.client.get_list', {
          doctype: 'URY Restaurant',
          fields: ['branch', 'active_menu'],
          limit_page_length: 100
        });
        const restaurantList = Array.isArray(restRes) ? restRes : (restRes?.message || []);
        const menuMap: Record<string, string> = {};
        restaurantList.forEach((r: any) => {
          if (r.branch && r.active_menu) {
            menuMap[r.branch] = r.active_menu;
          }
        });
        list = list.map((b) => ({
          ...b,
          default_menu: menuMap[b.name] || (b.branch ? menuMap[b.branch] : '') || ''
        }));
      } catch (err) {
        console.error('Failed to map default menu names', err);
      }
    }

    setBranchList(list);
    setLoading(false);
  };

  const fetchLinkedData = async () => {
    try {
      const [menuRes, roomRes] = await Promise.all([
        dashboardService.getModuleRecords<{ name: string; menu_name?: string }>('URY Menu', 'all'),
        dashboardService.getModuleRecords<{ name: string; room_name?: string }>('URY Room', 'all'),
      ]);
      setMenus(menuRes || []);
      setRooms(roomRes || []);
    } catch {
      // silently ignore
    }
  };

  useEffect(() => {
    fetchCompanies();
    fetchLinkedData();
    fetchBranchList();
  }, [activeBranchId]);

  const fetchDetails = async (branchName: string) => {
    setLoading(true);
    try {
      // Fetch Branch doc
      const branchRes = await call<any>('frappe.client.get', {
        doctype: 'Branch',
        name: branchName,
      });
      const branch = branchRes.message || branchRes;
      setBranchData(branch);
      setBranchForm({
        branch_name: branch.branch_name || branch.name || '',
        address: branch.address || '',
        custom_no_taxes: branch.custom_no_taxes || 0,
      });

      // Try fetch URY Restaurant linked to this branch
      try {
        const restaurantList = await call<any>('frappe.client.get_list', {
          doctype: 'URY Restaurant',
          filters: [['branch', '=', branchName]],
          fields: ['name', 'company', 'invoice_series_prefix', 'aggregator_series_prefix',
            'address', 'active_menu', 'default_room', 'room_wise_menu',
            'order_type_wise_menu', 'menu_for_room', 'order_type_menu', 'default_tax_template'],
          limit: 1,
        });
        const list = restaurantList.message || restaurantList;
        if (list && list.length > 0) {
          // Fetch the full doc for child tables
          const restaurantRes = await call<any>('frappe.client.get', {
            doctype: 'URY Restaurant',
            name: list[0].name,
          });
          const restaurant = restaurantRes.message || restaurantRes;
          setRestaurantData(restaurant);
          setRestaurantForm({
            invoice_series_prefix: restaurant.invoice_series_prefix || '',
            aggregator_series_prefix: restaurant.aggregator_series_prefix || '',
            tax_id: restaurant.tax_id || '',
            active_menu: restaurant.active_menu || '',
            default_room: restaurant.default_room || '',
            room_wise_menu: restaurant.room_wise_menu || 0,
            order_type_wise_menu: restaurant.order_type_wise_menu || 0,
            menu_for_room: restaurant.menu_for_room || [],
            order_type_menu: restaurant.order_type_menu || [],
            default_tax_template: restaurant.default_tax_template || '',
          });
        } else {
          setRestaurantData(null);
          setRestaurantForm({});
        }
      } catch {
        setRestaurantData(null);
        setRestaurantForm({});
      }
    } catch (err) {
      console.error('Failed to fetch branch details:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBranchView = (branch: BranchData) => {
    setIsEditMode(false);
    setSelectedBranch(branch);
    fetchDetails(branch.name);
  };

  const handleBranchEdit = (branch: BranchData) => {
    setIsEditMode(true);
    setSelectedBranch(branch);
    fetchDetails(branch.name);
  };

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.branchName || !addForm.branchName.trim()) {
      showToast.error('Branch Name is required');
      return;
    }
    setSaving(true);
    try {
      // Determine valid user reference for mandatory Branch.user child table
      let currentUser = (window as any).frappe?.session?.user;
      if (!currentUser || currentUser === 'Guest') {
        try {
          currentUser = await getLoggedUser();
        } catch {
          // ignore
        }
      }
      if (!currentUser || currentUser === 'Guest') {
        const userList = await call<any>('frappe.client.get_list', {
          doctype: 'User',
          filters: [['enabled', '=', 1], ['name', 'not in', ['Guest']]],
          fields: ['name'],
          limit_page_length: 1
        });
        const list = userList.message || userList;
        if (list && list.length > 0) {
          currentUser = list[0].name;
        } else {
          currentUser = 'Administrator';
        }
      }

      if (!currentUser) {
        showToast.error('Could not determine a valid user for Branch creation');
        setSaving(false);
        return;
      }

      await call('frappe.client.insert', {
        doc: {
          doctype: 'Branch',
          branch: addForm.branchName,
          user: [{ user: currentUser }]
        }
      });
      const roomName = `Main Dining - ${addForm.branchName}`;
      await call('frappe.client.insert', {
        doc: {
          doctype: 'URY Room',
          name: roomName,
          room_name: 'Main Dining',
          branch: addForm.branchName
        }
      });
      await call('frappe.client.insert', {
        doc: {
          doctype: 'URY Restaurant',
          name: addForm.branchName + ' Restaurant',
          company: addForm.company,
          branch: addForm.branchName,
          invoice_series_prefix: addForm.invoicePrefix,
          aggregator_series_prefix: addForm.aggregatorPrefix,
          tax_id: addForm.taxId,
          address: addForm.address,
          default_room: roomName
        }
      });
      showToast.success('Branch created successfully');
      setIsAddDrawerOpen(false);
      fetchBranchList();
      fetchLinkedData();
    } catch (err: any) {
      showToast.error(err.message || 'Failed to create Branch');
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!selectedBranch) return;

    // Validate invoice series prefix
    if (!restaurantForm.invoice_series_prefix || !restaurantForm.invoice_series_prefix.trim()) {
      showToast.error('Invoice Series Prefix is required');
      return;
    }

    const original = {
      branch_name: (selectedBranch.branch_name || selectedBranch.name || '').trim(),
      address: (branchData?.address || '').trim(),
      custom_no_taxes: branchData?.custom_no_taxes ? 1 : 0,
      invoice_series_prefix: (restaurantData?.invoice_series_prefix || '').trim(),
      aggregator_series_prefix: (restaurantData?.aggregator_series_prefix || '').trim(),
      tax_id: (restaurantData?.tax_id || '').trim(),
      active_menu: restaurantData?.active_menu || '',
      default_room: restaurantData?.default_room || '',
      room_wise_menu: restaurantData?.room_wise_menu ? 1 : 0,
      menu_for_room: (restaurantData?.menu_for_room || []).map((row: any) => ({
        room: row.room || row.ury_room || '',
        ury_room: row.room || row.ury_room || '',
        menu: row.menu || row.ury_menu || '',
        ury_menu: row.menu || row.ury_menu || '',
      })),
      order_type_wise_menu: restaurantData?.order_type_wise_menu ? 1 : 0,
      order_type_menu: (restaurantData?.order_type_menu || []).map((row: any) => ({
        order_type: row.order_type || '',
        menu: row.menu || row.ury_menu || '',
        ury_menu: row.menu || row.ury_menu || '',
      })),
      default_tax_template: (restaurantData?.default_tax_template || '').trim(),
    };

    const current = {
      branch_name: (branchForm.branch_name || '').trim(),
      address: (branchForm.address || '').trim(),
      custom_no_taxes: branchForm.custom_no_taxes ? 1 : 0,
      invoice_series_prefix: (restaurantForm.invoice_series_prefix || '').trim(),
      aggregator_series_prefix: (restaurantForm.aggregator_series_prefix || '').trim(),
      tax_id: (restaurantForm.tax_id || '').trim(),
      active_menu: restaurantForm.active_menu || '',
      default_room: restaurantForm.default_room || '',
      room_wise_menu: restaurantForm.room_wise_menu ? 1 : 0,
      menu_for_room: (restaurantForm.menu_for_room || []).map((row: any) => ({
        room: row.room || row.ury_room || '',
        ury_room: row.room || row.ury_room || '',
        menu: row.menu || row.ury_menu || '',
        ury_menu: row.menu || row.ury_menu || '',
      })),
      order_type_wise_menu: restaurantForm.order_type_wise_menu ? 1 : 0,
      order_type_menu: (restaurantForm.order_type_menu || []).map((row: any) => ({
        order_type: row.order_type || '',
        menu: row.menu || row.ury_menu || '',
        ury_menu: row.menu || row.ury_menu || '',
      })),
      default_tax_template: (restaurantForm.default_tax_template || '').trim(),
    };

    if (JSON.stringify(original) === JSON.stringify(current)) {
      showToast.warning('No changes in document');
      return;
    }

    setSaving(true);
    try {
      let currentBranchName = selectedBranch.name;
      if (branchForm.branch_name && branchForm.branch_name.trim() !== selectedBranch.name) {
        const newBranchName = branchForm.branch_name.trim();
        await call('frappe.client.rename_doc', {
          doctype: 'Branch',
          old_name: selectedBranch.name,
          new_name: newBranchName,
        });
        currentBranchName = newBranchName;
      }

      // Save Branch fields (address and custom_no_taxes)
      await call('frappe.client.set_value', {
        doctype: 'Branch',
        name: currentBranchName,
        fieldname: {
          branch: branchForm.branch_name,
          address: branchForm.address,
          custom_no_taxes: branchForm.custom_no_taxes ? 1 : 0,
        },
      });

      // Save URY Restaurant fields if it exists
      if (restaurantData) {
        let currentRestaurantName = restaurantData.name;
        const newRestaurantName = `${branchForm.branch_name.trim()} Restaurant`;
        if (newRestaurantName !== restaurantData.name) {
          await call('frappe.client.rename_doc', {
            doctype: 'URY Restaurant',
            old_name: restaurantData.name,
            new_name: newRestaurantName,
          });
          currentRestaurantName = newRestaurantName;
        }

        const updatedDoc = {
          ...restaurantData,
          name: currentRestaurantName,
          branch: branchForm.branch_name.trim(),
          invoice_series_prefix: restaurantForm.invoice_series_prefix,
          aggregator_series_prefix: restaurantForm.aggregator_series_prefix,
          tax_id: restaurantForm.tax_id,
          active_menu: restaurantForm.active_menu,
          default_room: restaurantForm.default_room,
          room_wise_menu: restaurantForm.room_wise_menu,
          order_type_wise_menu: restaurantForm.order_type_wise_menu,
          menu_for_room: restaurantForm.menu_for_room || restaurantData.menu_for_room || [],
          order_type_menu: restaurantForm.order_type_menu || restaurantData.order_type_menu || [],
          default_tax_template: restaurantForm.default_tax_template,
        };
        await call('frappe.client.save', {
          doc: updatedDoc
        });
      }
      showToast.success('Branch saved successfully');
      await fetchDetails(currentBranchName);
      await fetchBranchList();
      setIsEditMode(false); // Return to read-only View Mode after successful save
    } catch (err: any) {
      showToast.error(err.message || 'Failed to update branch settings');
    } finally {
      setSaving(false);
    }
  };

  // Render Branch Detail View
  if (selectedBranch) {
    return (
      <div className="space-y-6">
        {/* Navigation & Action Header */}
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedBranch(null)}
              className="text-foreground hover:text-primary flex items-center gap-1.5 shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>
            <div className="h-5 w-px bg-muted" />
            <div>
              <h2 className="text-lg font-bold text-foreground">Branch: {selectedBranch.branch_name || selectedBranch.name}</h2>
              <p className="text-xs text-muted-foreground">
                Address: {branchForm.address || 'Not specified'}
              </p>
            </div>
          </div>

          {isEditMode ? (
            <Button
              type="button"
              onClick={() => handleSave()}
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

        {/* Unified Branch Details Container */}
        {loading ? (
          <div className="py-16 flex items-center justify-center bg-card rounded-lg border border-border">
            <Spinner className="w-8 h-8 text-primary" />
          </div>
        ) : (
          <Card className="p-6 rounded-lg border border-border bg-card shadow-sm space-y-8">
            {/* BRANCH INFO SUBSECTION */}
            <div>
              <div className="flex items-center gap-2.5 pb-2 border-b border-border mb-4">
                <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Building2 className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Branch Info
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Branch Name</label>
                  <Input
                    value={branchForm.branch_name || ''}
                    onChange={(e) => setBranchForm(p => ({ ...p, branch_name: e.target.value }))}
                    disabled={!isEditMode}
                    className="rounded-lg"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Address</label>
                  <Input
                    value={branchForm.address || ''}
                    onChange={(e) => setBranchForm(p => ({ ...p, address: e.target.value }))}
                    disabled={!isEditMode}
                    className="rounded-lg"
                  />
                </div>
              </div>
            </div>

            {/* RESTAURANT INFO SUBSECTION */}
            <div>
              <h3 className="text-xs font-bold text-foreground uppercase tracking-wider mb-4 pb-2 border-b border-border">
                Restaurant Info
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Invoice Series Prefix <span className="text-red-500">*</span></label>
                  <Input
                    value={restaurantForm.invoice_series_prefix || ''}
                    onChange={(e) => setRestaurantForm(p => ({ ...p, invoice_series_prefix: e.target.value }))}
                    className="rounded-lg"
                    disabled={!isEditMode || !restaurantData}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Aggregator Series Prefix</label>
                  <Input
                    value={restaurantForm.aggregator_series_prefix || ''}
                    onChange={(e) => setRestaurantForm(p => ({ ...p, aggregator_series_prefix: e.target.value }))}
                    className="rounded-lg"
                    disabled={!isEditMode || !restaurantData}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Tax ID</label>
                  <Input
                    value={restaurantForm.tax_id || ''}
                    onChange={(e) => setRestaurantForm(p => ({ ...p, tax_id: e.target.value }))}
                    className="rounded-lg"
                    disabled={!isEditMode || !restaurantData}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-foreground">Default Tax Template</label>
                  <Input
                    value={restaurantForm.default_tax_template || ''}
                    onChange={(e) => setRestaurantForm(p => ({ ...p, default_tax_template: e.target.value }))}
                    className="rounded-lg"
                    disabled={!isEditMode || !restaurantData}
                    placeholder="e.g. GST 5% - Restaurant"
                  />
                </div>
              </div>
            </div>

            {/* MENU SUBSECTION */}
            <div>
              <div className="flex items-center gap-2.5 pb-2 border-b border-border mb-4">
                <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <UtensilsCrossed className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Menu
                </h3>
              </div>
              {restaurantData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-foreground">Default Menu (Active Menu)</label>
                      <SearchableSelect
                        id="active_menu"
                        value={restaurantForm.active_menu || ''}
                        onChange={(_, val) => setRestaurantForm(p => ({ ...p, active_menu: val }))}
                        options={[
                          { value: '', label: 'None' },
                          ...menus.map((m) => ({ value: m.name, label: m.menu_name || m.name }))
                        ]}
                        disabled={!isEditMode}
                        placeholder="None"
                      />
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <Switch
                        id="room_wise_menu"
                        checked={!!restaurantForm.room_wise_menu}
                        onCheckedChange={(checked) => {
                          setRestaurantForm((p: Record<string, any>) => {
                            const updated: Record<string, any> = { ...p, room_wise_menu: checked ? 1 : 0 };
                            if (checked && (!updated.menu_for_room || updated.menu_for_room.length === 0)) {
                              updated.menu_for_room = [{ room: '', menu: '' }];
                            }
                            return updated;
                          });
                        }}
                        disabled={!isEditMode}
                      />
                      <label htmlFor="room_wise_menu" className="text-sm font-medium text-foreground cursor-pointer">
                        Room Wise Menu
                      </label>
                    </div>
                  </div>
                  {!!restaurantForm.room_wise_menu && (restaurantForm.menu_for_room || []).length > 0 && (
                    <div className="mt-3">
                      {(() => {
                        const rows = (restaurantForm.menu_for_room || []).map((r: any, idx: number) => ({ ...r, _idx: idx }));
                        const columns: DataTableColumn<any>[] = [
                          {
                            key: 'room',
                            header: 'Room',
                            render: (row) => (
                              <SearchableSelect
                                id={`room_${row._idx}`}
                                value={row.room || row.ury_room || ''}
                                onChange={(_, val) => {
                                  const newRows = [...restaurantForm.menu_for_room];
                                  newRows[row._idx].room = val;
                                  newRows[row._idx].ury_room = val;
                                  setRestaurantForm({...restaurantForm, menu_for_room: newRows});
                                }}
                                options={[
                                  { value: '', label: 'Select Room' },
                                  ...rooms.map(r => ({ value: r.name, label: r.room_name || r.name }))
                                ]}
                                disabled={!isEditMode}
                                placeholder="Select Room"
                              />
                            )
                          },
                          {
                            key: 'menu',
                            header: 'Menu',
                            render: (row) => (
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <SearchableSelect
                                    id={`menu_${row._idx}`}
                                    value={row.menu || row.ury_menu || ''}
                                    onChange={(_, val) => {
                                      const newRows = [...restaurantForm.menu_for_room];
                                      newRows[row._idx].menu = val;
                                      newRows[row._idx].ury_menu = val;
                                      setRestaurantForm({...restaurantForm, menu_for_room: newRows});
                                    }}
                                    options={[
                                      { value: '', label: 'Select Menu' },
                                      ...menus.map(m => ({ value: m.name, label: m.menu_name || m.name }))
                                    ]}
                                    disabled={!isEditMode}
                                    placeholder="Select Menu"
                                  />
                                </div>
                                {isEditMode && (
                                  <button type="button" className="text-muted-foreground hover:text-red-500 shrink-0" onClick={() => {
                                    const newRows = restaurantForm.menu_for_room.filter((_:any, i:number) => i !== row._idx);
                                    setRestaurantForm({...restaurantForm, menu_for_room: newRows});
                                  }}><X className="w-4 h-4" /></button>
                                )}
                              </div>
                            )
                          },
                        ];
                        return (
                          <>
                            <DataTable columns={columns} rows={rows} />
                            {isEditMode && (
                              <div className="mt-2">
                                <Button type="button" variant="ghost" size="sm" className="text-primary text-xs" onClick={() => {
                                  setRestaurantForm({...restaurantForm, menu_for_room: [...(restaurantForm.menu_for_room || []), {room: '', menu: ''}]});
                                }}>+ Add Row</Button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No URY Restaurant linked to this branch.</p>
              )}
            </div>

            {/* ROOM SUBSECTION */}
            <div>
              <div className="flex items-center gap-2.5 pb-2 border-b border-border mb-4">
                <div className="w-7 h-7 rounded-md bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Map className="w-4 h-4" />
                </div>
                <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Room
                </h3>
              </div>
              {restaurantData ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-foreground">Default Room</label>
                    <SearchableSelect
                      id="default_room"
                      value={restaurantForm.default_room || ''}
                      onChange={(_, val) => setRestaurantForm(p => ({ ...p, default_room: val }))}
                      options={[
                        { value: '', label: 'None' },
                        ...rooms.map((r) => ({ value: r.name, label: r.room_name || r.name }))
                      ]}
                      disabled={!isEditMode}
                      placeholder="None"
                    />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <Switch
                      id="order_type_wise_menu"
                      checked={!!restaurantForm.order_type_wise_menu}
                      onCheckedChange={(checked) => {
                        setRestaurantForm((p: Record<string, any>) => {
                          const updated: Record<string, any> = { ...p, order_type_wise_menu: checked ? 1 : 0 };
                          if (checked && (!updated.order_type_menu || updated.order_type_menu.length === 0)) {
                            updated.order_type_menu = [{ order_type: '', menu: '' }];
                          }
                          return updated;
                        });
                      }}
                      disabled={!isEditMode}
                    />
                    <label htmlFor="order_type_wise_menu" className="text-sm font-medium text-foreground cursor-pointer">
                      Order Type Wise Menu
                    </label>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No URY Restaurant linked to this branch.</p>
              )}
            </div>

            {/* ORDER TYPE MENU SUBSECTION */}
            <div>
              {restaurantData ? (
                <div className="space-y-4">
                  {!!restaurantForm.order_type_wise_menu && (restaurantForm.order_type_menu || []).length > 0 && (
                    <div className="mt-3">
                      {(() => {
                        const rows = (restaurantForm.order_type_menu || []).map((r: any, idx: number) => ({ ...r, _idx: idx }));
                        const columns: DataTableColumn<any>[] = [
                          {
                            key: 'order_type',
                            header: 'Order Type',
                            render: (row) => (
                              <Input disabled={!isEditMode} className="w-full text-xs" placeholder="e.g. Dine In" value={row.order_type || ''} onChange={e => {
                                const newRows = [...restaurantForm.order_type_menu];
                                newRows[row._idx].order_type = e.target.value;
                                setRestaurantForm({...restaurantForm, order_type_menu: newRows});
                              }} />
                            )
                          },
                          {
                            key: 'menu',
                            header: 'Menu',
                            render: (row) => (
                              <div className="flex items-center gap-2">
                                <div className="flex-1">
                                  <SearchableSelect
                                    id={`order_type_menu_${row._idx}`}
                                    value={row.menu || row.ury_menu || ''}
                                    onChange={(_, val) => {
                                      const newRows = [...restaurantForm.order_type_menu];
                                      newRows[row._idx].menu = val;
                                      newRows[row._idx].ury_menu = val;
                                      setRestaurantForm({...restaurantForm, order_type_menu: newRows});
                                    }}
                                    options={[
                                      { value: '', label: 'Select Menu' },
                                      ...menus.map(m => ({ value: m.name, label: m.menu_name || m.name }))
                                    ]}
                                    disabled={!isEditMode}
                                    placeholder="Select Menu"
                                  />
                                </div>
                                {isEditMode && (
                                  <button type="button" className="text-muted-foreground hover:text-red-500 shrink-0" onClick={() => {
                                    const newRows = restaurantForm.order_type_menu.filter((_:any, i:number) => i !== row._idx);
                                    setRestaurantForm({...restaurantForm, order_type_menu: newRows});
                                  }}><X className="w-4 h-4" /></button>
                                )}
                              </div>
                            )
                          },
                        ];
                        return (
                          <>
                            <DataTable columns={columns} rows={rows} />
                            {isEditMode && (
                              <div className="mt-2">
                                <Button type="button" variant="ghost" size="sm" className="text-primary text-xs" onClick={() => {
                                  setRestaurantForm({...restaurantForm, order_type_menu: [...(restaurantForm.order_type_menu || []), {order_type: '', menu: ''}]});
                                }}>+ Add Row</Button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No URY Restaurant linked to this branch.</p>
              )}
            </div>
          </Card>
        )}
      </div>
    );
  }

  // Render Main Branch List View
  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-end gap-4 pb-3 border-b border-border -mx-6 px-6 -mt-6 pt-6">
        <Button
          onClick={() => setIsAddDrawerOpen(true)}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Add Branch</span>
        </Button>
      </div>

      {/* Branch List Table */}
      {loading ? (
        <div className="py-16 flex items-center justify-center bg-card rounded-lg border border-border">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : branchList.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-border shadow-sm bg-card">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No Branch Configured</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Create a Branch to manage restaurant settings and menus.
          </p>
          <Button
            onClick={() => setIsAddDrawerOpen(true)}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Add Branch</span>
          </Button>
        </Card>
      ) : (
        <>
          {branchList.length > 0 && (
            <>
              {(() => {
                const columns: DataTableColumn<BranchData>[] = [
                  {
                    key: 'branch',
                    header: 'Branch',
                    render: (row) => <span className="font-semibold text-foreground">{row.branch || row.branch_name || row.name}</span>
                  },
                  { key: 'default_menu', header: 'Default Menu', render: (row) => row.default_menu || '-' },
                  {
                    key: 'actions',
                    header: 'Actions',
                    align: 'right',
                    render: (row) => (
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBranchView(row)}
                          className="text-muted-foreground hover:text-primary p-1.5 h-8 w-8"
                          title="View Branch"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleBranchEdit(row)}
                          className="text-muted-foreground hover:text-primary p-1.5 h-8 w-8"
                          title="Edit Branch"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </div>
                    )
                  },
                ];
                return <DataTable columns={columns} rows={branchList} />;
              })()}
            </>
          )}
        </>
      )}

      {/* Add Branch Drawer */}
      <SideDrawer
        isOpen={isAddDrawerOpen}
        onClose={() => setIsAddDrawerOpen(false)}
        title="Add Branch"
      >
        <form onSubmit={handleAddBranch} className="space-y-6 text-sm">
          <div>
            <label className="block font-semibold text-foreground mb-1.5">Branch Name <span className="text-red-500">*</span></label>
            <Input required value={addForm.branchName} onChange={e => setAddForm({...addForm, branchName: e.target.value})} placeholder="e.g. Main Branch" />
          </div>
          <div>
            <label className="block font-semibold text-foreground mb-1.5">Company <span className="text-red-500">*</span></label>
            <SearchableSelect
              id="add_branch_company"
              value={addForm.company}
              onChange={(_, val) => setAddForm({...addForm, company: val})}
              options={[
                { value: '', label: 'Select Company' },
                ...companies.map((c: any) => ({ value: c.name, label: c.name }))
              ]}
              placeholder="Select Company"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-foreground mb-1.5">Invoice Prefix <span className="text-red-500">*</span></label>
              <Input required value={addForm.invoicePrefix} onChange={e => setAddForm({...addForm, invoicePrefix: e.target.value})} />
            </div>
            <div>
              <label className="block font-semibold text-foreground mb-1.5">Aggregator Prefix <span className="text-red-500">*</span></label>
              <Input required value={addForm.aggregatorPrefix} onChange={e => setAddForm({...addForm, aggregatorPrefix: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-foreground mb-1.5">Tax ID (Optional)</label>
            <Input value={addForm.taxId} onChange={e => setAddForm({...addForm, taxId: e.target.value})} />
          </div>
          <div>
            <label className="block font-semibold text-foreground mb-1.5">Address (Optional)</label>
            <Input value={addForm.address} onChange={e => setAddForm({...addForm, address: e.target.value})} />
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

export default BranchPage;
