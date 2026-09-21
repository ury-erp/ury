import { useCallback, useState } from 'react';
import { CustomerPicker as CustomerPickerView, type CustomerOption } from '@ury/ui';
import { addCustomer, searchCustomers } from '../lib/customer-api';
import { type Customer } from '../store/pos-store';
import { t } from '../i18n';

export interface CustomerPickerProps {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  disabled?: boolean;
}

function parseCustomer(row: { name: string; content?: string }): CustomerOption {
  return {
    id: row.name,
    name: row.content?.match(/Customer Name : ([^|]+)/)?.[1]?.trim() || row.name,
    phone: row.content?.match(/Mobile Number : ([^|]+)/)?.[1]?.trim() || '',
  };
}

export function CustomerPicker({ value, onChange, disabled }: CustomerPickerProps) {
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const handleSearch = useCallback((query: string) => {
    if (!query.trim()) {
      setResults([]);
      setSearching(false);
      setSearchError(null);
      return;
    }
    setSearching(true);
    setSearchError(null);
    searchCustomers(query)
      .then((rows) => {
        setResults(rows.map(parseCustomer));
        setSearchError(null);
      })
      .catch(() => {
        setResults([]);
        setSearchError(t('customer.failed_search'));
      })
      .finally(() => setSearching(false));
  }, []);

  return (
    <CustomerPickerView
      value={value}
      onChange={onChange}
      results={results}
      searching={searching}
      searchError={searchError}
      onSearch={handleSearch}
      disabled={disabled}
      onCreate={async ({ name, phone }) => {
        const response = await addCustomer({
          customer_name: name,
          mobile_number: phone,
        });
        const created = response.data;
        if (!created.name) {
          throw new Error('Customer created without document id');
        }
        return {
          id: created.name,
          name: created.customer_name,
          phone: created.mobile_number,
        };
      }}
      labels={{
        placeholder: t('customer.search_placeholder'),
        addNew: t('customer.add_new'),
        nameLabel: t('customer.name_label'),
        phoneLabel: t('customer.phone_label'),
        addButton: t('customer.add_button'),
        adding: t('customer.adding'),
        cancel: t('common.cancel'),
        changeLabel: t('common.change'),
        noResults: t('customer.no_customers_found'),
        searchFailed: t('customer.failed_search'),
        searching: t('common.searching'),
        createTitle: t('customer.add_customer_title'),
      }}
    />
  );
}
