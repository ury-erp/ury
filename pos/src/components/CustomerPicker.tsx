import { useCallback, useEffect, useState } from 'react';
import { CustomerPicker as CustomerPickerView, type CustomerOption } from '@ury/ui';
import { addCustomer, searchCustomers, getCustomersByOrderType } from '../lib/customer-api';
import { type Customer, usePOSStore } from '../store/pos-store';
import { useRootStore } from '../store/root-store';
import { t } from '../i18n';

export interface CustomerPickerProps {
  value: Customer | null;
  onChange: (customer: Customer | null) => void;
  disabled?: boolean;
  orderType?: string;
}

function parseCustomer(row: { name: string; content?: string }): CustomerOption {
  return {
    id: row.name,
    name: row.content?.match(/Customer Name : ([^|]+)/)?.[1]?.trim() || row.name,
    phone: row.content?.match(/Mobile Number : ([^|]+)/)?.[1]?.trim() || '',
  };
}

export function CustomerPicker({ value, onChange, disabled, orderType }: CustomerPickerProps) {
  const posStoreProfile = usePOSStore((state) => state.posProfile);
  const rootStoreProfile = useRootStore((state) => state.posProfile);
  const posProfile = posStoreProfile || rootStoreProfile;

  const country =
    posProfile?.country ||
    (() => {
      try {
        const raw = sessionStorage.getItem('posProfile');
        return raw ? JSON.parse(raw)?.country : undefined;
      } catch {
        return undefined;
      }
    })() ||
    (typeof window !== 'undefined' && ((window as any)?.frappe?.boot?.sysdefaults?.country || (window as any)?.frappe?.boot?.country)) ||
    undefined;
  const [results, setResults] = useState<CustomerOption[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const fetchCustomers = useCallback((query: string, currentOrderType?: string) => {
    if (currentOrderType && typeof getCustomersByOrderType === 'function') {
      setSearching(true);
      setSearchError(null);
      getCustomersByOrderType(currentOrderType, query)
        .then((rows) => {
          setResults(rows.map(parseCustomer));
          setSearchError(null);
        })
        .catch(() => {
          setResults([]);
          setSearchError(t('customer.failed_search'));
        })
        .finally(() => setSearching(false));
      return;
    }

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

  const handleSearch = useCallback(
    (query: string) => {
      fetchCustomers(query, orderType);
    },
    [fetchCustomers, orderType]
  );

  useEffect(() => {
    if (orderType && typeof getCustomersByOrderType === 'function') {
      fetchCustomers('', orderType);
    }
  }, [orderType, fetchCustomers]);

  return (
    <CustomerPickerView
      value={value}
      onChange={onChange}
      results={results}
      searching={searching}
      searchError={searchError}
      onSearch={handleSearch}
      disabled={disabled}
      resultsHeader={orderType ? `${orderType} Customers` : undefined}
      country={country}
      onCreate={async ({ name, phone }) => {
        const response = await addCustomer({
          customer_name: name,
          mobile_number: phone,
          pos_profile: posProfile?.name,
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
        invalidPhone: posProfile?.country ? t('customer.phone_invalid', { country: posProfile.country }) : undefined,
      }}
    />
  );
}

