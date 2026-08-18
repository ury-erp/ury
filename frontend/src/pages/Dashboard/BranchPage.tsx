import React, { useState, useEffect, useRef } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Save, ChevronDown, ChevronRight, Plus, X, Edit2, Utensils, Eye } from 'lucide-react';
import { Card, Button, Input, Select, Spinner, showToast, Badge } from '@ury/ui';
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
}

export const BranchPage: React.FC = () => {
  const { branches, setBranches } = useBranchContext();
  const [branchData, setBranchData] = useState<BranchData | null>(null);
  const [restaurantData, setRestaurantData] = useState<RestaurantData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Branch form fields
  const [branchForm, setBranchForm] = useState<Record<string, string>>({});
  // Restaurant form fields
  const [restaurantForm, setRestaurantForm] = useState<Record<string, any>>({});

  // Local selection state for List vs Detail view
  const [selectedListBranch, setSelectedListBranch] = useState<string | null>(null);
  const [isReadOnly, setIsReadOnly] = useState<boolean>(false);

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
  const [allRestaurants, setAllRestaurants] = useState<any[]>([]);
  const [companies, setCompanies] = useState<any[]>([]);

  const fetchCompanies = async () => {
    try {
      const res = await call<any>('frappe.client.get_list', { doctype: 'Company', fields: ['name'] });
      setCompanies(res.message || res || []);
    } catch (e) {}
  };

  const fetchRestaurants = async () => {
    try {
      const res = await call<any>('frappe.client.get_list', {
        doctype: 'URY Restaurant',
        fields: ['name', 'branch', 'active_menu', 'invoice_series_prefix']
      });
      setAllRestaurants(res.message || res || []);
    } catch (e) {}
  };

  useEffect(() => {
    fetchCompanies();
    fetchRestaurants();
  }, []);

  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const roomName = `Main Dining - ${addForm.branchName}`;
      await call('ury.ury.api.minimal.business_setup.create_branch', {
        branch_name: addForm.branchName,
        company: addForm.company,
        invoice_prefix: addForm.invoicePrefix,
        aggregator_prefix: addForm.aggregatorPrefix,
        default_room_name: roomName
      });
      showToast.success('Branch created successfully');
      setIsAddDrawerOpen(false);
      try {
        const branchRes = await call<any>('ury.ury.api.minimal.business_setup.get_branches');
        if (branchRes) {
          if (Array.isArray(branchRes)) {
            setBranches(branchRes);
          } else if (branchRes.message && Array.isArray(branchRes.message)) {
            setBranches(branchRes.message);
          }
        }
      } catch (err) {
        console.error('Failed to refresh branches:', err);
      }
    } catch (err: any) {
      let errorMsg = 'Failed to create Branch';
      if (err?.messages) {
        try { errorMsg = JSON.parse(err.messages)[0]; } catch(e) {}
      } else if (err?.message) {
        errorMsg = err.message;
      } else if (err?.exc_type) {
        errorMsg = err.exc_type;
      }
      showToast.error(errorMsg);
    } finally {
      setSaving(false);
    }
  };

  const branchToFetch = selectedListBranch;

  const lastFetchedBranchRef = useRef<string | null>(null);

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

  const fetchDetails = async (showLoader = true, overrideBranchName?: string) => {
    const branchToFetch = overrideBranchName || selectedListBranch;
    if (!branchToFetch) {
      if (showLoader) setLoading(false);
      return;
    }
    if (showLoader) setLoading(true);
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
        address: '',
      });

      // Try fetch URY Restaurant linked to this branch
      try {
        const restaurantList = await call<any>('frappe.client.get_list', {
          doctype: 'URY Restaurant',
          filters: [['branch', '=', branchToFetch]],
          fields: ['name', 'company', 'invoice_series_prefix', 'aggregator_series_prefix',
            'address', 'active_menu', 'default_room', 'room_wise_menu',
            'order_type_wise_menu', 'menu_for_room', 'order_type_menu'],
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
            menu_for_room: restaurant.menu_for_room ? [...restaurant.menu_for_room] : [],
            order_type_menu: restaurant.order_type_menu ? [...restaurant.order_type_menu] : [],
          });
          setBranchForm(p => ({
            ...p,
            address: restaurant.address || '',
          }));
        } else {
          setRestaurantData(null);
          setRestaurantForm({
            invoice_series_prefix: '', aggregator_series_prefix: '', tax_id: '',
            active_menu: '', default_room: '', room_wise_menu: 0, order_type_wise_menu: 0,
            menu_for_room: [], order_type_menu: []
          });
        }
      } catch (err) {
        console.error('Failed to fetch restaurant details:', err);
      }
    } catch (err) {
      console.error('Failed to fetch branch details:', err);
    } finally {
      if (showLoader) setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedListBranch && branches.length > 0) {
      if (lastFetchedBranchRef.current !== selectedListBranch) {
        fetchLinkedData();
        fetchDetails();
        lastFetchedBranchRef.current = selectedListBranch;
      }
    } else if (!selectedListBranch) {
      setLoading(false);
      lastFetchedBranchRef.current = null;
    }
  }, [selectedListBranch, branches]);

  const handleSave = async () => {
    if (!branchToFetch) return;
    setSaving(true);
    try {
      let updatedBranchName = branchToFetch;

      // 1. Rename branch if changed
      if (branchForm.branch_name && branchForm.branch_name !== branchToFetch) {
        await call('frappe.client.rename_doc', {
          doctype: 'Branch',
          old_name: branchToFetch,
          new_name: branchForm.branch_name
        });
        updatedBranchName = branchForm.branch_name;
        setSelectedListBranch(updatedBranchName);
        lastFetchedBranchRef.current = updatedBranchName;
      }

      // Save URY Restaurant fields if it exists
      if (restaurantData) {
        const updatedDoc = {
          ...restaurantData,
          branch: updatedBranchName, // Fix branch reference after rename
          invoice_series_prefix: restaurantForm.invoice_series_prefix,
          aggregator_series_prefix: restaurantForm.aggregator_series_prefix,
          tax_id: restaurantForm.tax_id,
          address: branchForm.address, // Save address on restaurant document
          active_menu: restaurantForm.active_menu,
          default_room: restaurantForm.default_room,
          room_wise_menu: restaurantForm.room_wise_menu,
          order_type_wise_menu: restaurantForm.order_type_wise_menu,
          menu_for_room: restaurantForm.menu_for_room || restaurantData.menu_for_room || [],
          order_type_menu: restaurantForm.order_type_menu || restaurantData.order_type_menu || [],
        };
        await call('frappe.client.save', {
          doc: updatedDoc
        });
      }

      // Update the branch list state silently in background
      call<any>('ury.ury.api.minimal.business_setup.get_branches')
        .then(branchRes => {
          if (branchRes) {
            if (Array.isArray(branchRes)) setBranches(branchRes);
            else if (branchRes.message && Array.isArray(branchRes.message)) setBranches(branchRes.message);
          }
        })
        .catch(err => console.error('Failed to refresh branches:', err));

      // Fetch the updated details silently without triggering loading spinner
      fetchDetails(false, updatedBranchName).catch(err => console.error('Failed to fetch details:', err));

      // Return to View mode immediately after initiating updates
      setIsReadOnly(true);
      showToast.success('Branch updated successfully');

    } catch (err) {
      console.error('Failed to update branch:', err);
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

  // Removing early return so list view is always visible even when empty
  if (!selectedListBranch) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-end pb-3 border-b border-gray-200 -mx-6 px-6 -mt-6 pt-6">
          <Button
            onClick={() => setIsAddDrawerOpen(true)}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
          >
            <Plus className="w-4 h-4 mr-1.5" />
            <span>Add Branch</span>
          </Button>
        </div>

        {branches.length === 0 ? (
          <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-gray-200 shadow-sm bg-white">
            <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <Plus className="w-6 h-6 text-primary" />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">No Branches Configured</h3>
            <p className="text-gray-500 mb-6 max-w-sm">
              Add branches to organize your operations across different locations.
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
                  <th className="px-6 py-4">Branch Name</th>
                  <th className="px-6 py-4">Menu</th>
                  <th className="px-6 py-4">Invoice Prefix</th>
                  <th className="px-6 py-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {branches.map(branch => {
                  const rest = allRestaurants.find(r => r.branch === branch.id || r.branch === branch.name);
                  return (
                    <tr key={branch.id} className="hover:bg-primary/10 transition-colors">
                      <td className="px-6 py-4 font-semibold text-gray-900">{branch.name}</td>
                      <td className="px-6 py-4">
                        {rest?.active_menu ? (
                          <Badge variant="outline" className="border-primary/20 bg-primary/10 text-primary text-[10px]">
                            <Utensils className="w-3 h-3 mr-1" />
                            {rest.active_menu}
                          </Badge>
                        ) : (
                          <span className="text-gray-400 italic text-xs">No menu</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-mono text-xs">{rest?.invoice_series_prefix || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <Button variant="ghost" size="sm" onClick={(e: any) => { e.stopPropagation(); setSelectedListBranch(branch.id); setIsReadOnly(true); }} className="text-gray-500 hover:text-primary">
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button variant="ghost" size="sm" onClick={(e: any) => { e.stopPropagation(); setSelectedListBranch(branch.id); setIsReadOnly(false); }} className="text-gray-500 hover:text-primary">
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
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
              <Select required value={addForm.company} onChange={(e: any) => setAddForm({...addForm, company: e.target.value})}>
                <option value="">Select Company</option>
                {companies.map((c: any) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">Invoice Prefix <span className="text-red-500">*</span></label>
                <Input required value={addForm.invoicePrefix} onChange={(e: any) => setAddForm({...addForm, invoicePrefix: e.target.value})} />
              </div>
              <div>
                <label className="block font-semibold text-gray-700 mb-1.5">Aggregator Prefix <span className="text-red-500">*</span></label>
                <Input required value={addForm.aggregatorPrefix} onChange={(e: any) => setAddForm({...addForm, aggregatorPrefix: e.target.value})} />
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
  }

  return (
    <div className="space-y-6">

      {/* Header and Actions */}
      <div className="flex items-center justify-between pb-3 border-b border-gray-200 -mx-6 px-6 -mt-6 pt-6">
        <Button
          variant="ghost"
          onClick={() => { setSelectedListBranch(null); setRestaurantData(null); setBranchData(null); }}
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
              onClick={handleSave}
              disabled={saving || !hasBranch}
              className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center justify-center space-x-1.5 shadow-xs min-w-[100px]"
            >
              <Save className="w-4 h-4" />
              <span>Save</span>
            </Button>
          )}
        </div>
      </div>

      {/* Branch Details */}
      <Card className="p-6 rounded-lg border-gray-200 bg-white shadow-sm">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Branch Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Branch Name</label>
            <Input
              value={branchForm.branch_name || ''}
              onChange={(e) => setBranchForm(p => ({ ...p, branch_name: e.target.value }))}
              disabled={isReadOnly}
              className={`rounded-lg ${isReadOnly ? 'bg-gray-50' : ''}`}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Invoice Series Prefix <span className="text-red-500">*</span></label>
            <Input
              value={restaurantForm.invoice_series_prefix || ''}
              onChange={(e) => setRestaurantForm(p => ({ ...p, invoice_series_prefix: e.target.value }))}
              className="rounded-lg"
              disabled={!restaurantData || isReadOnly}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Aggregator Series Prefix</label>
            <Input
              value={restaurantForm.aggregator_series_prefix || ''}
              onChange={(e) => setRestaurantForm(p => ({ ...p, aggregator_series_prefix: e.target.value }))}
              className="rounded-lg"
              disabled={!restaurantData || isReadOnly}
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Tax ID</label>
            <Input
              value={restaurantForm.tax_id || ''}
              onChange={(e) => setRestaurantForm(p => ({ ...p, tax_id: e.target.value }))}
              className="rounded-lg"
              disabled={!restaurantData || isReadOnly}
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Address</label>
            <Input
              value={branchForm.address || ''}
              onChange={(e) => setBranchForm(p => ({ ...p, address: e.target.value }))}
              className="rounded-lg"
              disabled={isReadOnly}
            />
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
                      disabled={isReadOnly}
                    >
                      <option value="">None</option>
                      {menus.map((m) => (
                        <option key={m.name} value={m.name}>{m.menu_name || m.name}</option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input
                      type="checkbox"
                      id="room_wise_menu"
                      checked={!!restaurantForm.room_wise_menu}
                      onChange={(e) => setRestaurantForm(p => ({ ...p, room_wise_menu: e.target.checked ? 1 : 0 }))}
                      className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                      disabled={isReadOnly}
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
                              <Select className="w-full text-xs" disabled={isReadOnly} value={row.room || row.ury_room || ''} onChange={e => {
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
                              <Select className="w-full text-xs" disabled={isReadOnly} value={row.menu || row.ury_menu || ''} onChange={e => {
                                const newRows = [...restaurantForm.menu_for_room];
                                newRows[idx].menu = e.target.value;
                                newRows[idx].ury_menu = e.target.value;
                                setRestaurantForm({...restaurantForm, menu_for_room: newRows});
                              }}>
                                <option value="">Select Menu</option>
                                {menus.map(m => <option key={m.name} value={m.name}>{m.menu_name || m.name}</option>)}
                              </Select>
                              {!isReadOnly && (
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
                    {!isReadOnly && (
                      <div className="p-2 border-t border-gray-100 bg-gray-50">
                        <Button type="button" variant="ghost" size="sm" className="text-primary h-7 text-xs" onClick={() => {
                          setRestaurantForm({...restaurantForm, menu_for_room: [...(restaurantForm.menu_for_room || []), {room: '', menu: ''}]});
                        }}>+ Add Row</Button>
                      </div>
                    )}
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
                  disabled={isReadOnly}
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
                  <input
                    type="checkbox"
                    id="order_type_wise_menu"
                    checked={!!restaurantForm.order_type_wise_menu}
                    onChange={(e) => setRestaurantForm(p => ({ ...p, order_type_wise_menu: e.target.checked ? 1 : 0 }))}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                    disabled={isReadOnly}
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
                              <Input className="w-full text-xs" disabled={isReadOnly} placeholder="e.g. Dine In" value={row.order_type || ''} onChange={e => {
                                const newRows = [...restaurantForm.order_type_menu];
                                newRows[idx].order_type = e.target.value;
                                setRestaurantForm({...restaurantForm, order_type_menu: newRows});
                              }} />
                            </td>
                            <td className="px-4 py-2 flex items-center gap-2">
                              <Select className="w-full text-xs" disabled={isReadOnly} value={row.menu || row.ury_menu || ''} onChange={e => {
                                const newRows = [...restaurantForm.order_type_menu];
                                newRows[idx].menu = e.target.value;
                                newRows[idx].ury_menu = e.target.value;
                                setRestaurantForm({...restaurantForm, order_type_menu: newRows});
                              }}>
                                <option value="">Select Menu</option>
                                {menus.map(m => <option key={m.name} value={m.name}>{m.menu_name || m.name}</option>)}
                              </Select>
                              {!isReadOnly && (
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
                    {!isReadOnly && (
                      <div className="p-2 border-t border-gray-100 bg-gray-50">
                        <Button type="button" variant="ghost" size="sm" className="text-primary h-7 text-xs" onClick={() => {
                          setRestaurantForm({...restaurantForm, order_type_menu: [...(restaurantForm.order_type_menu || []), {order_type: '', menu: ''}]});
                        }}>+ Add Row</Button>
                      </div>
                    )}
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
