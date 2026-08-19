import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Save, ChevronDown, ChevronRight, Plus, X } from 'lucide-react';
import { Card, Button, Input, Select, Spinner, showToast } from '@ury/ui';
import { Switch } from '../../components/ui/switch';
import SideDrawer from '../../components/layout/SideDrawer';
import { call } from '@ury/core';
import { dashboardService } from '../../services/dashboard';

interface BranchData {
  name: string;
  branch_name?: string;
  invoice_series_prefix?: string;
  aggregator_series_prefix?: string;
  tax_id?: string;
  address?: string;
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
  const { activeBranch, activeBranchId, branches } = useBranchContext();
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

  // Section expand states
  const [menuSectionOpen, setMenuSectionOpen] = useState(true);
  const [roomSectionOpen, setRoomSectionOpen] = useState(true);
  const [orderTypeSectionOpen, setOrderTypeSectionOpen] = useState(true);

  
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

  useEffect(() => {
    fetchCompanies();
  }, []);

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await call('frappe.client.insert', {
        doc: {
          doctype: 'Branch',
          branch: addForm.branchName
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
      fetchDetails();
      fetchLinkedData();
    } catch (err: any) {
      showToast.error(err.message || 'Failed to create Branch');
    } finally {
      setSaving(false);
    }
  };

  const branchToFetch = activeBranchId === 'all' ? branches[0]?.name : activeBranchId;

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

  const fetchDetails = async () => {
    if (!branchToFetch) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // Fetch Branch doc
      const branchRes = await call<any>('frappe.client.get', {
        doctype: 'Branch',
        name: branchToFetch,
      });
      const branch = branchRes.message || branchRes;
      setBranchData(branch);
      setBranchForm({
        branch_name: branch.branch_name || branch.name || '',
        address: branch.address || '',
      });

      // Try fetch URY Restaurant linked to this branch
      try {
        const restaurantList = await call<any>('frappe.client.get_list', {
          doctype: 'URY Restaurant',
          filters: [['branch', '=', branchToFetch]],
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

  useEffect(() => {
    if (branches.length > 0) {
      fetchLinkedData();
      fetchDetails();
    } else {
      setLoading(false);
    }
  }, [activeBranchId, branches]);

  const handleSave = async () => {
    if (!branchToFetch) return;

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
        name: branchToFetch,
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
      showToast.success('Settings saved');
      // Refresh local state so its `modified` timestamp is current — otherwise a
      // second save in a row fails with TimestampMismatchError (stale doc snapshot).
      await fetchDetails();
    } catch (err: any) {
      showToast.error(err.message || 'Failed to update branch settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex items-center justify-center bg-white rounded-lg border border-gray-200">
        <Spinner className="w-8 h-8 text-primary" />
      </div>
    );
  }

  const hasBranch = branches.length > 0;

  if (!hasBranch) {
    return (
      <Card className="p-12 text-center text-gray-400 rounded-lg border border-gray-200">
        No branches found. Please create one in Desk first.
      </Card>
    );
  }

  return (
    <div className="space-y-6">

      {/* Save button */}
      <div className="flex items-center justify-end gap-3 pb-3 border-b border-gray-200 -mx-6 px-6 -mt-6 pt-6">
        <Button
          onClick={() => setIsAddDrawerOpen(true)}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          <Plus className="w-4 h-4 mr-1.5" />
          <span>Add Branch</span>
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !hasBranch}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
        >
          {saving ? <Spinner className="w-4 h-4 mr-1.5" /> : <Save className="w-4 h-4 mr-1.5" />}
          <span>Save Settings</span>
        </Button>
      </div>

      {/* Branch Details */}
      <Card className="p-6 rounded-lg border-gray-200 bg-white shadow-sm">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-6">Branch Details</h2>

        {/* Branch Info Section */}
        <div className="mb-6">
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">Branch Info</h3>
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
                className="rounded-lg"
              />
            </div>
          </div>
        </div>

        {/* Restaurant Info Section */}
        <div>
          <h3 className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-4 pb-2 border-b border-gray-100">Restaurant Info</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Invoice Series Prefix <span className="text-red-500">*</span></label>
              <Input
                value={restaurantForm.invoice_series_prefix || ''}
                onChange={(e) => setRestaurantForm(p => ({ ...p, invoice_series_prefix: e.target.value }))}
                className="rounded-lg"
                disabled={!restaurantData}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Aggregator Series Prefix</label>
              <Input
                value={restaurantForm.aggregator_series_prefix || ''}
                onChange={(e) => setRestaurantForm(p => ({ ...p, aggregator_series_prefix: e.target.value }))}
                className="rounded-lg"
                disabled={!restaurantData}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700">Tax ID</label>
              <Input
                value={restaurantForm.tax_id || ''}
                onChange={(e) => setRestaurantForm(p => ({ ...p, tax_id: e.target.value }))}
                className="rounded-lg"
                disabled={!restaurantData}
              />
            </div>
            <div className="flex items-center space-x-2 pt-1">
              <Switch
                id="custom_no_taxes"
                checked={!!branchForm.custom_no_taxes}
                onCheckedChange={(checked) => setBranchForm(p => ({ ...p, custom_no_taxes: checked ? 1 : 0 }))}
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
                disabled={!restaurantData}
                placeholder="e.g. GST 5% - Restaurant"
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Menu Section */}
      <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setMenuSectionOpen(!menuSectionOpen)}
          className="w-full flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left"
        >
          <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">Menu</span>
          {menuSectionOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>
        {menuSectionOpen && (
          <div className="p-5 space-y-4">
            {restaurantData ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-gray-700">Default Menu (Active Menu)</label>
                    <Select
                      value={restaurantForm.active_menu || ''}
                      onChange={(e) => setRestaurantForm(p => ({ ...p, active_menu: e.target.value }))}
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
                              <Select className="w-full text-xs" value={row.room || row.ury_room || ''} onChange={e => {
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
                              <Select className="w-full text-xs" value={row.menu || row.ury_menu || ''} onChange={e => {
                                const newRows = [...restaurantForm.menu_for_room];
                                newRows[idx].menu = e.target.value;
                                newRows[idx].ury_menu = e.target.value;
                                setRestaurantForm({...restaurantForm, menu_for_room: newRows});
                              }}>
                                <option value="">Select Menu</option>
                                {menus.map(m => <option key={m.name} value={m.name}>{m.menu_name || m.name}</option>)}
                              </Select>
                              <button type="button" className="text-gray-400 hover:text-red-500 shrink-0" onClick={() => {
                                const newRows = restaurantForm.menu_for_room.filter((_:any, i:number) => i !== idx);
                                setRestaurantForm({...restaurantForm, menu_for_room: newRows});
                              }}><X className="w-4 h-4" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="p-2 border-t border-gray-100 bg-gray-50">
                      <Button type="button" variant="ghost" size="sm" className="text-primary h-7 text-xs" onClick={() => {
                        setRestaurantForm({...restaurantForm, menu_for_room: [...(restaurantForm.menu_for_room || []), {room: '', menu: ''}]});
                      }}>+ Add Row</Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">No URY Restaurant linked to this branch.</p>
            )}
          </div>
        )}
      </div>

      {/* Room Section */}
      <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setRoomSectionOpen(!roomSectionOpen)}
          className="w-full flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left"
        >
          <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">Room</span>
          {roomSectionOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>
        {roomSectionOpen && (
          <div className="p-5 space-y-4">
            {restaurantData ? (
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700">Default Room</label>
                <Select
                  value={restaurantForm.default_room || ''}
                  onChange={(e) => setRestaurantForm(p => ({ ...p, default_room: e.target.value }))}
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
        )}
      </div>

      {/* Order Type Menu Section */}
      <div className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
        <button
          onClick={() => setOrderTypeSectionOpen(!orderTypeSectionOpen)}
          className="w-full flex items-center justify-between p-4 border-b border-gray-100 hover:bg-gray-50 transition-colors text-left"
        >
          <span className="text-sm font-bold text-gray-700 uppercase tracking-wider">Order Type Menu</span>
          {orderTypeSectionOpen ? <ChevronDown className="w-4 h-4 text-gray-400" /> : <ChevronRight className="w-4 h-4 text-gray-400" />}
        </button>
        {orderTypeSectionOpen && (
          <div className="p-5 space-y-4">
            {restaurantData ? (
              <>
                <div className="flex items-center gap-2">
                  <Switch
                    id="order_type_wise_menu"
                    checked={!!restaurantForm.order_type_wise_menu}
                    onCheckedChange={(checked) => setRestaurantForm(p => ({ ...p, order_type_wise_menu: checked ? 1 : 0 }))}
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
                              <Input className="w-full text-xs" placeholder="e.g. Dine In" value={row.order_type || ''} onChange={e => {
                                const newRows = [...restaurantForm.order_type_menu];
                                newRows[idx].order_type = e.target.value;
                                setRestaurantForm({...restaurantForm, order_type_menu: newRows});
                              }} />
                            </td>
                            <td className="px-4 py-2 flex items-center gap-2">
                              <Select className="w-full text-xs" value={row.menu || row.ury_menu || ''} onChange={e => {
                                const newRows = [...restaurantForm.order_type_menu];
                                newRows[idx].menu = e.target.value;
                                newRows[idx].ury_menu = e.target.value;
                                setRestaurantForm({...restaurantForm, order_type_menu: newRows});
                              }}>
                                <option value="">Select Menu</option>
                                {menus.map(m => <option key={m.name} value={m.name}>{m.menu_name || m.name}</option>)}
                              </Select>
                              <button type="button" className="text-gray-400 hover:text-red-500 shrink-0" onClick={() => {
                                const newRows = restaurantForm.order_type_menu.filter((_:any, i:number) => i !== idx);
                                setRestaurantForm({...restaurantForm, order_type_menu: newRows});
                              }}><X className="w-4 h-4" /></button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className="p-2 border-t border-gray-100 bg-gray-50">
                      <Button type="button" variant="ghost" size="sm" className="text-primary h-7 text-xs" onClick={() => {
                        setRestaurantForm({...restaurantForm, order_type_menu: [...(restaurantForm.order_type_menu || []), {order_type: '', menu: ''}]});
                      }}>+ Add Row</Button>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">No URY Restaurant linked to this branch.</p>
            )}
          </div>
        )}
      </div>

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
              {saving ? <Spinner className="w-4 h-4 mr-1.5" /> : null} Save
            </Button>
          </div>
        </form>
      </SideDrawer>
    </div>
  );
};

export default BranchPage;
