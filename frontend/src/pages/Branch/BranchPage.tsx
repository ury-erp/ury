import React, { useState } from 'react';
import {
  Building2,
  Search,
  Plus,
  Edit2,
  Copy,
  Archive,
  MapPin,
  Receipt,
  ShoppingBag,
  Hash
} from 'lucide-react';
import { Button, Input, Card } from '@ury/ui';
import Drawer from '../../components/common/Drawer';
import branchSchema from '../../data/schemas/branch.json';

export interface BranchItem {
  id: string;
  branch_name: string;
  invoice_series_prefix: string;
  aggregator_series_prefix: string;
  tax_id: string;
  address: string;
  is_archived?: boolean;
}

const INITIAL_BRANCHES: BranchItem[] = [
  {
    id: 'br-1',
    branch_name: 'Main Branch - Downtown',
    invoice_series_prefix: 'INV-MAIN-',
    aggregator_series_prefix: 'AGG-MAIN-',
    tax_id: 'TAX-9948201-US',
    address: '100 Grand Avenue, Suite 100, Central City',
    is_archived: false,
  },
  {
    id: 'br-2',
    branch_name: 'Westside Express Outlet',
    invoice_series_prefix: 'INV-WEST-',
    aggregator_series_prefix: 'AGG-WEST-',
    tax_id: 'TAX-9948202-US',
    address: '45 West Boulevard, Westside Plaza',
    is_archived: false,
  },
  {
    id: 'br-3',
    branch_name: 'Harbor Bay Waterfront',
    invoice_series_prefix: 'INV-BAY-',
    aggregator_series_prefix: 'AGG-BAY-',
    tax_id: 'TAX-9948203-US',
    address: '88 Pier Pierhead Way, Harbor District',
    is_archived: false,
  },
];

export const BranchPage: React.FC = () => {
  const [branches, setBranches] = useState<BranchItem[]>(INITIAL_BRANCHES);
  const [searchQuery, setSearchQuery] = useState('');

  // Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingBranchId, setEditingBranchId] = useState<string | null>(null);

  // Form State
  const [branchName, setBranchName] = useState('');
  const [invoicePrefix, setInvoicePrefix] = useState('INV-MAIN-');
  const [aggregatorPrefix, setAggregatorPrefix] = useState('AGG-MAIN-');
  const [taxId, setTaxId] = useState('');
  const [address, setAddress] = useState('');

  const openCreateDrawer = () => {
    setEditingBranchId(null);
    setBranchName('');
    setInvoicePrefix(branchSchema.properties.invoice_series_prefix.default || 'INV-NEW-');
    setAggregatorPrefix(branchSchema.properties.aggregator_series_prefix.default || 'AGG-NEW-');
    setTaxId('');
    setAddress('');
    setIsDrawerOpen(true);
  };

  const openEditDrawer = (branch: BranchItem) => {
    setEditingBranchId(branch.id);
    setBranchName(branch.branch_name);
    setInvoicePrefix(branch.invoice_series_prefix);
    setAggregatorPrefix(branch.aggregator_series_prefix);
    setTaxId(branch.tax_id);
    setAddress(branch.address);
    setIsDrawerOpen(true);
  };

  const handleDuplicate = (branch: BranchItem) => {
    const duplicated: BranchItem = {
      id: `br-${Date.now()}`,
      branch_name: `${branch.branch_name} (Copy)`,
      invoice_series_prefix: `${branch.invoice_series_prefix}CP-`,
      aggregator_series_prefix: `${branch.aggregator_series_prefix}CP-`,
      tax_id: branch.tax_id,
      address: branch.address,
      is_archived: false,
    };
    setBranches([...branches, duplicated]);
  };

  const handleArchive = (id: string) => {
    setBranches(
      branches.map((b) =>
        b.id === id ? { ...b, is_archived: !b.is_archived } : b
      )
    );
  };

  const handleSaveBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim()) return;

    if (editingBranchId) {
      setBranches(
        branches.map((b) =>
          b.id === editingBranchId
            ? {
                ...b,
                branch_name: branchName,
                invoice_series_prefix: invoicePrefix,
                aggregator_series_prefix: aggregatorPrefix,
                tax_id: taxId,
                address,
              }
            : b
        )
      );
    } else {
      const newBranch: BranchItem = {
        id: `br-${Date.now()}`,
        branch_name: branchName,
        invoice_series_prefix: invoicePrefix,
        aggregator_series_prefix: aggregatorPrefix,
        tax_id: taxId,
        address,
        is_archived: false,
      };
      setBranches([...branches, newBranch]);
    }
    setIsDrawerOpen(false);
  };

  const filteredBranches = branches.filter((b) =>
    b.branch_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.tax_id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    b.address.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50/50 p-6 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-6 rounded-xl border border-gray-200 shadow-xs">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-[#7C3AED]/10 text-[#7C3AED] flex items-center justify-center font-semibold shrink-0">
              <Building2 className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Branch Management</h1>
              <p className="text-sm text-gray-500">Configure outlet locations, tax registration IDs, and billing series prefixes.</p>
            </div>
          </div>
          <Button
            onClick={openCreateDrawer}
            className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add Branch
          </Button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 shadow-xs">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <Input
              type="text"
              placeholder="Search branches..."
              value={searchQuery}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(e.target.value)}
              className="pl-9 bg-gray-50/50"
            />
          </div>
        </div>

        {/* Branch Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredBranches.map((branch) => (
            <Card
              key={branch.id}
              className={`rounded-xl border bg-white p-6 shadow-xs flex flex-col justify-between hover:shadow-md transition-shadow ${
                branch.is_archived ? 'opacity-60 border-dashed border-gray-300 bg-gray-50' : 'border-gray-200'
              }`}
            >
              <div className="space-y-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-gray-900 text-lg">{branch.branch_name}</h3>
                      {branch.is_archived && (
                        <span className="text-xs bg-gray-200 text-gray-700 px-2 py-0.5 rounded-full font-medium">
                          Archived
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <MapPin className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                      <span className="line-clamp-1">{branch.address || 'No address provided'}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-gray-100 text-xs">
                  <div className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <span className="text-gray-500 font-medium flex items-center gap-1">
                      <Hash className="w-3.5 h-3.5 text-gray-400" /> Tax ID:
                    </span>
                    <span className="font-semibold text-gray-800">{branch.tax_id || 'N/A'}</span>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="p-2 bg-purple-50/50 border border-purple-100 rounded-lg">
                      <span className="text-purple-600 font-medium flex items-center gap-1 text-[11px]">
                        <Receipt className="w-3 h-3" /> Invoice Prefix:
                      </span>
                      <span className="font-bold text-purple-900 text-xs block mt-0.5">
                        {branch.invoice_series_prefix}
                      </span>
                    </div>

                    <div className="p-2 bg-blue-50/50 border border-blue-100 rounded-lg">
                      <span className="text-blue-600 font-medium flex items-center gap-1 text-[11px]">
                        <ShoppingBag className="w-3 h-3" /> Aggregator Prefix:
                      </span>
                      <span className="font-bold text-blue-900 text-xs block mt-0.5">
                        {branch.aggregator_series_prefix}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Toolbar */}
              <div className="mt-5 pt-3 border-t border-gray-100 flex items-center justify-between gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => openEditDrawer(branch)}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Edit2 className="w-3.5 h-3.5 text-[#7C3AED]" />
                  Edit
                </Button>

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleDuplicate(branch)}
                    className="p-2 text-gray-500 hover:text-gray-900 hover:bg-gray-100 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors"
                    title="Duplicate Branch"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    Duplicate
                  </button>
                  <button
                    onClick={() => handleArchive(branch.id)}
                    className={`p-2 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors ${
                      branch.is_archived
                        ? 'text-emerald-600 hover:bg-emerald-50'
                        : 'text-amber-600 hover:bg-amber-50'
                    }`}
                    title={branch.is_archived ? 'Restore Branch' : 'Archive Branch'}
                  >
                    <Archive className="w-3.5 h-3.5" />
                    {branch.is_archived ? 'Unarchive' : 'Archive'}
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </div>

      {/* Drawer */}
      <Drawer
        isOpen={isDrawerOpen}
        onClose={() => setIsDrawerOpen(false)}
        title={editingBranchId ? 'Edit Branch' : 'Add New Branch'}
        subtitle="Configure branch identification, tax registration, and automated voucher numbering prefixes."
        footer={
          <>
            <Button variant="outline" onClick={() => setIsDrawerOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveBranch} className="bg-[#7C3AED] hover:bg-[#6D28D9] text-white">
              {editingBranchId ? 'Update Branch' : 'Create Branch'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleSaveBranch} className="space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Branch Name *</label>
            <Input
              value={branchName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setBranchName(e.target.value)}
              placeholder="e.g. Downtown Flagship Outlet"
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice Series Prefix *</label>
              <Input
                value={invoicePrefix}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setInvoicePrefix(e.target.value)}
                placeholder="INV-MAIN-"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Aggregator Series Prefix</label>
              <Input
                value={aggregatorPrefix}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => setAggregatorPrefix(e.target.value)}
                placeholder="AGG-MAIN-"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tax Registration ID</label>
            <Input
              value={taxId}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTaxId(e.target.value)}
              placeholder="e.g. TAX-9948201-US"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Physical Address</label>
            <textarea
              rows={3}
              value={address}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setAddress(e.target.value)}
              placeholder="Full street address, city, and zip code"
              className="w-full rounded-md border border-gray-200 p-3 text-sm focus:border-[#7C3AED] focus:ring-[#7C3AED] focus:outline-none"
            />
          </div>
        </form>
      </Drawer>
    </div>
  );
};

export default BranchPage;
