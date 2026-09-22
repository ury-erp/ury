import React, { useCallback, useEffect, useState } from 'react';
import {
  Page,
  Section,
  DataTable,
  DataTableColumn,
  Card,
  Autocomplete,
  type AutocompleteOption,
  numericCellClass,
} from '@ury/ui';
import { call } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';
import { searchLinkOptions, withSelectedOption } from '../../services/linkSearch';
import { menuAvailabilityService } from '../../services/menuAvailability';

interface YieldVarianceRow {
  name: string;
  item: string;
  branch: string;
  actual_yield_percent: number;
  standard_yield_percent_snapshot: number;
  variance_percent: number;
  checked_on: string;
}

const ALL_ITEMS_OPTION: AutocompleteOption = { value: '', label: 'All items' };

const formatDateTime = (value?: string) => {
  if (!value) return '-';
  return new Date(value).toLocaleString();
};

const formatPercent = (value: number) => {
  return `${value.toFixed(2)}%`;
};

export const YieldVariancePage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [rows, setRows] = useState<YieldVarianceRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState('');
  const [itemOptions, setItemOptions] = useState<AutocompleteOption[]>([ALL_ITEMS_OPTION]);
  const [itemSearching, setItemSearching] = useState(false);
  const [company, setCompany] = useState<string | null>(null);

  // Fetch company from branch (fall back to default company if Branch.company is empty)
  useEffect(() => {
    let cancelled = false;
    if (!activeBranchId || activeBranchId === 'all') {
      setCompany(null);
      return;
    }

    setCompany(null);
    (async () => {
      try {
        const res = await call<{ message?: { company?: string }; company?: string }>(
          'frappe.client.get_value',
          {
            doctype: 'Branch',
            filters: activeBranchId,
            fieldname: 'company',
          }
        );
        const value = res?.message?.company ?? res?.company ?? '';
        if (value) {
          if (!cancelled) setCompany(value);
          return;
        }
        const fallback = await menuAvailabilityService.resolveDefaultCompany();
        if (!cancelled) setCompany(fallback || '');
      } catch {
        if (!cancelled) setCompany('');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeBranchId]);

  const searchItems = useCallback(
    async (query: string) => {
      setItemSearching(true);
      try {
        const options = await searchLinkOptions({
          doctype: 'Item',
          query,
          fields: ['name', 'item_name'],
          labelField: 'item_name',
          filters: [['is_stock_item', '=', 1]],
        });
        setItemOptions(
          withSelectedOption([ALL_ITEMS_OPTION, ...options], selectedItem)
        );
      } catch {
        setItemOptions(withSelectedOption([ALL_ITEMS_OPTION], selectedItem));
      } finally {
        setItemSearching(false);
      }
    },
    [selectedItem]
  );

  // Fetch yield variance data — wait for company so we never flash a scope error
  useEffect(() => {
    if (!activeBranchId || activeBranchId === 'all' || !company) {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }

    // Company still resolving
    if (company === null) {
      setRows([]);
      setError(null);
      setLoading(true);
      return;
    }

    // Resolved but missing — show empty, not an error flash
    if (!company) {
      setRows([]);
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await call<any>('ury.ury.api.ury_yield_variance.get_yield_variance', {
          company,
          branch: activeBranchId,
          item: selectedItem || undefined,
        });
        const data = (res as any)?.message || res || [];
        if (!cancelled) {
          setRows(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError('Unable to load yield variance data.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, company, selectedItem]);

  const columns: DataTableColumn<YieldVarianceRow>[] = [
    {
      key: 'item',
      header: 'Item',
      render: (row) => <span className="font-medium text-foreground">{row.item}</span>,
    },
    {
      key: 'branch',
      header: 'Branch',
      render: (row) => row.branch,
    },
    {
      key: 'standard_yield_percent_snapshot',
      header: 'Standard Yield %',
      align: 'right',
      render: (row) => (
        <span className={numericCellClass}>{formatPercent(row.standard_yield_percent_snapshot)}</span>
      ),
    },
    {
      key: 'actual_yield_percent',
      header: 'Latest Actual Yield %',
      align: 'right',
      render: (row) => (
        <span className={numericCellClass}>{formatPercent(row.actual_yield_percent)}</span>
      ),
    },
    {
      key: 'variance_percent',
      header: 'Variance %',
      align: 'right',
      render: (row) => (
        <span
          className={`${numericCellClass} ${
            row.variance_percent < 0 ? 'text-red-600' : 'text-green-600'
          }`}
        >
          {formatPercent(row.variance_percent)}
        </span>
      ),
    },
    {
      key: 'checked_on',
      header: 'Last Checked',
      render: (row) => formatDateTime(row.checked_on),
    },
  ];

  return (
    <Page>
      <div className="-mx-page-x -mt-page-top border-b border-border px-page-x pb-4 pt-page-top">
        <h1 className="text-xl font-semibold text-foreground">Yield Variance</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Track actual yield performance against standards and measure production efficiency.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex w-full max-w-sm flex-col text-xs font-medium text-muted-foreground">
            Item
            <Autocomplete
              id="yield-variance-item"
              value={selectedItem}
              onChange={setSelectedItem}
              onSearch={searchItems}
              options={itemOptions}
              searching={itemSearching}
              placeholder="All items"
              className="mt-1"
            />
          </label>
        </div>
      </div>

      {!activeBranchId || activeBranchId === 'all' ? (
        <Section>
          <Card className="p-10 text-center text-sm text-text-tertiary">Select a branch to view yield variance data.</Card>
        </Section>
      ) : (
        <Section>
          {error ? (
            <Card className="border-destructive-tint-border bg-destructive-tint p-6 text-sm text-destructive">{error}</Card>
          ) : (
            <DataTable
              columns={columns}
              rows={rows}
              isLoading={loading}
              emptyMessage="No yield checks found for this branch and filters."
            />
          )}
        </Section>
      )}
    </Page>
  );
};

export default YieldVariancePage;
