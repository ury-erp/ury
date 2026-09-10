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

interface DueYieldCheckRow {
  item: string;
  item_name: string;
  cadence: string;
  reason: string;
  days_overdue?: number;
}

export const OverdueYieldChecksPage: React.FC = () => {
  const { activeBranchId } = useBranchContext();
  const [rows, setRows] = useState<DueYieldCheckRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedBranch, setSelectedBranch] = useState('');
  const [branches, setBranches] = useState<{ name: string }[]>([]);

  // Fetch branches for selector
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await call<any>('frappe.client.get_list', {
          doctype: 'Branch',
          fields: ['name'],
          limit_page_length: 0,
          order_by: 'name asc',
        });
        const data = (res as any)?.message || res || [];
        if (!cancelled) {
          setBranches(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) setBranches([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Set initial branch when context updates
  useEffect(() => {
    if (activeBranchId && activeBranchId !== 'all' && !selectedBranch) {
      setSelectedBranch(activeBranchId);
    }
  }, [activeBranchId, selectedBranch]);

  // Fetch overdue checks
  useEffect(() => {
    const branch = selectedBranch || activeBranchId;
    if (!branch || branch === 'all') {
      setRows([]);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await call<any>('ury.ury.services.yield_check_reminders.get_due_yield_checks_api', {
          branch: branch,
        });
        const data = (res as any)?.message || res || [];
        if (!cancelled) {
          setRows(Array.isArray(data) ? data : []);
        }
      } catch {
        if (!cancelled) {
          setRows([]);
          setError('Unable to load overdue yield checks.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeBranchId, selectedBranch]);

  const columns: DataTableColumn<DueYieldCheckRow>[] = [
    {
      key: 'item_name',
      header: 'Item',
      render: (row) => (
        <div>
          <div className="font-medium text-foreground">{row.item_name}</div>
          <div className="text-xs text-muted-foreground">{row.item}</div>
        </div>
      ),
    },
    {
      key: 'cadence',
      header: 'Cadence',
      render: (row) => row.cadence,
    },
    {
      key: 'reason',
      header: 'Reason',
      render: (row) => row.reason,
    },
    {
      key: 'days_overdue',
      header: 'Days Overdue',
      align: 'right',
      render: (row) => (
        <span className={numericCellClass}>
          {row.days_overdue !== undefined ? row.days_overdue : '-'}
        </span>
      ),
    },
  ];

  const currentBranch = selectedBranch || activeBranchId;

  return (
    <Page>
      <div className="-mx-page-x -mt-page-top border-b border-border px-page-x pb-4 pt-page-top">
        <h1 className="text-xl font-semibold text-foreground">Overdue Yield Checks</h1>
        <p className="mt-1 text-sm text-text-tertiary">
          Items that are due for yield checks based on their configured cadence.
        </p>

        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex flex-col text-xs font-medium text-muted-foreground">
            Branch
            <Select
              aria-label="Branch"
              size="sm"
              value={currentBranch || ''}
              onChange={(event) => setSelectedBranch(event.target.value)}
              className="mt-1"
            >
              <option value="">Select a branch</option>
              {branches.map((branch) => (
                <option key={branch.name} value={branch.name}>
                  {branch.name}
                </option>
              ))}
            </Select>
          </label>
        </div>
      </div>

      {!currentBranch || currentBranch === 'all' ? (
        <Section>
          <Card className="p-10 text-center text-sm text-text-tertiary">Select a branch to view overdue yield checks.</Card>
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
              emptyMessage="No overdue yield checks for this branch."
            />
          )}
        </Section>
      )}
    </Page>
  );
};

export default OverdueYieldChecksPage;
