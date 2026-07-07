import { useState, useRef, useEffect } from 'react';
import { UserPlus, Phone, Loader, ChevronDown } from 'lucide-react';
import { Button, Dialog, DialogContent, Input } from './ui';
import { Select, SelectItem } from './ui';
import { addCustomer, type CreateCustomerData, searchCustomers } from '../lib/customer-api';
import { usePOSStore, type Customer } from '../store/pos-store';
import { t } from '../i18n';

export interface CustomerPickerProps {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  disabled?: boolean;
}

function NewCustomerForm({
  onClose,
  onSuccess,
  onCustomerCreated,
  isCreatingCustomer: parentIsCreatingCustomer,
  setIsCreatingCustomer: setParentIsCreatingCustomer,
  prefillName = '',
  prefillPhone = '',
}: {
  onClose: () => void;
  onSuccess?: () => void;
  onCustomerCreated: (customer: Customer) => void;
  isCreatingCustomer?: boolean;
  setIsCreatingCustomer?: React.Dispatch<React.SetStateAction<boolean>>;
  prefillName?: string;
  prefillPhone?: string;
}) {
  const { customerGroups, territories, fetchCustomerGroups, fetchTerritories } = usePOSStore();
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerGroup, setNewCustomerGroup] = useState('');
  const [newCustomerTerritory, setNewCustomerTerritory] = useState('');
  const [formError, setFormError] = useState(false);
  const [apiError, setApiError] = useState('');
  const [loadingGroups, setLoadingGroups] = useState(false);
  const [loadingTerritories, setLoadingTerritories] = useState(false);
  const [localIsCreatingCustomer, setLocalIsCreatingCustomer] = useState(false);
  const isCreatingCustomer = parentIsCreatingCustomer ?? localIsCreatingCustomer;
  const setIsCreatingCustomer = setParentIsCreatingCustomer ?? setLocalIsCreatingCustomer;

  useEffect(() => {
    if (prefillName) setNewCustomerName(prefillName);
    if (prefillPhone) setNewCustomerPhone(prefillPhone);
  }, [prefillName, prefillPhone]);

  useEffect(() => {
    if (!customerGroups.length) {
      setLoadingGroups(true);
      fetchCustomerGroups().finally(() => setLoadingGroups(false));
    }
    if (!territories.length) {
      setLoadingTerritories(true);
      fetchTerritories().finally(() => setLoadingTerritories(false));
    }
  }, [customerGroups.length, territories.length, fetchCustomerGroups, fetchTerritories]);

  async function handleAddCustomerSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newCustomerName || !newCustomerPhone) {
      setFormError(true);
      return;
    }

    setFormError(false);
    setApiError('');
    setIsCreatingCustomer(true);

    try {
      const customerData: CreateCustomerData = {
        customer_name: newCustomerName.trim(),
        mobile_number: newCustomerPhone.trim(),
      };
      if (newCustomerGroup) customerData.customer_group = newCustomerGroup;
      if (newCustomerTerritory) customerData.territory = newCustomerTerritory;

      const response = await addCustomer(customerData);
      const created = response.data;
      onCustomerCreated({
        id: created.name,
        name: created.customer_name,
        phone: created.mobile_number,
      });
      setNewCustomerName('');
      setNewCustomerPhone('');
      setNewCustomerGroup('');
      setNewCustomerTerritory('');
      onSuccess?.();
      onClose();
    } catch (error: unknown) {
      setApiError(error instanceof Error ? error.message : t('customer.failed_create'));
    } finally {
      setIsCreatingCustomer(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleAddCustomerSubmit}>
      {apiError && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3">
          <div className="text-sm text-red-600">{apiError}</div>
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="new-customer-name">
          {t('customer.name_label')} <span className="text-red-500">*</span>
        </label>
        <Input
          id="new-customer-name"
          type="text"
          value={newCustomerName}
          onChange={(e) => setNewCustomerName(e.target.value)}
          required
          disabled={isCreatingCustomer}
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700" htmlFor="new-customer-phone">
          {t('customer.phone_label')} <span className="text-red-500">*</span>
        </label>
        <div className="relative">
          <Input
            id="new-customer-phone"
            type="tel"
            value={newCustomerPhone}
            onChange={(e) => setNewCustomerPhone(e.target.value)}
            required
            disabled={isCreatingCustomer}
            className="pl-10"
          />
          <Phone className="absolute left-3 top-2.5 h-5 w-5 text-gray-400" />
        </div>
      </div>
      <div className="flex gap-3 mt-6">
        <Button type="submit" variant="default" className="flex-1" disabled={isCreatingCustomer}>
          {isCreatingCustomer ? (
            <>
              <Loader className="mr-2 h-4 w-4 animate-spin" />
              {t('customer.adding')}
            </>
          ) : (
            t('customer.add_button')
          )}
        </Button>
        <Button type="button" variant="outline" onClick={onClose} disabled={isCreatingCustomer}>
          {t('common.cancel')}
        </Button>
      </div>
    </form>
  );
}

export function CustomerPicker({ value, onChange, disabled }: CustomerPickerProps) {
  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [isCreatingCustomer, setIsCreatingCustomer] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const [searchResults, setSearchResults] = useState<Array<{ name: string; content?: string }>>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [prefillName, setPrefillName] = useState('');
  const [prefillPhone, setPrefillPhone] = useState('');

  useEffect(() => {
    if (!isOpen || !searchTerm.trim()) {
      setSearchResults([]);
      setSearchError(null);
      setIsSearching(false);
      return;
    }
    setIsSearching(true);
    const handler = setTimeout(() => {
      searchCustomers(searchTerm)
        .then((results) => {
          setSearchResults(results);
          setIsSearching(false);
        })
        .catch(() => {
          setSearchError(t('customer.failed_search'));
          setIsSearching(false);
        });
    }, 300);
    return () => clearTimeout(handler);
  }, [searchTerm, isOpen]);

  const parseCustomer = (customer: { name: string; content?: string }): Customer => ({
    id: customer.name,
    name: customer.content?.match(/Customer Name : ([^|]+)/)?.[1]?.trim() || customer.name,
    phone: customer.content?.match(/Mobile Number : ([^|]+)/)?.[1]?.trim() || '',
  });

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
    } else if (e.key === 'Enter' && isOpen) {
      if (highlightedIndex === searchResults.length) {
        setShowNewCustomerForm(true);
        setIsOpen(false);
      } else if (searchResults[highlightedIndex]) {
        onChange(parseCustomer(searchResults[highlightedIndex]));
        setSearchTerm('');
        setIsOpen(false);
      }
    } else if (e.key === 'Escape') {
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      {value ? (
        <div className="flex items-center justify-between rounded-lg bg-blue-50 p-3">
          <div>
            <p className="font-medium text-blue-900">{value.name}</p>
            <p className="text-sm text-blue-700">{value.phone}</p>
          </div>
          <Button
            onClick={() => onChange(null)}
            disabled={disabled}
            variant="ghost"
            size="sm"
            className="text-blue-700 hover:text-blue-800"
          >
            {t('common.change')}
          </Button>
        </div>
      ) : (
        <div className="relative">
          <input
            type="text"
            value={searchTerm}
            disabled={disabled}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setIsOpen(true);
              setHighlightedIndex(0);
            }}
            onFocus={() => setIsOpen(true)}
            onBlur={() => setTimeout(() => setIsOpen(false), 100)}
            onKeyDown={handleKeyDown}
            placeholder={t('customer.search_placeholder')}
            className="h-10 w-full rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            autoComplete="off"
          />
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          {isOpen && (
            <div className="absolute z-50 mt-2 max-h-80 w-full overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-lg">
              {isSearching && (
                <div className="flex items-center justify-center p-4 text-sm text-gray-500">
                  <Loader className="mr-2 h-4 w-4 animate-spin" /> {t('common.searching')}
                </div>
              )}
              {searchError && <div className="p-4 text-center text-sm text-red-500">{searchError}</div>}
              {searchResults.map((customer, idx) => {
                const parsed = parseCustomer(customer);
                return (
                  <button
                    key={customer.name}
                    type="button"
                    className={`w-full px-4 py-2 text-left text-sm ${
                      idx === highlightedIndex ? 'bg-primary-50 text-primary-700' : 'hover:bg-gray-50'
                    }`}
                    onMouseDown={() => {
                      onChange(parsed);
                      setSearchTerm('');
                      setIsOpen(false);
                    }}
                  >
                    <div className="font-medium">{parsed.name}</div>
                    <div className="text-xs text-gray-500">{parsed.phone}</div>
                  </button>
                );
              })}
              <button
                type="button"
                className="flex w-full items-center gap-2 px-4 py-2 text-sm font-medium text-primary-600 hover:bg-gray-50"
                onMouseDown={() => {
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
              >
                <UserPlus className="h-4 w-4" /> {t('customer.add_new')}
              </button>
            </div>
          )}
        </div>
      )}
      {showNewCustomerForm && (
        <Dialog open={showNewCustomerForm} onOpenChange={setShowNewCustomerForm}>
          <DialogContent className="max-h-[80vh] w-full max-w-md overflow-y-auto p-4">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">{t('customer.add_customer_title')}</h3>
            <NewCustomerForm
              onClose={() => setShowNewCustomerForm(false)}
              onCustomerCreated={onChange}
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
