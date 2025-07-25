import { useState, useRef, useEffect } from 'react';
import { UserPlus, Mail, Phone, Loader } from 'lucide-react';
import { usePOSStore, type Customer } from '../store/pos-store';
import { Button, Dialog, DialogContent, Input } from './ui';
import { Select, SelectItem } from './ui';
import { ChevronDown } from 'lucide-react';
import React from 'react';
import { addCustomer, type CreateCustomerData, searchCustomers } from '../lib/customer-api';
import { AggregatorSelect } from './AggregatorSelect';

// NewCustomerForm component
function NewCustomerForm({ 
  onClose, 
  onSuccess, 
  isCreatingCustomer: parentIsCreatingCustomer, 
  setIsCreatingCustomer: setParentIsCreatingCustomer, 
  prefillName = '',
  prefillPhone = ''
}: { 
  onClose: () => void; 
  onSuccess?: () => void;
  isCreatingCustomer?: boolean;
  setIsCreatingCustomer?: React.Dispatch<React.SetStateAction<boolean>>;
  prefillName?: string;
  prefillPhone?: string;
}) {
  const { customerGroups, territories, fetchCustomerGroups, fetchTerritories, setSelectedCustomer } = usePOSStore();
  const [newCustomerName, setNewCustomerName] = React.useState('');
  const [newCustomerPhone, setNewCustomerPhone] = React.useState('');
  const [newCustomerGroup, setNewCustomerGroup] = React.useState("");
  const [newCustomerTerritory, setNewCustomerTerritory] = React.useState("");
  const [formError, setFormError] = React.useState(false);
  const [apiError, setApiError] = React.useState<string>("");
  const [loadingGroups, setLoadingGroups] = React.useState(false);
  const [loadingTerritories, setLoadingTerritories] = React.useState(false);
  
  // Use parent loading state if available, otherwise fallback to local state
  const [localIsCreatingCustomer, setLocalIsCreatingCustomer] = React.useState(false);
  const isCreatingCustomer = parentIsCreatingCustomer ?? localIsCreatingCustomer;
  const setIsCreatingCustomer = setParentIsCreatingCustomer ?? setLocalIsCreatingCustomer;

  // Handle prefill values
  React.useEffect(() => {
    if (prefillName) {
      setNewCustomerName(prefillName);
    }
    if (prefillPhone) {
      setNewCustomerPhone(prefillPhone);
    }
  }, [prefillName, prefillPhone]);

  // Fetch groups/territories on mount
  React.useEffect(() => {
    if (!customerGroups.length) {
      setLoadingGroups(true);
      fetchCustomerGroups().finally(() => setLoadingGroups(false));
    }
    if (!territories.length) {
      setLoadingTerritories(true);
      fetchTerritories().finally(() => setLoadingTerritories(false));
    }
  }, []);



  async function handleAddCustomerSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newCustomerName || !newCustomerPhone) {
      setFormError(true);
      return;
    }

    setFormError(false);
    setApiError("");
    setIsCreatingCustomer(true);

    try {
      const customerData: CreateCustomerData = {
        customer_name: newCustomerName.trim(),
        mobile_number: newCustomerPhone.trim(),
      };

      // Add optional fields only if they have values
      if (newCustomerGroup) {
        customerData.customer_group = newCustomerGroup;
      }
      if (newCustomerTerritory) {
        customerData.territory = newCustomerTerritory;
      }

      const response = await addCustomer(customerData);
      const created = response.data;
      // Set selected customer in POS store
      setSelectedCustomer({
        id: created.name,
        name: created.customer_name,
        phone: created.mobile_number,
      });
      // Reset form on success
      setNewCustomerName("");
      setNewCustomerPhone("");
      setNewCustomerGroup("");
      setNewCustomerTerritory("");
      if (onSuccess) onSuccess();
      onClose();
    } catch (error: any) {
      console.error('Failed to create customer:', error);
      setApiError(error?.message || 'Failed to create customer. Please try again.');
    } finally {
      setIsCreatingCustomer(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleAddCustomerSubmit}>
      {apiError && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <div className="text-sm text-red-600">{apiError}</div>
        </div>
      )}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="new-customer-name">Name <span className="text-red-500">*</span></label>
        <Input
          id="new-customer-name"
          type="text"
          value={newCustomerName}
          onChange={e => setNewCustomerName(e.target.value)}
          required
          disabled={isCreatingCustomer}
          aria-invalid={!!formError && !newCustomerName}
        />
        {formError && !newCustomerName && (
          <div className="text-xs text-red-500 mt-1">Name is required</div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="new-customer-phone">Phone <span className="text-red-500">*</span></label>
        <div className="relative">
          <Input
            id="new-customer-phone"
            type="tel"
            value={newCustomerPhone}
            onChange={e => setNewCustomerPhone(e.target.value)}
            required
            disabled={isCreatingCustomer}
            className="pl-10"
            aria-invalid={!!formError && !newCustomerPhone}
          />
          <Phone className="absolute left-3 top-2.5 text-gray-400 w-5 h-5" />
        </div>
        {formError && !newCustomerPhone && (
          <div className="text-xs text-red-500 mt-1">Phone is required</div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Customer Group</label>
        <Select
          placeholder={loadingGroups ? 'Loading...' : 'Select group'}
          value={newCustomerGroup}
          onValueChange={setNewCustomerGroup}
          disabled={isCreatingCustomer || loadingGroups || !customerGroups.length}
        >
          {customerGroups.map((group) => (
            <SelectItem key={group} value={group} className="capitalize">
              {group}
            </SelectItem>
          ))}
        </Select>
        {!loadingGroups && !customerGroups.length && (
          <div className="text-xs text-gray-400 mt-1">No options</div>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Territory</label>
        <Select
          placeholder={loadingTerritories ? 'Loading...' : 'Select territory'}
          value={newCustomerTerritory}
          onValueChange={setNewCustomerTerritory}
          disabled={isCreatingCustomer || loadingTerritories || !territories.length}
        >
          {territories.map((territory) => (
            <SelectItem key={territory} value={territory} className="capitalize">
              {territory}
            </SelectItem>
          ))}
        </Select>
        {!loadingTerritories && !territories.length && (
          <div className="text-xs text-gray-400 mt-1">No options</div>
        )}
      </div>
      <div className="flex gap-3 mt-6">
        <Button
          type="submit"
          variant="default"
          className="flex-1"
          disabled={isCreatingCustomer}
        >
          {isCreatingCustomer ? (
            <>
              <Loader className="w-4 h-4 mr-2 animate-spin" />
              Adding Customer...
            </>
          ) : (
            'Add Customer'
          )}
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={isCreatingCustomer}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

interface CustomerSelectProps {
  disabled?: boolean;
}

export function CustomerSelect({ disabled }: CustomerSelectProps) {
  const { selectedCustomer, setSelectedCustomer, selectedOrderType, isUpdatingOrder } = usePOSStore();
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [prefillName, setPrefillName] = useState('');
  const [prefillPhone, setPrefillPhone] = useState('');

  // Debounced search
  useEffect(() => {
    if (!isOpen || !searchTerm.trim()) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    setSearchError(null);
    const handler = setTimeout(() => {
      searchCustomers(searchTerm)
        .then(results => {
          setSearchResults(results);
          setIsSearching(false);
        })
        .catch(err => {
          setSearchError('Failed to search customers');
          setIsSearching(false);
        });
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm, isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsOpen(true);
      setHighlightedIndex(0);
      return;
    }
    if (e.key === 'ArrowDown') {
      setHighlightedIndex((prev) => Math.min(prev + 1, searchResults.length));
      e.preventDefault();
    } else if (e.key === 'ArrowUp') {
      setHighlightedIndex((prev) => Math.max(prev - 1, 0));
      e.preventDefault();
    } else if (e.key === 'Enter') {
      if (isOpen) {
        if (highlightedIndex === searchResults.length) {
          setShowNewCustomerForm(true);
          setIsOpen(false);
        } else if (searchResults[highlightedIndex]) {
          // The API returns { name, content, ... }
          const customer = searchResults[highlightedIndex];
          setSelectedCustomer({
            id: customer.name,
            name: customer.content?.match(/Customer Name : ([^|]+)/)?.[1]?.trim() || customer.name,
            phone: customer.content?.match(/Mobile Number : ([^|]+)/)?.[1]?.trim() || '',
          });
          setSearchTerm('');
          setIsOpen(false);
        }
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  if (selectedOrderType === 'Aggregators') {
    return <AggregatorSelect />;
  }

  return (
    <div className="relative">
      {selectedCustomer ? (
        <div className="flex items-center justify-between bg-blue-50 p-3 rounded-lg">
          <div>
            <p className="font-medium text-blue-900">{selectedCustomer.name}</p>
            <p className="text-sm text-blue-700">{selectedCustomer.phone}</p>
          </div>
          <Button
            onClick={() => setSelectedCustomer(null)}
            disabled={isUpdatingOrder}
            variant="ghost"
            size="sm"
            className="text-blue-700 hover:text-blue-800"
          >
            Change
          </Button>
        </div>
      ) : (
        <div className="relative">
          <div className="flex items-center relative">
            <input
              ref={inputRef}
              type="text"
              value={searchTerm}
              onChange={e => {
                setSearchTerm(e.target.value);
                setIsOpen(true);
                setHighlightedIndex(0);
              }}
              onFocus={() => setIsOpen(true)}
              onBlur={e => {
                setTimeout(() => setIsOpen(false), 100);
              }}
              onKeyDown={handleKeyDown}
              placeholder="Search customer..."
              className="w-full h-10 border border-gray-200 rounded-lg px-4 py-2 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 transition-colors"
              aria-label="Search customer"
              autoComplete="off"
            />
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>
          {isOpen && (
            <div className="absolute w-full mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-80 overflow-y-auto">
              {searchTerm.trim() === '' && !isSearching && !searchError && (
                <div className="p-4 text-center text-gray-400 text-sm select-none">Please type to search...</div>
              )}
              {isSearching && (
                <div className="flex items-center justify-center p-4 text-gray-500 text-sm select-none">
                  <Loader className="w-4 h-4 mr-2 animate-spin" /> Searching...
                </div>
              )}
              {searchError && (
                <div className="p-4 text-center text-red-500 text-sm select-none">{searchError}</div>
              )}
              {!isSearching && !searchError && searchResults.length > 0 && searchResults.map((customer, idx) => {
                const name = customer.content?.match(/Customer Name : ([^|]+)/)?.[1]?.trim() || customer.name;
                const phone = customer.content?.match(/Mobile Number : ([^|]+)/)?.[1]?.trim() || '';
                return (
                  <button
                    key={customer.name}
                    type="button"
                    className={`w-full gap-2 px-4 py-2 text-left rounded-md text-gray-800 text-sm select-none transition-colors ${
                      idx === highlightedIndex ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50'
                    }`}
                    onMouseDown={() => {
                      setSelectedCustomer({ id: customer.name, name, phone });
                      setSearchTerm('');
                      setIsOpen(false);
                    }}
                    onMouseEnter={() => setHighlightedIndex(idx)}
                  >
                    <div className="font-medium">{name}</div>
                    <div className="ml-auto text-xs text-gray-500">{phone}</div>
                  </button>
                );
              })}
              {!isSearching && !searchError && searchResults.length === 0 && searchTerm.trim() && (
                <div className="p-4 text-center text-gray-400 text-sm select-none">No customers found</div>
              )}
              <div className="my-1 h-px bg-gray-100" />
              <button
                type="button"
                className={`flex items-center gap-2 w-full px-4 py-2 text-primary-600 hover:text-primary-700 hover:bg-gray-50 font-medium rounded-md text-sm select-none transition-colors ${
                  highlightedIndex === searchResults.length ? 'bg-primary-50' : ''
                }`}
                onMouseDown={() => {
                  // Prefill logic
                  if (/^\d+$/.test(searchTerm.trim())) {
                    setPrefillPhone(searchTerm.trim());
                    setPrefillName('');
                  } else {
                    setPrefillName(searchTerm.trim());
                    setPrefillPhone('');
                  }
                  setShowNewCustomerForm(true);
                  setIsOpen(false);
                }}
                onMouseEnter={() => setHighlightedIndex(searchResults.length)}
              >
                <UserPlus className="w-4 h-4" /> {searchTerm.trim() ? `Add "${searchTerm.trim()}"...` : 'Add New Customer'}
              </button>
            </div>
          )}
        </div>
      )}
      {showNewCustomerForm && (
        <Dialog 
          open={showNewCustomerForm} 
          onOpenChange={(open) => {
            // Prevent closing the dialog when creating customer
            if (!isCreatingCustomer) {
              setShowNewCustomerForm(open);
            }
          }}
        >
          <DialogContent className="w-full max-w-md p-4 max-h-[80vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Customer</h3>
            <NewCustomerForm 
              onClose={() => setShowNewCustomerForm(false)} 
              isCreatingCustomer={isCreatingCustomer}
              setIsCreatingCustomer={setIsCreatingCustomer}
              prefillName={prefillName}
              prefillPhone={prefillPhone}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
} 