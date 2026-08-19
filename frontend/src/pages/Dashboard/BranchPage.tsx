import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Save, Plus, X, Eye, Edit2, ArrowLeft, Building2 } from 'lucide-react';
import { Card, Button, Input, Select, Spinner, showToast } from '@ury/ui';
import { Switch } from '../../components/ui/switch';
import SideDrawer from '../../components/layout/SideDrawer';
import { call, getLoggedUser } from '@ury/core';
import { dashboardService } from '../../services/dashboard';

interface BranchData {
  name: string;
  branch?: string;
  branch_name?: string;
  invoice_series_prefix?: string;
  aggregator_series_prefix?: string;
  tax_id?: string;
  address?: string;
  custom_no_taxes?: number;
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
    try {
      const res = await call<any>('frappe.client.get_list', {
        doctype: 'Branch',
        fields: ['name', 'branch', 'address', 'custom_no_taxes'],
        limit_page_length: 100
      });
      const list = Array.isArray(res) ? res : (res?.message || []);
      setBranchList(list);
    } catch (e) {
      console.error('Failed to load branch list', e);
      try {
        const fallbackRes = await call<any>('ury.ury.api.minimal.business_setup.get_branches');
        const fallbackList = Array.isArray(fallbackRes) ? fallbackRes : (fallbackRes?.message || []);
        if (Array.isArray(fallbackList) && fallbackList.length > 0) {
          setBranchList(fallbackList.map((b: any) => ({
            name: b.id || b.name,
            branch: b.name || b.branch,
            address: b.address || ''
          })));
        }
      } catch (fallbackErr) {
        console.error('Fallback fetch branches failed', fallbackErr);
      }
    } finally {
      setLoading(false);
    }
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

    setSaving(true);
    try {
      // Save Branch fields (address and custom_no_taxes)
      await call('frappe.client.set_value', {
        doctype: 'Branch',
        name: selectedBranch.name,
        fieldname: {
          address: branchForm.address,
          custom_no_taxes: branchForm.custom_no_taxes ? 1 : 0,
        },
      });

      // Save URY Restaurant fields if it exists
      if (restaurantData) {
        const updatedDoc = {
          ...restaurantData,
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
      await fetchDetails(selectedBranch.name);
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
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 pb-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectedBranch(null)}
              className="text-gray-700 hover:text-primary flex items-center gap-1.5 shadow-2xs"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </Button>
            <div className="h-5 w-px bg-gray-200" />
            <div>
              <h2 className="text-lg font-bold text-gray-900">Branch: {selectedBranch.branch_name || selectedBranch.name}</h2>
              <p className="text-xs text-gray-500">
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
          <div className="py-16 flex items-center justify-center bg-white rounded-lg border border-gray-200">
            <Spinner className="w-8 h-8 text-primary" />
          </div>
        ) : (
          <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm space-y-8">
            {/* BRANCH INFO SUBSECTION */}
            <div>
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
                Branch Info
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Branch Name</label>
                  <Input
                    value={branchForm.branch_name || ''}
                    disabled
                    className="rounded-lg bg-gray-50"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Address</label>
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
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
                Restaurant Info
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Invoice Series Prefix <span className="text-red-500">*</span></label>
                  <Input
                    value={restaurantForm.invoice_series_prefix || ''}
                    onChange={(e) => setRestaurantForm(p => ({ ...p, invoice_series_prefix: e.target.value }))}
                    className="rounded-lg"
                    disabled={!isEditMode || !restaurantData}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Aggregator Series Prefix</label>
                  <Input
                    value={restaurantForm.aggregator_series_prefix || ''}
                    onChange={(e) => setRestaurantForm(p => ({ ...p, aggregator_series_prefix: e.target.value }))}
                    className="rounded-lg"
                    disabled={!isEditMode || !restaurantData}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Tax ID</label>
                  <Input
                    value={restaurantForm.tax_id || ''}
                    onChange={(e) => setRestaurantForm(p => ({ ...p, tax_id: e.target.value }))}
                    className="rounded-lg"
                    disabled={!isEditMode || !restaurantData}
                  />
                </div>
                <div className="flex items-center space-x-2 pt-1">
                  <Switch
                    id="custom_no_taxes"
                    checked={!!branchForm.custom_no_taxes}
                    onCheckedChange={(checked) => setBranchForm(p => ({ ...p, custom_no_taxes: checked ? 1 : 0 }))}
                    disabled={!isEditMode}
                  />
                  <label htmlFor="custom_no_taxes" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Create Invoice without Tax
                  </label>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Default Tax Template</label>
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
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
                Menu
              </h3>
              {restaurantData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium text-gray-700">Default Menu (Active Menu)</label>
                      <Select
                        value={restaurantForm.active_menu || ''}
                        onChange={(e) => setRestaurantForm(p => ({ ...p, active_menu: e.target.value }))}
                        disabled={!isEditMode}
                      >
                        <option value="">None</option>
                        {menus.map((m) => (
                          <option key={m.name} value={m.name}>{m.menu_name || m.name}</option>
                        ))}
                      </Select>
                    </div>
                    <div className="flex items-center gap-2 pt-6">
                      <Switch
                        id="room_wise_menu"
                        checked={!!restaurantForm.room_wise_menu}
                        onCheckedChange={(checked) => setRestaurantForm(p => ({ ...p, room_wise_menu: checked ? 1 : 0 }))}
                        disabled={!isEditMode}
                      />
                      <label htmlFor="room_wise_menu" className="text-sm font-medium text-gray-700 cursor-pointer">
                        Room Wise Menu
                      </label>
                    </div>
                  </div>
                  {!!restaurantForm.room_wise_menu && (
                    <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
                      <table className="w-full text-xs text-gray-600">
                        <thead className="bg-gray-50 border-b border-gray-100 font-semibold">
                          <tr>
                            <th className="px-4 py-2 text-left">Room</th>
                            <th className="px-4 py-2 text-left">Menu</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(restaurantForm.menu_for_room || []).map((row: any, idx: number) => (
                            <tr key={idx}>
                              <td className="px-4 py-2">
                                <Select disabled={!isEditMode} className="w-full text-xs" value={row.room || row.ury_room || ''} onChange={e => {
                                  const newRows = [...restaurantForm.menu_for_room];
                                  newRows[idx].room = e.target.value;
                                  newRows[idx].ury_room = e.target.value;
                                  setRestaurantForm({...restaurantForm, menu_for_room: newRows});
                                }}>
                                  <option value="">Select Room</option>
                                  {rooms.map(r => <option key={r.name} value={r.name}>{r.room_name || r.name}</option>)}
                                </Select>
                              </td>
                              <td className="px-4 py-2 flex items-center gap-2">
                                <Select disabled={!isEditMode} className="w-full text-xs" value={row.menu || row.ury_menu || ''} onChange={e => {
                                  const newRows = [...restaurantForm.menu_for_room];
                                  newRows[idx].menu = e.target.value;
                                  newRows[idx].ury_menu = e.target.value;
                                  setRestaurantForm({...restaurantForm, menu_for_room: newRows});
                                }}>
                                  <option value="">Select Menu</option>
                                  {menus.map(m => <option key={m.name} value={m.name}>{m.menu_name || m.name}</option>)}
                                </Select>
                                {isEditMode && (
                                  <button type="button" className="text-gray-400 hover:text-red-500 shrink-0" onClick={() => {
                                    const newRows = restaurantForm.menu_for_room.filter((_:any, i:number) => i !== idx);
                                    setRestaurantForm({...restaurantForm, menu_for_room: newRows});
                                  }}><X className="w-4 h-4" /></button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {isEditMode && (
                        <div className="p-2 border-t border-gray-100 bg-gray-50">
                          <Button type="button" variant="ghost" size="sm" className="text-primary h-7 text-xs" onClick={() => {
                            setRestaurantForm({...restaurantForm, menu_for_room: [...(restaurantForm.menu_for_room || []), {room: '', menu: ''}]});
                          }}>+ Add Row</Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No URY Restaurant linked to this branch.</p>
              )}
            </div>

            {/* ROOM SUBSECTION */}
            <div>
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
                Room
              </h3>
              {restaurantData ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Default Room</label>
                  <Select
                    value={restaurantForm.default_room || ''}
                    onChange={(e) => setRestaurantForm(p => ({ ...p, default_room: e.target.value }))}
                    disabled={!isEditMode}
                  >
                    <option value="">None</option>
                    {rooms.map((r) => (
                      <option key={r.name} value={r.name}>{r.room_name || r.name}</option>
                    ))}
                  </Select>
                </div>
              ) : (
                <p className="text-sm text-gray-400">No URY Restaurant linked to this branch.</p>
              )}
            </div>

            {/* ORDER TYPE MENU SUBSECTION */}
            <div>
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">
                Order Type Menu
              </h3>
              {restaurantData ? (
                <div className="space-y-4">
                  <div className="flex items-center gap-2">
                    <Switch
                      id="order_type_wise_menu"
                      checked={!!restaurantForm.order_type_wise_menu}
                      onCheckedChange={(checked) => setRestaurantForm(p => ({ ...p, order_type_wise_menu: checked ? 1 : 0 }))}
                      disabled={!isEditMode}
                    />
                    <label htmlFor="order_type_wise_menu" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Order Type Wise Menu
                    </label>
                  </div>
                  {!!restaurantForm.order_type_wise_menu && (
                    <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
                      <table className="w-full text-xs text-gray-600">
                        <thead className="bg-gray-50 border-b border-gray-100 font-semibold">
                          <tr>
                            <th className="px-4 py-2 text-left">Order Type</th>
                            <th className="px-4 py-2 text-left">Menu</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(restaurantForm.order_type_menu || []).map((row: any, idx: number) => (
                            <tr key={idx}>
                              <td className="px-4 py-2">
                                <Input disabled={!isEditMode} className="w-full text-xs" placeholder="e.g. Dine In" value={row.order_type || ''} onChange={e => {
                                  const newRows = [...restaurantForm.order_type_menu];
                                  newRows[idx].order_type = e.target.value;
                                  setRestaurantForm({...restaurantForm, order_type_menu: newRows});
                                }} />
                              </td>
                              <td className="px-4 py-2 flex items-center gap-2">
                                <Select disabled={!isEditMode} className="w-full text-xs" value={row.menu || row.ury_menu || ''} onChange={e => {
                                  const newRows = [...restaurantForm.order_type_menu];
                                  newRows[idx].menu = e.target.value;
                                  newRows[idx].ury_menu = e.target.value;
                                  setRestaurantForm({...restaurantForm, order_type_menu: newRows});
                                }}>
                                  <option value="">Select Menu</option>
                                  {menus.map(m => <option key={m.name} value={m.name}>{m.menu_name || m.name}</option>)}
                                </Select>
                                {isEditMode && (
                                  <button type="button" className="text-gray-400 hover:text-red-500 shrink-0" onClick={() => {
                                    const newRows = restaurantForm.order_type_menu.filter((_:any, i:number) => i !== idx);
                                    setRestaurantForm({...restaurantForm, order_type_menu: newRows});
                                  }}><X className="w-4 h-4" /></button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {isEditMode && (
                        <div className="p-2 border-t border-gray-100 bg-gray-50">
                          <Button type="button" variant="ghost" size="sm" className="text-primary h-7 text-xs" onClick={() => {
                            setRestaurantForm({...restaurantForm, order_type_menu: [...(restaurantForm.order_type_menu || []), {order_type: '', menu: ''}]});
                          }}>+ Add Row</Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No URY Restaurant linked to this branch.</p>
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
      <div className="flex flex-col md:flex-row items-center justify-end gap-4 pb-3 border-b border-gray-200 -mx-6 px-6 -mt-6 pt-6">
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
        <div className="py-16 flex items-center justify-center bg-white rounded-lg border border-gray-200">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : branchList.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-gray-200 shadow-sm bg-white">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Building2 className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No Branch Configured</h3>
          <p className="text-gray-500 mb-6 max-w-sm">
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
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
              <tr>
                <th className="px-6 py-4">Branch</th>
                <th className="px-6 py-4">Address</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {branchList.map((b) => (
                <tr
                  key={b.name}
                  className="hover:bg-gray-50/50 transition-colors"
                >
                  <td className="px-6 py-4 font-semibold text-gray-900">{b.branch || b.branch_name || b.name}</td>
                  <td className="px-6 py-4 text-gray-600">{b.address || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleBranchView(b)}
                        className="text-gray-500 hover:text-primary p-1.5 h-8 w-8"
                        title="View Branch"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleBranchEdit(b)}
                        className="text-gray-500 hover:text-primary p-1.5 h-8 w-8"
                        title="Edit Branch"
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

      {/* Add Branch Drawer */}
      <SideDrawer
        isOpen={isAddDrawerOpen}
        onClose={() => setIsAddDrawerOpen(false)}
        title="Add Branch"
      >
        <form onSubmit={handleAddBranch} className="space-y-6 text-sm">
          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Branch Name <span className="text-red-500">*</span></label>
            <Input required value={addForm.branchName} onChange={e => setAddForm({...addForm, branchName: e.target.value})} placeholder="e.g. Main Branch" />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Company <span className="text-red-500">*</span></label>
            <Select required value={addForm.company} onChange={e => setAddForm({...addForm, company: e.target.value})}>
              <option value="">Select Company</option>
              {companies.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold text-gray-700 mb-1.5">Invoice Prefix <span className="text-red-500">*</span></label>
              <Input required value={addForm.invoicePrefix} onChange={e => setAddForm({...addForm, invoicePrefix: e.target.value})} />
            </div>
            <div>
              <label className="block font-semibold text-gray-700 mb-1.5">Aggregator Prefix <span className="text-red-500">*</span></label>
              <Input required value={addForm.aggregatorPrefix} onChange={e => setAddForm({...addForm, aggregatorPrefix: e.target.value})} />
            </div>
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Tax ID (Optional)</label>
            <Input value={addForm.taxId} onChange={e => setAddForm({...addForm, taxId: e.target.value})} />
          </div>
          <div>
            <label className="block font-semibold text-gray-700 mb-1.5">Address (Optional)</label>
            <Input value={addForm.address} onChange={e => setAddForm({...addForm, address: e.target.value})} />
          </div>
          <div className="pt-6 flex justify-end gap-3 border-t border-gray-100">
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
