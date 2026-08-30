import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { Plus, Store, Edit2 } from 'lucide-react';
import { Card, Button, Input, Spinner, showToast, Dialog, DialogContent, DialogHeader, DialogTitle } from '@ury/ui';
import { call } from '@ury/core';
import { SearchableSelect } from '../../components/common/SearchableSelect';

interface AggregatorSetting {
  name?: string;
  aggregator?: string;
  customer?: string;
  price_list?: string;
  mode_of_payment?: string;
  mode_of_payments?: string;
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
    mode_of_payment: '',
    mode_of_payments: ''
  });
  const [originalEditForm, setOriginalEditForm] = useState<AggregatorSetting>({
    aggregator: '',
    customer: '',
    price_list: '',
    mode_of_payment: '',
    mode_of_payments: ''
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

  const handleOpenAddModal = () => {
    setNewAggregatorName('');
    setIsAddOpen(true);
  };

  const handleCreateAggregator = async (e: React.FormEvent) => {
    e.preventDefault();
    const branchToUpdate = activeBranchId === 'all' ? branches[0]?.name : activeBranchId;
    if (!newAggregatorName || !branchToUpdate) return;
    
    setSaving(true);
    try {
      // 1. Automatically create/ensure Customer document exists
      await call('frappe.client.insert', {
        doc: {
          doctype: 'Customer',
          customer_name: newAggregatorName,
          customer_group: 'Commercial',
          territory: 'All Territories'
        }
      }).catch((e: any) => {
        const errorMessage = e?.message || e?.responseJSON?.message || String(e);
        const errorType = e?.exc_type || e?.responseJSON?.exc_type;
        if (errorType === 'DuplicateEntryError' || errorMessage.includes('already exists')) {
          console.log('Customer record already exists:', newAggregatorName);
        } else {
          throw e;
        }
      });

      // 2. Automatically create/ensure Price List document exists
      await call('frappe.client.insert', {
        doc: {
          doctype: 'Price List',
          price_list_name: newAggregatorName,
          selling: 1,
          currency: 'INR'
        }
      }).catch((e: any) => {
        const errorMessage = e?.message || e?.responseJSON?.message || String(e);
        const errorType = e?.exc_type || e?.responseJSON?.exc_type;
        if (errorType === 'DuplicateEntryError' || errorMessage.includes('already exists')) {
          console.log('Price List already exists:', newAggregatorName);
        } else {
          throw e;
        }
      });

      // 3. Automatically create/ensure Mode of Payment document exists
      await call('frappe.client.insert', {
        doc: {
          doctype: 'Mode of Payment',
          mode_of_payment: newAggregatorName,
          type: 'Bank'
        }
      }).catch((e: any) => {
        const errorMessage = e?.message || e?.responseJSON?.message || String(e);
        const errorType = e?.exc_type || e?.responseJSON?.exc_type;
        if (errorType === 'DuplicateEntryError' || errorMessage.includes('already exists')) {
          console.log('Mode of Payment already exists:', newAggregatorName);
        } else {
          throw e;
        }
      });

      // 4. Update Branch custom_aggregator_settings row with linked records
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
          mode_of_payments: newAggregatorName,
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

      await fetchBranchAggregators();
      await fetchDropdownOptions();
      setIsAddOpen(false);
      setNewAggregatorName('');
      showToast.success('Aggregator created successfully');
    } catch (err: any) {
      console.error('Failed to create aggregator:', err);
      const errorMessage = err?.message || err?.responseJSON?.message || String(err);
      showToast.error(`Failed to create aggregator: ${errorMessage}`);
    } finally {
      setSaving(false);
    }
  };

  const handleEditAggregator = (item: AggregatorSetting, idx: number) => {
    const aggName = item.aggregator || item.customer || item.name || '';
    const mop = item.mode_of_payments || item.mode_of_payment || '';
    const pl = item.price_list || '';

    setEditingIndex(idx);
    const initialForm = {
      aggregator: aggName,
      customer: aggName,
      price_list: pl,
      mode_of_payment: mop,
      mode_of_payments: mop
    };
    setEditForm(initialForm);
    setOriginalEditForm(initialForm);
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

    const original = {
      aggregator: (originalEditForm.aggregator || '').trim(),
      price_list: originalEditForm.price_list || '',
      mode_of_payment: originalEditForm.mode_of_payment || '',
    };
    const current = {
      aggregator: (editForm.aggregator || '').trim(),
      price_list: editForm.price_list || '',
      mode_of_payment: editForm.mode_of_payment || '',
    };
    if (JSON.stringify(original) === JSON.stringify(current)) {
      showToast.warning('No changes in document');
      return;
    }

    setSaving(true);
    try {
      // Ensure Customer exists if aggregator name changed
      await call('frappe.client.insert', {
        doc: {
          doctype: 'Customer',
          customer_name: editForm.aggregator,
          customer_group: 'Commercial',
          territory: 'All Territories'
        }
      }).catch((e: any) => {
        const errorMessage = e?.message || e?.responseJSON?.message || String(e);
        const errorType = e?.exc_type || e?.responseJSON?.exc_type;
        if (errorType === 'DuplicateEntryError' || errorMessage.includes('already exists')) {
          console.log('Customer record already exists:', editForm.aggregator);
        } else {
          throw e;
        }
      });

      const res = await call<any>('frappe.client.get', {
        doctype: 'Branch',
        name: branchToUpdate
      });
      const record = res.message || res;
      const currentList = [...(record.custom_aggregator_settings || [])];

      currentList[editingIndex] = {
        ...currentList[editingIndex],
        aggregator: editForm.aggregator,
        customer: editForm.aggregator,
        price_list: editForm.price_list || '',
        mode_of_payments: editForm.mode_of_payment || '',
        mode_of_payment: editForm.mode_of_payment || ''
      };

      await call('frappe.client.set_value', {
        doctype: 'Branch',
        name: branchToUpdate,
        fieldname: {
          custom_aggregator_settings: currentList
        }
      });

      showToast.success('Aggregator updated successfully');
      setEditingIndex(null);
      await fetchBranchAggregators();
      await fetchDropdownOptions();
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
      {/* Toolbar */}
      <div className="-mx-6 px-6 -mt-6 pt-6 pb-3 border-b border-border flex flex-col md:flex-row items-center justify-end gap-4">
        <Button
          onClick={handleOpenAddModal}
          className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
          disabled={!hasBranch}
        >
          <Plus className="w-4 h-4" />
          <span>Add Aggregator</span>
        </Button>
      </div>

      {/* List View */}
      {loading ? (
        <div className="py-16 flex items-center justify-center bg-card rounded-lg border border-border">
          <Spinner className="w-8 h-8 text-primary" />
        </div>
      ) : aggregators.length === 0 ? (
        <Card className="p-12 flex flex-col items-center justify-center text-center rounded-lg border border-border shadow-sm bg-card">
          <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mb-4">
            <Store className="w-6 h-6 text-primary" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-1">No Aggregators Found</h3>
          <p className="text-muted-foreground mb-6 max-w-sm">
            Add aggregators like Zomato, Swiggy to configure aggregator settings.
          </p>
          <Button
            onClick={handleOpenAddModal}
            className="bg-primary hover:bg-primary/90 text-white font-semibold flex items-center space-x-1.5 shadow-xs"
            disabled={!hasBranch}
          >
            <Plus className="w-4 h-4" />
            <span>Add Aggregator</span>
          </Button>
        </Card>
      ) : (
        <div className="bg-card rounded-lg border border-border shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm text-muted-foreground">
            <thead className="bg-card border-b border-border text-xs uppercase text-muted-foreground font-semibold">
              <tr>
                <th className="px-6 py-4">Aggregator</th>
                <th className="px-6 py-4">Price List</th>
                <th className="px-6 py-4">Mode of Payment</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {aggregators.map((item, idx) => {
                const name = item.aggregator || item.customer || item.name || '-';
                const pl = item.price_list || '-';
                const mop = item.mode_of_payments || item.mode_of_payment || '-';
                return (
                  <tr key={idx} className="hover:bg-primary/10 transition-colors">
                    <td className="px-6 py-4 font-semibold text-foreground">{name}</td>
                    <td className="px-6 py-4">{pl}</td>
                    <td className="px-6 py-4">{mop}</td>
                    <td className="px-6 py-4 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleEditAggregator(item, idx)}
                        className="text-muted-foreground hover:text-primary p-1.5 h-8 w-8"
                        title="Edit Aggregator"
                      >
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

      {/* Add Modal */}
      <Dialog open={isAddOpen} onOpenChange={(open) => !open && setIsAddOpen(false)}>
        <DialogContent className="max-w-md bg-card p-6 rounded-xl border border-border shadow-xl" onClose={() => setIsAddOpen(false)}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">Add Aggregator</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateAggregator} className="space-y-4 text-sm mt-4">
            <div>
              <label className="block font-semibold text-foreground mb-1.5">
                Aggregator Name <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder="e.g. Swiggy, Zomato"
                value={newAggregatorName}
                onChange={(e) => setNewAggregatorName(e.target.value)}
                required
              />
            </div>

            <div className="pt-6 flex justify-end gap-3 border-t mt-6 border-border">
              <Button type="button" variant="outline" onClick={() => setIsAddOpen(false)} disabled={saving} className="font-semibold">
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed">
                <span>Save</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Edit Modal */}
      <Dialog open={editingIndex !== null} onOpenChange={(open) => !open && setEditingIndex(null)}>
        <DialogContent className="max-w-md bg-card p-6 rounded-xl border border-border shadow-xl" onClose={() => setEditingIndex(null)}>
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-foreground">Edit Aggregator</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveEdit} className="space-y-4 text-sm mt-4">
            <div>
              <label className="block font-semibold text-foreground mb-1.5">
                Aggregator Name <span className="text-red-500">*</span>
              </label>
              <Input
                value={editForm.aggregator}
                onChange={(e) => setEditForm(p => ({ ...p, aggregator: e.target.value, customer: e.target.value }))}
                required
              />
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1.5">Price List</label>
              <SearchableSelect
                id="edit_price_list"
                value={editForm.price_list || ''}
                onChange={(_, val) => setEditForm(p => ({ ...p, price_list: val }))}
                options={[
                  { value: '', label: 'Select Price List...' },
                  ...priceLists.map(pl => ({ value: pl.name, label: pl.name }))
                ]}
                placeholder="Select Price List..."
              />
            </div>

            <div>
              <label className="block font-semibold text-foreground mb-1.5">Mode of Payment</label>
              <SearchableSelect
                id="edit_mode_of_payment"
                value={editForm.mode_of_payment || ''}
                onChange={(_, val) => setEditForm(p => ({ ...p, mode_of_payment: val, mode_of_payments: val }))}
                options={[
                  { value: '', label: 'Select Mode of Payment...' },
                  ...modesOfPayment.map(mop => ({ value: mop.name, label: mop.name }))
                ]}
                placeholder="Select Mode of Payment..."
              />
            </div>

            <div className="pt-6 flex justify-end gap-3 border-t mt-6 border-border">
              <Button type="button" variant="outline" onClick={() => setEditingIndex(null)} disabled={saving} className="font-semibold">
                Cancel
              </Button>
              <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white font-semibold shadow-xs disabled:opacity-50 disabled:cursor-not-allowed">
                <span>Save</span>
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AggregatorPage;
