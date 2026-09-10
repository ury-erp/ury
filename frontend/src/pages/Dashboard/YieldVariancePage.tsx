import React, { useEffect, useState } from 'react';
import {
  Page,
  Section,
  DataTable,
  DataTableColumn,
  Card,
  Select,
  numericCellClass,
} from '@ury/ui';
import { call } from '@ury/core';
import { useBranchContext } from '../../context/BranchContext';

interface YieldVarianceRow {
  name: string;
  item: string;
  branch: string;
  actual_yield_percent: number;
  standard_yield_percent_snapshot: number;
  variance_percent: number;
  checked_on: string;
}

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
  const [itemOptions, setItemOptions] = useState<{ name: string; item_name?: string }[]>([]);

  // Fetch available items for filtering
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await call<any>('frappe.client.get_list', {
          doctype: 'Item',
          fields: ['name', 'item_name'],
          filters: [['is_stock_item', '=', 1]],
          limit_page_length: 500,
          order_by: 'item_name asc',
        });
        const data = (res as any)?.message || res || [];
        if (!cancelled) {
          setItemOptions(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) setItemOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch yield variance data
  useEffect(() => {
    if (!activeBranchId || activeBranchId === 'all') {
      setRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await call<any>('ury.ury.api.ury_yield_variance.get_yield_variance', {
          company: 'Default Company', // In real scenario, get from context
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
  }, [activeBranchId, selectedItem]);

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
          <label className="flex flex-col text-xs font-medium text-muted-foreground">
            Item
            <Select
              aria-label="Item"
              size="sm"
              value={selectedItem}
              onChange={(event) => setSelectedItem(event.target.value)}
              className="mt-1"
            >
              <option value="">All items</option>
              {itemOptions.map((item) => (
                <option key={item.name} value={item.name}>
                  {item.item_name || item.name}
                </option>
              ))}
            </Select>
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
