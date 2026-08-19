import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Plus, Store, Edit2, X } from 'lucide-react';
import { Card, Button, Input, Select, Spinner, showToast } from '@ury/ui';
import { call } from '@ury/core';

interface AggregatorSetting {
  name?: string;
  aggregator: string;
  customer: string;
  price_list: string;
  mode_of_payment: string;
}

export const AggregatorPage: React.FC = () => {
  const { activeBranchId, branches } = useBranchContext();
  const [aggregators, setAggregators] = useState<AggregatorSetting[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  const [isAddOpen, setIsAddOpen] = useState<boolean>(false);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const [newAggregatorName, setNewAggregatorName] = useState('');
  const [editForm, setEditForm] = useState<AggregatorSetting>({
    aggregator: '',
    customer: '',
    price_list: '',
    mode_of_payment: ''
  });

  const [priceLists, setPriceLists] = useState<{ name: string }[]>([]);
  const [modesOfPayment, setModesOfPayment] = useState<{ name: string }[]>([]);

  const fetchBranchAggregators = async () => {
    const branchToFetch = activeBranchId === 'all' ? branches[0]?.name : activeBranchId;
    if (!branchToFetch) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const res = await call<any>('frappe.client.get', {
        doctype: 'Branch',
        name: branchToFetch
      });
      const record = res.message || res;
      setAggregators(record.custom_aggregator_settings || []);
    } catch (err) {
      console.error('Failed to fetch aggregators:', err);
      setAggregators([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchDropdownOptions = async () => {
    try {
      const [plRes, mopRes] = await Promise.all([
        call<any>('frappe.client.get_list', { doctype: 'Price List', fields: ['name'], limit_page_length: 100 }),
        call<any>('frappe.client.get_list', { doctype: 'Mode of Payment', fields: ['name'], limit_page_length: 100 })
      ]);
      setPriceLists(plRes.message || plRes || []);
      setModesOfPayment(mopRes.message || mopRes || []);
    } catch (e) {
      console.error('Failed to load dropdown options:', e);
    }
  };

  useEffect(() => {
    if (branches.length > 0) {
      fetchBranchAggregators();
      fetchDropdownOptions();
    } else {
      setLoading(false);
    }
  }, [activeBranchId, branches]);

  const handleCreateAggregator = async (e: React.FormEvent) => {
    e.preventDefault();
    const branchToUpdate = activeBranchId === 'all' ? branches[0]?.name : activeBranchId;
    if (!newAggregatorName || !branchToUpdate) return;
    
    setSaving(true);
    try {
      // 1. Create Customer
      await call('frappe.client.insert', {
        doc: { doctype: 'Customer', customer_name: newAggregatorName, customer_group: 'Commercial', territory: 'All Territories' }
      }).catch((e: any) => {
        const errorMessage = e?.message || e?.responseJSON?.message || String(e);
        const errorType = e?.exc_type || e?.responseJSON?.exc_type;
        if (errorType === 'DuplicateEntryError' || errorMessage.includes('already exists')) {
          console.log('Customer might already exist', e);
        } else {
          throw e;
        }
      });

      // 2. Create Price List
      await call('frappe.client.insert', {
        doc: { doctype: 'Price List', price_list_name: newAggregatorName, selling: 1, currency: 'INR' }
      }).catch((e: any) => {
        const errorMessage = e?.message || e?.responseJSON?.message || String(e);
        const errorType = e?.exc_type || e?.responseJSON?.exc_type;
        if (errorType === 'DuplicateEntryError' || errorMessage.includes('already exists')) {
          console.log('Price List might already exist', e);
        } else {
          throw e;
        }
      });

      // 3. Create Mode of Payment
      await call('frappe.client.insert', {
        doc: { doctype: 'Mode of Payment', mode_of_payment: newAggregatorName, type: 'Bank' }
      }).catch((e: any) => {
        const errorMessage = e?.message || e?.responseJSON?.message || String(e);
        const errorType = e?.exc_type || e?.responseJSON?.exc_type;
        if (errorType === 'DuplicateEntryError' || errorMessage.includes('already exists')) {
          console.log('Mode of Payment might already exist', e);
        } else {
          throw e;
        }
      });

      // 4. Update Branch child table
      const res = await call<any>('frappe.client.get', {
        doctype: 'Branch',
        name: branchToUpdate
      });
      const record = res.message || res;

      const updatedAggregators = [
        ...(record.custom_aggregator_settings || []),
        {
          aggregator: newAggregatorName,
          customer: newAggregatorName,
          price_list: newAggregatorName,
          mode_of_payment: newAggregatorName
        }
      ];

      await call('frappe.client.set_value', {
        doctype: 'Branch',
        name: branchToUpdate,
        fieldname: {
          custom_aggregator_settings: updatedAggregators
        }
      });

      fetchBranchAggregators();
      fetchDropdownOptions();
      setIsAddOpen(false);
      setNewAggregatorName('');
      showToast.success('Aggregator created');
    } catch (err: any) {
      console.error('Failed to create aggregator setup:', err);
      const errorMessage = err?.message || err?.responseJSON?.message || String(err);
      showToast.error(`Failed to create aggregator: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEditAggregator = (item: AggregatorSetting, idx: number) => {
    setEditingIndex(idx);
    setEditForm({
      aggregator: item.aggregator || item.customer || item.price_list || '',
      customer: item.customer || item.aggregator || '',
      price_list: item.price_list || item.aggregator || '',
      mode_of_payment: item.mode_of_payment || item.aggregator || ''
    });
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingIndex === null) return;
    const branchToUpdate = activeBranchId === 'all' ? branches[0]?.name : activeBranchId;
    if (!branchToUpdate) return;

    if (!editForm.aggregator || !editForm.aggregator.trim()) {
      showToast.error('Aggregator Name is required');
      return;
    }

    setSaving(true);
    try {
      const res = await call<any>('frappe.client.get', {
        doctype: 'Branch',
        name: branchToUpdate
      });
      const record = res.message || res;
      const currentList = [...(record.custom_aggregator_settings || [])];

      currentList[editingIndex] = {
        ...currentList[editingIndex],
        aggregator: editForm.aggregator,
        customer: editForm.customer || editForm.aggregator,
        price_list: editForm.price_list || editForm.aggregator,
        mode_of_payment: editForm.mode_of_payment || editForm.aggregator
      };

      await call('frappe.client.set_value', {
        doctype: 'Branch',
        name: branchToUpdate,
        fieldname: {
          custom_aggregator_settings: currentList
        }
      });

      showToast.success('Aggregator updated');
      setEditingIndex(null);
      fetchBranchAggregators();
    } catch (err: any) {
      console.error('Failed to update aggregator:', err);
      showToast.error(err?.message || 'Failed to update aggregator');
    } finally {
      setSaving(false);
    }
  };

  const hasBranch = branches.length > 0;

  return (
    <div className="space-y-6">
      {/* Toolbar & Filters */}
      <Card className="p-4 rounded-lg border border-gray-200 bg-white shadow-xs">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="font-semibold text-gray-700">Aggregator Settings</div>
          <div className="flex items-center space-x-3 w-full md:w-auto">
            <Button
              onClick={() => setIsAddOpen(true)}
              className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
              disabled={!hasBranch}
            >
              <Plus className="w-4 h-4" />
              <span>Add Aggregator</span>
            </Button>
          </div>
        </div>
      </Card>

      {/* List View */}
      {loading ? (
        <div className="py-16 flex items-center justify-center bg-white rounded-lg border border-gray-200">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : aggregators.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-gray-200 shadow-sm bg-white">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Store className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-1">No Aggregators Found</h3>
          <p className="text-gray-500 mb-6 max-w-sm">
            Add aggregators like Zomato, Swiggy to automatically create customer, pricelist, and payment modes.
          </p>
          <Button
            onClick={() => setIsAddOpen(true)}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
            disabled={!hasBranch}
          >
            <Plus className="w-4 h-4" />
            <span>Add Aggregator</span>
          </Button>
        </Card>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 border-b border-gray-100 text-xs uppercase text-gray-500 font-semibold">
              <tr>
                <th className="px-6 py-4">Aggregator</th>
                <th className="px-6 py-4">Price List</th>
                <th className="px-6 py-4">Mode of Payment</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {aggregators.map((item, idx) => (
                <tr key={idx} className="hover:bg-gray-50/50 transition-colors">
                  <td className="px-6 py-4 font-semibold text-gray-900">
                    {item.aggregator || item.customer || item.price_list || '-'}
                  </td>
                  <td className="px-6 py-4">{item.price_list || '-'}</td>
                  <td className="px-6 py-4">{item.mode_of_payment || '-'}</td>
                  <td className="px-6 py-4 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleEditAggregator(item, idx)}
                      className="text-gray-500 hover:text-primary p-1.5 h-8 w-8"
                      title="Edit Aggregator"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {isAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md bg-white rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Add Aggregator</h2>
              <button
                onClick={() => setIsAddOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateAggregator} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Aggregator Name <span className="text-red-500">*</span></label>
                <Input
                  placeholder="e.g. Swiggy, Zomato"
                  value={newAggregatorName}
                  onChange={(e) => setNewAggregatorName(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  This will automatically create a Customer, Price List, and Mode of Payment with this name.
                </p>
              </div>
              
              <div className="pt-6 flex justify-end gap-2 border-t mt-4 border-gray-100">
                <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
                  Create Aggregator
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Edit Modal */}
      {editingIndex !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md bg-white rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Edit Aggregator</h2>
              <button
                onClick={() => setEditingIndex(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Aggregator Name <span className="text-red-500">*</span></label>
                <Input
                  value={editForm.aggregator}
                  onChange={(e) => setEditForm(p => ({ ...p, aggregator: e.target.value }))}
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Price List</label>
                {priceLists.length > 0 ? (
                  <Select
                    value={editForm.price_list}
                    onChange={(e) => setEditForm(p => ({ ...p, price_list: e.target.value }))}
                  >
                    <option value="">Select Price List</option>
                    {priceLists.map(pl => (
                      <option key={pl.name} value={pl.name}>{pl.name}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={editForm.price_list}
                    onChange={(e) => setEditForm(p => ({ ...p, price_list: e.target.value }))}
                  />
                )}
              </div>

              <div>
                <label className="block font-semibold text-gray-700 mb-1">Mode of Payment</label>
                {modesOfPayment.length > 0 ? (
                  <Select
                    value={editForm.mode_of_payment}
                    onChange={(e) => setEditForm(p => ({ ...p, mode_of_payment: e.target.value }))}
                  >
                    <option value="">Select Mode of Payment</option>
                    {modesOfPayment.map(mop => (
                      <option key={mop.name} value={mop.name}>{mop.name}</option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    value={editForm.mode_of_payment}
                    onChange={(e) => setEditForm(p => ({ ...p, mode_of_payment: e.target.value }))}
                  />
                )}
              </div>
              
              <div className="pt-6 flex justify-end gap-2 border-t mt-4 border-gray-100">
                <Button type="button" variant="outline" onClick={() => setEditingIndex(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
                  Save
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};

export default AggregatorPage;
