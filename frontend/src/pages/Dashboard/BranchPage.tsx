import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Save, ChevronDown, ChevronRight } from 'lucide-react';
import { Card, Button, Input, Select, Spinner } from '@ury/ui';
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
  const { activeBranch, activeBranchId, branches } = useBranchContext();
  const [branchData, setBranchData] = useState<BranchData | null>(null);
  const [restaurantData, setRestaurantData] = useState<RestaurantData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  // Branch form fields
  const [branchForm, setBranchForm] = useState<Record<string, string>>({});
  // Restaurant form fields
  const [restaurantForm, setRestaurantForm] = useState<Record<string, any>>({});

  // Linked data
  const [menus, setMenus] = useState<{ name: string; menu_name?: string }[]>([]);
  const [rooms, setRooms] = useState<{ name: string; room_name?: string }[]>([]);

  // Section expand states
  const [menuSectionOpen, setMenuSectionOpen] = useState(true);
  const [roomSectionOpen, setRoomSectionOpen] = useState(true);
  const [orderTypeSectionOpen, setOrderTypeSectionOpen] = useState(true);

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
        invoice_series_prefix: branch.invoice_series_prefix || '',
        aggregator_series_prefix: branch.aggregator_series_prefix || '',
        tax_id: branch.tax_id || '',
        address: branch.address || '',
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
            active_menu: restaurant.active_menu || '',
            default_room: restaurant.default_room || '',
            room_wise_menu: restaurant.room_wise_menu || 0,
            order_type_wise_menu: restaurant.order_type_wise_menu || 0,
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
    setSaving(true);
    try {
      // Save Branch fields
      await call('frappe.client.set_value', {
        doctype: 'Branch',
        name: branchToFetch,
        fieldname: {
          invoice_series_prefix: branchForm.invoice_series_prefix,
          aggregator_series_prefix: branchForm.aggregator_series_prefix,
          tax_id: branchForm.tax_id,
          address: branchForm.address,
        },
      });

      // Save URY Restaurant fields if it exists
      if (restaurantData) {
        await call('frappe.client.set_value', {
          doctype: 'URY Restaurant',
          name: restaurantData.name,
          fieldname: {
            active_menu: restaurantForm.active_menu,
            default_room: restaurantForm.default_room,
            room_wise_menu: restaurantForm.room_wise_menu,
            order_type_wise_menu: restaurantForm.order_type_wise_menu,
          },
        });
      }
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
      <div className="flex items-center justify-end pb-3 border-b border-gray-200">
        <Button
          onClick={handleSave}
          disabled={saving || !hasBranch}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center gap-1.5 shadow-xs"
        >
          {saving ? <Spinner className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          <span>Save Settings</span>
        </Button>
      </div>

      {/* Branch Details */}
      <Card className="p-6 rounded-lg border border-gray-200 bg-white shadow-sm">
        <h2 className="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">Branch Details</h2>
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
            <label className="text-sm font-medium text-gray-700">Invoice Series Prefix <span className="text-red-500">*</span></label>
            <Input
              value={branchForm.invoice_series_prefix || ''}
              onChange={(e) => setBranchForm(p => ({ ...p, invoice_series_prefix: e.target.value }))}
              className="rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Aggregator Series Prefix</label>
            <Input
              value={branchForm.aggregator_series_prefix || ''}
              onChange={(e) => setBranchForm(p => ({ ...p, aggregator_series_prefix: e.target.value }))}
              className="rounded-lg"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700">Tax ID</label>
            <Input
              value={branchForm.tax_id || ''}
              onChange={(e) => setBranchForm(p => ({ ...p, tax_id: e.target.value }))}
              className="rounded-lg"
            />
          </div>
          <div className="space-y-2 md:col-span-2">
            <label className="text-sm font-medium text-gray-700">Address</label>
            <Input
              value={branchForm.address || ''}
              onChange={(e) => setBranchForm(p => ({ ...p, address: e.target.value }))}
              className="rounded-lg"
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
                    />
                    <label htmlFor="room_wise_menu" className="text-sm font-medium text-gray-700 cursor-pointer">
                      Room Wise Menu
                    </label>
                  </div>
                </div>
                {restaurantData.menu_for_room && restaurantData.menu_for_room.length > 0 && (
                  <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-xs text-gray-600">
                      <thead className="bg-gray-50 border-b border-gray-100 font-semibold">
                        <tr>
                          <th className="px-4 py-2 text-left">Room</th>
                          <th className="px-4 py-2 text-left">Menu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {restaurantData.menu_for_room.map((row: any, idx: number) => (
                          <tr key={idx}>
                            <td className="px-4 py-2">{row.room || row.ury_room || '-'}</td>
                            <td className="px-4 py-2">{row.menu || row.ury_menu || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
                  <input
                    type="checkbox"
                    id="order_type_wise_menu"
                    checked={!!restaurantForm.order_type_wise_menu}
                    onChange={(e) => setRestaurantForm(p => ({ ...p, order_type_wise_menu: e.target.checked ? 1 : 0 }))}
                    className="w-4 h-4 text-primary border-gray-300 rounded focus:ring-primary"
                  />
                  <label htmlFor="order_type_wise_menu" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Order Type Wise Menu
                  </label>
                </div>
                {restaurantData.order_type_menu && restaurantData.order_type_menu.length > 0 && (
                  <div className="mt-3 rounded-lg border border-gray-200 overflow-hidden">
                    <table className="w-full text-xs text-gray-600">
                      <thead className="bg-gray-50 border-b border-gray-100 font-semibold">
                        <tr>
                          <th className="px-4 py-2 text-left">Order Type</th>
                          <th className="px-4 py-2 text-left">Menu</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {restaurantData.order_type_menu.map((row: any, idx: number) => (
                          <tr key={idx}>
                            <td className="px-4 py-2">{row.order_type || '-'}</td>
                            <td className="px-4 py-2">{row.menu || row.ury_menu || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-gray-400">No URY Restaurant linked to this branch.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default BranchPage;
