import React, { useState, useEffect } from 'react';
import { useBranchContext } from '../../context/BranchContext';
import { RefreshCw, Plus, Store } from 'lucide-react';
import { Card, Button, Input, Spinner, showToast } from '@ury/ui';
import { call } from '@ury/core';

interface AggregatorSetting {
  name?: string;
  aggregator: string;
  customer: string;
  price_list: string;
  mode_of_payment: string;
}

export const AggregatorPage: React.FC = () => {
  const { activeBranchId, activeBranch, branches } = useBranchContext();
  const [aggregators, setAggregators] = useState<AggregatorSetting[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  
  const [isDialogOpen, setIsDialogOpen] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [newAggregatorName, setNewAggregatorName] = useState('');

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

  useEffect(() => {
    if (branches.length > 0) {
      fetchBranchAggregators();
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
      });
      // 2. Create Price List
      await call('frappe.client.insert', {
        doc: { doctype: 'Price List', price_list_name: newAggregatorName, selling: 1, currency: 'INR' } // assume INR for now
      }).catch((e: any) => {
        const errorMessage = e?.message || e?.responseJSON?.message || String(e);
        const errorType = e?.exc_type || e?.responseJSON?.exc_type;

        // Only silently continue if this is a duplicate-entry error
        if (errorType === 'DuplicateEntryError' || errorMessage.includes('already exists')) {
          console.log('Price List might already exist', e);
        } else {
          throw e; // Re-throw non-duplicate errors
        }
      });
      // 3. Create Mode of Payment
      await call('frappe.client.insert', {
        doc: { doctype: 'Mode of Payment', mode_of_payment: newAggregatorName, type: 'Bank' }
      }).catch((e: any) => {
        const errorMessage = e?.message || e?.responseJSON?.message || String(e);
        const errorType = e?.exc_type || e?.responseJSON?.exc_type;

        // Only silently continue if this is a duplicate-entry error
        if (errorType === 'DuplicateEntryError' || errorMessage.includes('already exists')) {
          console.log('Mode of Payment might already exist', e);
        } else {
          throw e; // Re-throw non-duplicate errors
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
      setIsDialogOpen(false);
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

  const hasBranch = branches.length > 0;

  return (
    <div className="space-y-6">
      {/* Toolbar & Filters */}
      <Card className="p-4 rounded-lg border border-gray-200 bg-white shadow-xs">
        <div className="flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="font-semibold text-gray-700">Aggregator Settings</div>
          <div className="flex items-center space-x-3 w-full md:w-auto">
            <Button
              onClick={() => setIsDialogOpen(true)}
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
            onClick={() => setIsDialogOpen(true)}
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
            <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-500 font-semibold">
              <tr>
                <th className="px-6 py-4">Aggregator</th>
                <th className="px-6 py-4">Customer</th>
                <th className="px-6 py-4">Price List</th>
                <th className="px-6 py-4">Mode of Payment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {aggregators.map((item, idx) => (
                <tr key={idx} className="hover:bg-primary/10 transition-colors">
                  <td className="px-6 py-4 font-semibold text-gray-900">{item.aggregator}</td>
                  <td className="px-6 py-4">{item.customer}</td>
                  <td className="px-6 py-4">{item.price_list}</td>
                  <td className="px-6 py-4">{item.mode_of_payment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Modal */}
      {isDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <Card className="w-full max-w-md bg-white rounded-lg shadow-xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-lg font-bold text-gray-900">Add Aggregator</h2>
            </div>
            <form onSubmit={handleCreateAggregator} className="p-6 space-y-4 text-sm">
              <div>
                <label className="block font-semibold text-gray-700 mb-1">Aggregator Name</label>
                <Input
                  placeholder="Zomato"
                  value={newAggregatorName}
                  onChange={(e) => setNewAggregatorName(e.target.value)}
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  This will automatically create a Customer, Price List, and Mode of Payment with this name.
                </p>
              </div>
              
              <div className="pt-6 flex justify-end gap-2 border-t mt-4 border-gray-100">
                <Button type="button" variant="outline" onClick={() => setIsDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving} className="bg-primary hover:bg-primary/90 text-white">
                  {saving ? 'Creating...' : 'Create Aggregator'}
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
